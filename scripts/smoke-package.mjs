import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { verifyPackage } from './verify-package.mjs';
const target = process.platform === 'win32' ? 'win-x64' : process.platform + '-x64';
const source = resolve(process.argv[2] ?? `dist/release/${target}`);
const reportPath = process.argv[3] && resolve(process.argv[3]);
const report = {
  format: 1,
  platform: process.platform,
  arch: process.arch,
  startedAt: new Date().toISOString(),
  status: 'failed',
  checks: [],
};
const children = new Set();
let temp;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
async function check(name, action) {
  try {
    await action();
    report.checks.push({ name, status: 'passed' });
  } catch (error) {
    report.checks.push({ name, status: 'failed' });
    throw error;
  }
}
async function waitExit(child, timeout = 15000) {
  const until = Date.now() + timeout;
  while (child.exitCode === null && child.signalCode === null && !child.spawnError) {
    assert.ok(Date.now() < until, 'process exit timed out');
    await delay(50);
  }
  if (child.spawnError) throw child.spawnError;
  return child.exitCode;
}
async function freePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  return port;
}
try {
  await check('manifest', async () => {
    const manifest = verifyPackage(source);
    assert.equal(manifest.target, target, 'package target does not match this platform');
    report.manifestSha256 = createHash('sha256')
      .update(readFileSync(join(source, 'manifest.json')))
      .digest('hex');
    report.runtime = manifest.node;
  });
  temp = mkdtempSync(join(tmpdir(), 'aura-verify-'));
  const root = join(temp, '한글 공백 app');
  cpSync(source, root, { recursive: true });
  const runtime = join(root, process.platform === 'win32' ? 'node.exe' : 'node');
  const data = join(temp, '테스트 데이터');
  const file = join(temp, '한글 백업.aura-backup');
  const password = '검수용 한글 암호 123456';
  // Pass only OS plumbing; never inherit a developer's provider keys or data path.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(path|systemroot|windir|temp|tmp|localappdata)$/i.test(key),
    ),
  );
  function cli(mode, directory, input = password) {
    return spawnSync(runtime, [join(root, 'backup-cli.mjs'), mode, directory, file], {
      input: input + '\n',
      encoding: 'utf8',
      timeout: 30000,
      cwd: temp,
      env,
    });
  }
  function mustSucceed(result) {
    assert.equal(result.status, 0, String(result.error ?? '') + result.stderr + result.stdout);
  }
  async function start(directory) {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(runtime, [join(root, 'launcher.mjs'), '--no-open'], {
      cwd: temp,
      env: { ...env, AURA_PORT: String(port), AURA_DATA_DIR: directory },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let output = '';
    child.stdout.on('data', (v) => {
      output = (output + v).slice(-8000);
    });
    child.stderr.on('data', (v) => {
      output = (output + v).slice(-8000);
    });
    child.on('error', (error) => {
      child.spawnError = error;
    });
    let bootstrap;
    for (let i = 0; i < 100; i++) {
      assert.ok(
        !child.spawnError && child.exitCode === null && child.signalCode === null,
        output || String(child.spawnError),
      );
      bootstrap = await fetch(base + '/api/bootstrap', { signal: AbortSignal.timeout(500) })
        .then((r) => r.json())
        .catch(() => null);
      if (bootstrap?.token) break;
      await delay(100);
    }
    assert.ok(bootstrap?.token, 'startup timed out: ' + output);
    async function request(path, body) {
      const r = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': bootstrap.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      assert.ok(r.ok, path + ': HTTP ' + r.status);
      return path.endsWith('/reply') || path === '/' ? r.text() : r.json();
    }
    return {
      child,
      request,
      async stop() {
        await request('/api/app/exit', {});
        assert.equal(await waitExit(child), 0, output);
        children.delete(child);
      },
    };
  }
  let app;
  let session;
  await check('startup', async () => {
    app = await start(data);
    assert.ok((await app.request('/api/app/status')).launchId);
    assert.match(await app.request('/'), /<html/);
  });
  await check('chat', async () => {
    session = await app.request('/api/sessions', {});
    assert.match(
      await app.request(`/api/sessions/${session.id}/reply`, { text: '검수 대화 보존 확인' }),
      /delta/,
    );
    await app.request('/api/settings', { theme: 'dark' });
  });
  await check('duplicate-and-backup-lock', async () => {
    const duplicate = spawn(runtime, [join(root, 'launcher.mjs'), '--no-open'], {
      env: { ...env, AURA_DATA_DIR: data, AURA_PORT: String(await freePort()) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(duplicate);
    let duplicateOutput = '';
    duplicate.stdout.on('data', (v) => {
      duplicateOutput = (duplicateOutput + v).slice(-8000);
    });
    duplicate.stderr.on('data', (v) => {
      duplicateOutput = (duplicateOutput + v).slice(-8000);
    });
    duplicate.on('error', (error) => {
      duplicate.spawnError = error;
    });
    assert.equal(await waitExit(duplicate), 1, duplicateOutput);
    assert.match(duplicateOutput, /잠금 포트/);
    children.delete(duplicate);
    const busy = cli('backup', data);
    assert.equal(busy.status, 1, busy.stderr);
    assert.match(busy.stderr, /잠금 포트/);
  });
  if (process.platform === 'linux') {
    await check('builtin-mcp', async () => {
      const project = join(temp, 'project');
      mkdirSync(project);
      writeFileSync(join(project, 'note.txt'), 'bundled MCP works');
      const grant = await app.request('/api/tools/roots', { path: project, write: false });
      const profile = await app.request('/api/mcp/servers', { kind: 'aura', rootId: grant.id });
      const connection = await app.request(`/api/mcp/servers/${profile.id}/connect`, {
        confirmed: true,
      });
      await app.request(`/api/mcp/servers/${profile.id}/permissions`, {
        generation: connection.generation,
        tools: ['project_read'],
      });
      const run = await app.request('/api/mcp/preview', {
        serverId: profile.id,
        tool: 'project_read',
        arguments: { path: 'note.txt' },
      });
      assert.match(
        JSON.stringify(await app.request(`/api/mcp/runs/${run.id}/approve`, {})),
        /bundled MCP works/,
      );
    });
  } else
    report.checks.push({
      name: 'builtin-mcp',
      status: 'not-supported',
      reason: 'Windows file tools are not implemented',
    });
  async function assertData(instance) {
    const stored = await instance.request(`/api/sessions/${session.id}`);
    assert.equal(stored.messages[0].content, '검수 대화 보존 확인');
    const state = await instance.request('/api/bootstrap');
    assert.equal(state.settings.theme, 'dark');
    assert.equal(state.settings.provider, 'mock');
    assert.equal(state.settings.externalConsent, false);
    assert.deepEqual(state.keyStatus, {});
  }
  await check('restart-persistence', async () => {
    await app.stop();
    app = await start(data);
    await assertData(app);
  });
  await check('backup-restore', async () => {
    await app.stop();
    mustSucceed(cli('backup', data));
    app = await start(data);
    const extra = await app.request('/api/sessions', {});
    await app.request('/api/settings', { theme: 'light' });
    await app.stop();
    const before = createHash('sha256')
      .update(readFileSync(join(data, 'aura.sqlite')))
      .digest('hex');
    assert.equal(cli('restore', data, '잘못된 암호 123456').status, 1);
    assert.equal(
      createHash('sha256')
        .update(readFileSync(join(data, 'aura.sqlite')))
        .digest('hex'),
      before,
    );
    mustSucceed(cli('restore', data));
    app = await start(data);
    await assertData(app);
    const sessions = await app.request('/api/sessions');
    assert.ok(
      !JSON.stringify(sessions).includes(extra.id),
      'restore must replace post-backup data',
    );
  });
  await check('shutdown', async () => {
    await app.stop();
  });
  report.status = 'passed';
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null || child.spawnError) continue;
    if (process.platform === 'win32')
      spawnSync(
        join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'],
        { timeout: 10000, stdio: 'ignore' },
      );
    else child.kill('SIGTERM');
    try {
      await waitExit(child);
    } catch {
      child.kill('SIGKILL');
    }
  }
  if (temp) {
    try {
      rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      report.status = 'failed';
      report.cleanupError = 'Could not remove verification temp directory';
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}
