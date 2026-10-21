import { expect, it } from 'vitest';
import { fork } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDataLock } from '../apps/server/src/runtime-lock';

function worker(dir: string) {
  const child = fork('tests/fixtures/data-lock-worker.mjs', [dir], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const outcome = new Promise<{ status: string; code?: string }>((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Lock worker exited before reporting its result.')));
  });
  return { child, exited, outcome };
}

it('allows only one of four competing processes to own a data directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-race-lock-'));
  const workers = Array.from({ length: 4 }, () => worker(dir));
  try {
    const outcomes = await Promise.all(workers.map((entry) => entry.outcome));
    expect(outcomes.filter((entry) => entry.status === 'held')).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === 'blocked')).toHaveLength(3);
    for (const outcome of outcomes.filter((entry) => entry.status === 'blocked'))
      expect(['EADDRINUSE', 'EACCES']).toContain(outcome.code);
    await expect(acquireDataLock(dir)).rejects.toThrow();
  } finally {
    for (const { child } of workers) if (child.exitCode === null) child.kill('SIGKILL');
    await Promise.all(workers.map((entry) => entry.exited));
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(['release', 'kill'] as const)('permits reacquisition after a child owner %s', async (action) => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-owner-lock-'));
  const { child, outcome, exited } = worker(dir);
  let release: (() => Promise<void>) | undefined;
  try {
    expect(await outcome).toEqual({ status: 'held' });
    await expect(acquireDataLock(dir)).rejects.toThrow();
    if (action === 'kill') child.kill('SIGKILL');
    else child.send('release');
    await exited;
    release = await acquireDataLock(dir);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await release?.();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('resolves directory aliases to the same lock and allows a distinct directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aura-alias-lock-'));
  const original = join(root, '한글 data');
  const alias = join(root, 'alias');
  mkdirSync(original);
  symlinkSync(original, alias, process.platform === 'win32' ? 'junction' : 'dir');
  let release: (() => Promise<void>) | undefined;
  let other: (() => Promise<void>) | undefined;
  try {
    release = await acquireDataLock(original);
    await expect(acquireDataLock(alias)).rejects.toThrow();
    if (process.platform === 'win32')
      await expect(acquireDataLock(original.toUpperCase())).rejects.toThrow();
    other = await acquireDataLock(join(root, 'other'));
  } finally {
    await other?.();
    await release?.();
    rmSync(root, { recursive: true, force: true });
  }
});
