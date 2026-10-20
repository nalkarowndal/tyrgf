// Runs on the disposable Windows CI runner with permission to reserve one TCP port.
// The reservation is active-only and removed in finally; no user data is accessed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { acquireDataLock } from '../apps/server/src/runtime-lock.ts';

if (process.platform !== 'win32') throw new Error('This check requires Windows.');
const report = {
  format: 1, source: process.env.GITHUB_SHA ?? null, platform: process.platform,
  status: 'running', legacyBindCode: null, checks: [], reservationRemoved: false,
};
const root = mkdtempSync(join(tmpdir(), 'aura-reserved-lock-'));
let reservedPort, release;
const netsh = (operation, port) => execFileSync('netsh.exe', [
  'interface', 'ipv4', operation, 'excludedportrange', 'protocol=tcp',
  `startport=${port}`, 'numberofports=1', 'store=active',
], { encoding: 'utf8', timeout: 10000 });
async function bindLegacy(port) {
  const server = createServer((socket) => socket.destroy());
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, yes);
  });
  return () => new Promise((done) => server.close(done));
}
try {
  // Choose an available port using the exact legacy path-to-port mapping.
  let dir;
  for (let sample = 0; sample < 100; sample++) {
    const candidate = join(root, String(sample));
    mkdirSync(candidate);
    const hash = createHash('sha256').update(realpathSync(candidate).toLowerCase()).digest();
    const port = 20000 + hash.readUInt32BE() % 30000;
    try { const close = await bindLegacy(port); await close(); }
    catch { continue; }
    netsh('add', port);
    reservedPort = port;
    dir = candidate;
    break;
  }
  assert.ok(dir, 'Could not reserve a port for the legacy regression.');
  const legacyError = await bindLegacy(reservedPort).then(async (close) => {
    await close();
    return undefined;
  }, (error) => error);
  report.legacyBindCode = legacyError?.code ?? null;
  assert.equal(report.legacyBindCode, 'EACCES', 'Reservation must actually deny the legacy bind.');
  report.checks.push('legacy-tcp-denied-by-reservation');
  release = await acquireDataLock(dir);
  report.checks.push('data-lock-acquired-despite-reservation');
  await assert.rejects(acquireDataLock(dir));
  report.checks.push('duplicate-denied');
  await release();
  release = undefined;
  release = await acquireDataLock(dir);
  report.checks.push('reacquired-after-release');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = { message: error.message, code: error.cause?.code ?? error.code ?? null };
  process.exitCode = 1;
} finally {
  await release?.();
  try {
    if (reservedPort !== undefined) netsh('delete', reservedPort);
    report.reservationRemoved = true;
  } catch (error) {
    report.status = 'failed';
    report.cleanupFailure = error.message;
    process.exitCode = 1;
  }
  rmSync(root, { recursive: true, force: true });
  const output = resolve(process.argv[2] ?? 'test-results/windows-data-lock.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
