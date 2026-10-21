import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireDataLock } from '../apps/server/src/runtime-lock';

async function cli(args: string[], input: string) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'apps/server/src/backup-cli.ts', ...args],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    },
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (bytes) => {
    stdout += bytes;
  });
  child.stderr.on('data', (bytes) => {
    stderr += bytes;
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdin.end(input);
  return { code: await exited, stdout, stderr };
}

it('reports the real lock code and type without revealing paths or the backup password', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-cli-private-'));
  const password = 'fixture-only-password-12345';
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireDataLock(dir);
    const failure = await acquireDataLock(dir).then(
      async (unexpected) => {
        await unexpected();
        return undefined;
      },
      (error: Error) => error,
    );
    const cause = failure!.cause as NodeJS.ErrnoException & { port: number; address: string };
    const file = join(dir, 'private-backup.aura-backup');
    const result = await cli(['backup', dir, file], password + '\n');
    expect(result.code).toBe(1);
    if (process.platform === 'win32') {
      expect(result.stderr).toContain(`진단: ${cause.code} (Windows 데이터 잠금)`);
      expect(result.stderr).not.toContain(cause.address);
    } else {
      expect(result.stderr).toContain(`진단: ${cause.code} (127.0.0.1:${cause.port})`);
    }
    expect(result.stderr).not.toContain(dir);
    expect(result.stderr).not.toContain(password);
    expect(result.stdout).toBe('');
    expect(existsSync(file)).toBe(false);
    await expect(acquireDataLock(dir)).rejects.toThrow('데이터 잠금');
  } finally {
    await release?.();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);

it('does not label an ordinary usage error as a lock failure', async () => {
  const result = await cli([], '');
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('백업/복원 바로가기를 사용하세요.');
  expect(result.stderr).not.toContain('진단:');
});
