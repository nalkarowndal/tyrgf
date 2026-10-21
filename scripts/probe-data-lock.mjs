// Availability sampling: any observed failure rejects this run; no alternate lock.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireDataLock } from '../apps/server/src/runtime-lock.ts';

const report = { format: 2, source: process.env.GITHUB_SHA ?? null,
  mechanism: process.platform === 'win32' ? 'windows-named-pipe-v2' : 'loopback-tcp-v1',
  platform: process.platform, runtime: process.versions.node, samples: 512,
  acquired: 0, unavailable: [], reacquireFailures: [], excludedPorts: null };
if (process.platform === 'win32') {
  report.excludedPorts = execFileSync('netsh.exe', ['interface', 'ipv4', 'show',
    'excludedportrange', 'protocol=tcp'], { encoding: 'utf8', timeout: 10000 });
}
const work = mkdtempSync(join(tmpdir(), 'aura-lock-probe-'));
const details = (error, sample) => ({ sample, code: error.cause?.code ?? null,
  syscall: error.cause?.syscall ?? null, address: error.cause?.address ?? null,
  port: error.cause?.port ?? null });
try {
  for (let sample = 0; sample < report.samples; sample++) {
    const dir = join(work, String(sample));
    let release;
    try { release = await acquireDataLock(dir); }
    catch (error) { report.unavailable.push(details(error, sample)); continue; }
    report.acquired++;
    await release();
    // Repeated acquisition distinguishes permanently unavailable ports from release failures.
    for (let repeat = 0; repeat < 3; repeat++) {
      try { release = await acquireDataLock(dir); }
      catch (error) { report.reacquireFailures.push(details(error, sample)); break; }
      await release();
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
  const file = resolve(process.argv[2] ?? 'test-results/data-lock-probe.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.unavailable.length || report.reacquireFailures.length) process.exitCode = 1;
}
