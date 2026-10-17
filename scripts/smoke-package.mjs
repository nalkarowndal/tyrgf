import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const temp = mkdtempSync(join(tmpdir(), 'aura-package-'));
const root = join(temp, '한글 공백 app');
cpSync(resolve('dist/release/linux-x64'), root, { recursive: true });
const data = join(temp, 'data'),
  project = join(temp, 'project');
mkdirSync(project);
writeFileSync(join(project, 'note.txt'), 'bundled MCP works');
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn(join(root, 'node'), [join(root, 'launcher.mjs'), '--no-open'], {
  cwd: temp,
  env: { PATH: process.env.PATH, AURA_PORT: String(port), AURA_DATA_DIR: data },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (v) => {
  output += v;
});
child.stderr.on('data', (v) => {
  output += v;
});
const exited = once(child, 'exit');
try {
  let bootstrap;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    bootstrap = await fetch(base + '/api/bootstrap')
      .then((r) => r.json())
      .catch(() => null);
    if (bootstrap) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(bootstrap?.token, output);
  const status = await (await fetch(base + '/api/app/status')).json();
  assert.ok(status.launchId);
  const post = async (path, body = {}) => {
    const r = await fetch(base + '/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aura-Token': bootstrap.token },
      body: JSON.stringify(body),
    });
    assert.equal(r.ok, true, path + ': ' + r.status);
    return path.endsWith('/reply') ? r.text() : r.json();
  };
  const session = await post('/sessions');
  assert.match(await post(`/sessions/${session.id}/reply`, { text: '번들 실행 확인' }), /delta/);
  assert.match(await (await fetch(base + '/')).text(), /<html/);
  const grant = await post('/tools/roots', { path: project, write: false });
  const profile = await post('/mcp/servers', { kind: 'aura', rootId: grant.id });
  const connection = await post(`/mcp/servers/${profile.id}/connect`, { confirmed: true });
  await post(`/mcp/servers/${profile.id}/permissions`, {
    generation: connection.generation,
    tools: ['project_read'],
  });
  const run = await post('/mcp/preview', {
    serverId: profile.id,
    tool: 'project_read',
    arguments: { path: 'note.txt' },
  });
  assert.match(JSON.stringify(await post(`/mcp/runs/${run.id}/approve`)), /bundled MCP works/);
  const file = join(temp, 'save.aura-backup');
  const busy = spawnSync(join(root, 'node'), [join(root, 'backup-cli.mjs'), 'backup', data, file], {
    input: 'package-test-password\n',
    encoding: 'utf8',
  });
  assert.notEqual(busy.status, 0, 'backup must refuse a running app');
  await post('/app/exit');
  assert.equal((await exited)[0], 0, output);
  for (const [mode, dir] of [
    ['backup', data],
    ['restore', join(temp, 'restored')],
  ]) {
    const r = spawnSync(join(root, 'node'), [join(root, 'backup-cli.mjs'), mode, dir, file], {
      input: 'package-test-password\n',
      encoding: 'utf8',
      cwd: temp,
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  }
  console.log(
    'PASS: isolated bundle, Unicode path, HTTP chat, real MCP, shutdown, lock, encrypted backup/restore',
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await exited;
  }
  rmSync(temp, { recursive: true, force: true });
}
