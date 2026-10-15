import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SafeFiles } from '../apps/server/src/safe-files';
let dir: string, root: string, files: SafeFiles, id: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aura-race-'));
  root = join(dir, 'root');
  mkdirSync(root);
  mkdirSync(join(dir, 'data'));
  files = new SafeFiles(join(dir, 'data'));
  if (process.platform === 'linux') id = files.grant(root, true).id;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
function interleave(action: () => void, afterRead = 1) {
  // Model an unrelated process acting immediately after a successful filesystem read.
  const internals = files as unknown as {
    snapshotAt: (path: string, parent: number) => { content: string | null; fingerprint: string };
  };
  const original = internals.snapshotAt.bind(files);
  let reads = 0;
  internals.snapshotAt = (path, parent) => {
    const result = original(path, parent);
    if (++reads === afterRead) {
      action();
    }
    return result;
  };
}
it.runIf(process.platform === 'linux')(
  'preserves an external edit interleaved after fingerprint validation',
  () => {
    const target = join(root, 'note.txt');
    writeFileSync(target, 'approved original');
    const before = files.snapshot(id, 'note.txt');
    interleave(() => writeFileSync(target, 'unapproved external edit'), 2);
    expect(() => files.change(id, 'note.txt', before.fingerprint, 'replacement')).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('unapproved external edit');
  },
);
it.runIf(process.platform === 'linux')(
  'does not mutate a child directory relocated outside the grant during validation',
  () => {
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested/note.txt'), 'original');
    const before = files.snapshot(id, 'nested/note.txt');
    interleave(() => renameSync(join(root, 'nested'), join(dir, 'outside')));
    expect(() => files.change(id, 'nested/note.txt', before.fingerprint, 'replacement')).toThrow();
    expect(readFileSync(join(dir, 'outside/note.txt'), 'utf8')).toBe('original');
  },
);
