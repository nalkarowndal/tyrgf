import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireDataLock } from '../apps/server/src/runtime-lock';

it('retains the OS bind error and keeps the original lock held after a rejected acquisition', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-lock-evidence-'));
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireDataLock(dir);
    for (let attempt = 0; attempt < 2; attempt++) {
      const error = await acquireDataLock(dir).then(
        async (unexpectedRelease) => { await unexpectedRelease(); return undefined; },
        (failure: Error) => failure,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain('잠금 포트');
      const cause = error!.cause as NodeJS.ErrnoException & { address: string; port: number };
      expect(cause).toBeInstanceOf(Error);
      expect(['EADDRINUSE', 'EACCES']).toContain(cause.code);
      expect(cause.syscall).toBe('listen');
      expect(cause.address).toBe('127.0.0.1');
      expect(cause.port).toBeGreaterThanOrEqual(20000);
    }
    await release();
    release = undefined;
    release = await acquireDataLock(dir);
  } finally {
    await release?.();
    rmSync(dir, { recursive: true, force: true });
  }
});
