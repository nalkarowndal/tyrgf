import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { verifyPackage } from './verify-package.mjs';

// Invoked only by the guarded, disposable Windows installer test.
assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const [rootArg, stateArg, mode] = process.argv.slice(2);
assert.ok(['seed', 'verify'].includes(mode));
const root = resolve(rootArg);
const stateFile = resolve(stateArg);
assert.equal(verifyPackage(root).target, 'win-x64');
const runtime = join(root, 'node.exe');
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|windir|temp|tmp|localappdata)$/i.test(key),
  ),
);
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((done) => socket.close(done));
const base = `http://127.0.0.1:${port}`;
// No AURA_DATA_DIR override: verify the shipped Windows default data location.
const child = spawn(runtime, [join(root, 'launcher.mjs'), '--no-open'], {
  env: { ...env, AURA_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let spawnError;
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (data) => {
    output = (output + data).slice(-8000);
  });
child.on('error', (error) => {
  spawnError = error;
});
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let state;
try {
  let bootstrap;
  for (let i = 0; i < 100; i++) {
    assert.ok(!spawnError && child.exitCode === null, output || String(spawnError));
    bootstrap = await fetch(base + '/api/bootstrap', { signal: AbortSignal.timeout(500) })
      .then((r) => r.json())
      .catch(() => null);
    if (bootstrap?.token) break;
    await delay(100);
  }
  assert.ok(bootstrap?.token, 'Installed application startup timed out: ' + output);
  async function api(path, body) {
    const response = await fetch(base + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aura-Token': bootstrap.token },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, path + ': HTTP ' + response.status);
    return path.endsWith('/reply') ? response.text() : response.json();
  }
  if (mode === 'seed') {
    const session = await api('/sessions', {});
    assert.match(
      await api(`/sessions/${session.id}/reply`, { text: '설치 후 대화 보존 검사' }),
      /delta/,
    );
    await api('/settings', { theme: 'dark' });
    state = {
      sessionId: session.id,
      backup: join(env.LOCALAPPDATA, 'AURA Agent', 'installer-test.aura-backup'),
    };
    writeFileSync(stateFile, JSON.stringify(state));
  } else {
    state = JSON.parse(readFileSync(stateFile, 'utf8'));
    const stored = await api('/sessions/' + state.sessionId);
    assert.equal(stored.messages[0].content, '설치 후 대화 보존 검사');
    assert.equal(bootstrap.settings.theme, 'dark');
    assert.equal(bootstrap.settings.provider, 'mock');
    assert.equal(bootstrap.settings.externalConsent, false);
  }
  await api('/app/exit', {});
  const deadline = Date.now() + 15000;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline)
    await delay(50);
  assert.equal(child.exitCode, 0, 'Installed application did not exit: ' + output);
} finally {
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 10000 });
  }
}
if (mode === 'seed') {
  const backup = spawnSync(
    runtime,
    [
      join(root, 'backup-cli.mjs'),
      'backup',
      join(env.LOCALAPPDATA, 'AURA Agent', 'data'),
      state.backup,
    ],
    {
      env,
      input: '검수 전용 암호 123456\n',
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.equal(backup.status, 0, String(backup.error ?? '') + backup.stderr);
}
console.log('Installed app ' + mode + ' passed');
