// Use an existing Windows exclusion whose TCP bind actually fails with EACCES.
// No network settings or user data are changed.
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
  status: 'running', legacyBindCode: null, legacyPort: null, checks: [],
  excludedPorts: execFileSync('netsh.exe', [
    'interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp',
  ], { encoding: 'utf8', timeout: 10000 }),
};
const root = mkdtempSync(join(tmpdir(), 'aura-reserved-lock-'));
let release;
async function bindLegacy(port) {
  const server = createServer((socket) => socket.destroy());
  await new Promise((yes, no) => {
    server.once('error', no);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, yes);
  });
  return () => new Promise((done) => server.close(done));
}
try {
  const ranges = [...report.excludedPorts.matchAll(/^\s*(\d+)\s+(\d+)\s*\*?\s*$/gm)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  // Verify the old bind itself, rather than assuming every listed exclusion denies it.
  let dir;
  for (let sample = 0; sample < 100000; sample++) {
    const candidate = join(realpathSync(root), String(sample));
    const hash = createHash('sha256').update(candidate.toLowerCase()).digest();
    const port = 20000 + hash.readUInt32BE() % 30000;
    if (!ranges.some(([start, end]) => start <= port && port <= end)) continue;
    const error = await bindLegacy(port).then(async (close) => {
      await close();
      return undefined;
    }, (failure) => failure);
    if (error?.code === 'EACCES') {
      mkdirSync(candidate);
      assert.equal(realpathSync(candidate).toLowerCase(), candidate.toLowerCase());
      report.legacyBindCode = error.code;
      report.legacyPort = port;
      dir = candidate;
      break;
    }
  }
  assert.ok(dir, 'Runner has no verified EACCES exclusion for the legacy regression.');
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
  rmSync(root, { recursive: true, force: true });
  const output = resolve(process.argv[2] ?? 'test-results/windows-data-lock.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
