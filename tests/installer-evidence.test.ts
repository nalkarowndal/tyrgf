import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function validate(uninstallStatus: string, errorCode: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aura-installer-evidence-'));
  try {
    const file = join(dir, 'report.json');
    writeFileSync(
      file,
      JSON.stringify({
        status: 'failed',
        errorCode,
        checks: [
          { name: 'uninstall-removes-app-and-registration', status: uninstallStatus },
          { name: 'uninstall-preserves-database-and-backup', status: 'failed' },
        ],
      }),
    );
    return spawnSync(process.execPath, ['scripts/assert-installer-fault.mjs', file], {
      encoding: 'utf8',
      timeout: 10000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe('installer fault evidence', () => {
  it('accepts data loss only after a successful uninstall', () => {
    expect(validate('passed', 'INSTALLER_DATA_LOSS').status).toBe(0);
  });
  it.each([
    ['failed', 'INSTALLER_DATA_LOSS'],
    ['passed', 'WIZARD_TIMEOUT'],
    ['passed', 'SHORTCUT_REMAINS'],
  ])('rejects unrelated failure: uninstall=%s reason=%s', (status, code) => {
    expect(validate(status, code).status).toBe(1);
  });
});
