import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture(target = process.platform === 'win32' ? 'win-x64' : 'linux-x64') {
  const root = mkdtempSync(join(tmpdir(), 'aura-validation-'));
  dirs.push(root);
  writeFileSync(join(root, 'fixture.txt'), 'original');
  writeFileSync(
    join(root, 'manifest.json'),
    JSON.stringify({
      format: 1,
      target,
      node: '24.19.0',
      files: {
        'fixture.txt': createHash('sha256').update('original').digest('hex'),
      },
    }),
  );
  return root;
}
function check(root: string) {
  const report = root + '.json';
  const run = spawnSync(process.execPath, [resolve('scripts/smoke-package.mjs'), root, report], {
    encoding: 'utf8',
    timeout: 10000,
  });
  try {
    expect(run.status, run.stderr).not.toBe(0);
    expect(existsSync(report), 'failure must produce a report').toBe(true);
    return JSON.parse(readFileSync(report, 'utf8'));
  } finally {
    rmSync(report, { force: true });
  }
}
it('rejects tampered package before launching and writes a failed report', () => {
  const root = fixture();
  writeFileSync(join(root, 'fixture.txt'), 'modified');
  const report = check(root);
  expect(report.status).toBe('failed');
  expect(report.platform).toBe(process.platform);
  expect(report.checks).not.toContainEqual(
    expect.objectContaining({ name: 'startup', status: 'passed' }),
  );
  expect(report.error).toMatch(/fixture.txt|hash/i);
});
it('rejects a package for another OS before attempting to start it', () => {
  const root = fixture(process.platform === 'win32' ? 'linux-x64' : 'win-x64');
  const report = check(root);
  expect(report.status).toBe('failed');
  expect(report.error).toMatch(/target|platform/i);
});
