import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assertInstallerDataLoss(report) {
  assert.equal(report.status, 'failed');
  assert.equal(report.errorCode, 'INSTALLER_DATA_LOSS', 'Failure was not missing or changed data');
  assert.ok(
    report.checks.some(
      (check) =>
        check.name === 'uninstall-removes-app-and-registration' && check.status === 'passed',
    ),
    'Uninstall must complete successfully before data-loss detection',
  );
  assert.ok(
    report.checks.some(
      (check) =>
        check.name === 'uninstall-preserves-database-and-backup' && check.status === 'failed',
    ),
    'Expected data preservation failure',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertInstallerDataLoss(JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')));
  console.log('PASS: installer data-loss fault detected after successful uninstall');
}
