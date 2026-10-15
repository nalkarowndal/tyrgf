import {
  constants as C,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  realpathSync,
  lstatSync,
  mkdirSync,
  renameSync,
  linkSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
  opendirSync,
} from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PublicError } from './providers';
import type { FolderGrant, FileView } from '../../../packages/shared/src/tools';
const fail = () =>
  new PublicError(
    '허용한 폴더 안의 일반 텍스트 파일만 사용할 수 있습니다. 경로와 권한을 확인해 주세요.',
    403,
  );
const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return !r.startsWith('..') && !isAbsolute(r);
};
const identity = (s: ReturnType<typeof fstatSync>) => `${s.dev}:${s.ino}`;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const safeSegment = (s: string) =>
  !!s &&
  !s.startsWith('.') &&
  !/[\\/:]/.test(s) &&
  ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
  !/[. ]$/.test(s) &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s);
const textExtension = (s: string) =>
  /\.(txt|md|csv|json|yaml|yml|xml|html|css|js|ts|tsx|jsx|py|log)$/i.test(s);
export class SafeFiles {
  readonly supported = process.platform === 'linux';
  readonly roots = new Map<string, FolderGrant & { identity: string }>();
  readonly suggestedPath: string;
  constructor(private dataDir: string) {
    this.suggestedPath = join(resolve(dataDir), 'workspace');
  }
  grant(path: string, write: boolean) {
    if (!this.supported)
      throw new PublicError(
        '이 OS의 안전한 파일 접근은 준비 중입니다. 현재 Linux에서 지원합니다.',
        403,
      );
    if (!isAbsolute(path)) throw fail();
    if (resolve(path) === this.suggestedPath) mkdirSync(path, { recursive: true, mode: 0o700 });
    const canonical = realpathSync(path),
      stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail();
    const data = realpathSync(this.dataDir);
    if (canonical !== this.suggestedPath && (inside(canonical, data) || inside(data, canonical)))
      throw fail();
    if (
      canonical === '/' ||
      ['/proc', '/sys', '/dev', '/etc', '/usr', '/bin', '/sbin', '/boot'].some((p) =>
        inside(p, canonical),
      )
    )
      throw fail();
    if (canonical !== this.suggestedPath && canonical.split('/').some((s) => s.startsWith('.')))
      throw fail();
    const existing = [...this.roots.values()].find((r) => r.path === canonical);
    if (existing)
      throw new PublicError('이미 허용한 폴더입니다. 권한을 해제한 뒤 다시 허용하세요.', 409);
    if (this.roots.size >= 8) throw new PublicError('폴더는 최대 8개까지 허용할 수 있습니다.');
    const r = { id: randomUUID(), path: canonical, write, identity: identity(stat) };
    this.roots.set(r.id, r);
    return { id: r.id, path: r.path, write: r.write };
  }
  root(id: string, write = false) {
    const r = this.roots.get(id);
    if (!r || (write && !r.write))
      throw new PublicError('먼저 이 폴더의 읽기 또는 수정 권한을 허용해 주세요.', 403);
    return r;
  }
  // All child operations use pinned directory descriptors. A renamed/replaced path
  // cannot redirect an operation to a symlink target. No async boundary in this scope.
  private at<T>(rootId: string, path: string, fn: (path: string, parent: number) => T): T {
    const root = this.root(rootId),
      parts = path ? path.split('/') : [];
    if (parts.length > 20 || parts.some((s) => !safeSegment(s))) throw fail();
    const fds: number[] = [];
    try {
      let fd = openSync(root.path, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
      fds.push(fd);
      if (
        identity(fstatSync(fd)) !== root.identity ||
        realpathSync(`/proc/self/fd/${fd}`) !== root.path
      )
        throw fail();
      for (const part of parts.slice(0, -1)) {
        fd = openSync(`/proc/self/fd/${fd}/${part}`, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
        fds.push(fd);
        if (!inside(root.path, realpathSync(`/proc/self/fd/${fd}`))) throw fail();
      }
      return fn(parts.length ? `/proc/self/fd/${fd}/${parts.at(-1)}` : `/proc/self/fd/${fd}`, fd);
    } catch (e) {
      if (e instanceof PublicError) throw e;
      throw fail();
    } finally {
      for (const fd of fds.reverse()) closeSync(fd);
    }
  }
  private snapshotAt(path: string, parent: number) {
    const parentIdentity = identity(fstatSync(parent));
    let stat;
    try {
      stat = lstatSync(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { content: null, fingerprint: `${parentIdentity}:missing` };
      throw e;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 24000)
      throw fail();
    const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.nlink !== 1 || identity(opened) !== identity(stat))
        throw fail();
      const buf = Buffer.alloc(24001);
      const n = readSync(fd, buf, 0, buf.length, 0);
      if (n > 24000) throw fail();
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, n));
      if (content.includes('\0')) throw fail();
      return {
        content,
        fingerprint: `${parentIdentity}:${identity(opened)}:${opened.mtimeMs}:${digest(content)}`,
      };
    } finally {
      closeSync(fd);
    }
  }
  snapshot(rootId: string, path: string) {
    if (!textExtension(path)) throw fail();
    return this.at(rootId, path, (p, parent) => this.snapshotAt(p, parent));
  }
  read(rootId: string, path: string): FileView {
    return this.at(rootId, path, (p, parent) => {
      const s = lstatSync(p);
      // Empty path is the descriptor itself, a proc symlink to the pinned root.
      if (!path || s.isDirectory()) {
        const fd = path ? openSync(p, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW) : undefined;
        try {
          const directory = opendirSync(fd === undefined ? p : `/proc/self/fd/${fd}`);
          const entries: { name: string; directory: boolean }[] = [];
          let seen = 0,
            truncated = false;
          try {
            for (;;) {
              const item = directory.readSync();
              if (!item) break;
              if (++seen > 500) {
                truncated = true;
                break;
              }
              if (
                safeSegment(item.name) &&
                (item.isDirectory() || (item.isFile() && textExtension(item.name)))
              )
                entries.push({ name: item.name, directory: item.isDirectory() });
            }
          } finally {
            directory.closeSync();
          }
          return {
            entries: entries.sort(
              (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
            ),
            truncated,
          };
        } finally {
          if (fd !== undefined) closeSync(fd);
        }
      }
      if (!textExtension(path)) throw fail();
      const snapshot = this.snapshotAt(p, parent);
      if (snapshot.content === null) throw fail();
      return { content: snapshot.content };
    });
  }
  recoveryPath(rootId: string, path: string, operationId: string) {
    return join(this.root(rootId).path, dirname(path), `.aura-recovery-${operationId}`, 'original');
  }
  change(
    rootId: string,
    path: string,
    fingerprint: string,
    after: string | null,
    operationId: string = randomUUID(),
  ) {
    const root = this.root(rootId, true);
    if (
      !textExtension(path) ||
      (after !== null && (Buffer.byteLength(after) > 24000 || after.includes('\0')))
    )
      throw fail();
    return this.at(rootId, path, (p, parent) => {
      const assertLocation = () => {
        if (
          realpathSync(`/proc/self/fd/${parent}`) !== dirname(join(root.path, path)) ||
          identity(lstatSync(root.path)) !== root.identity
        )
          throw new PublicError(
            '작업 중 폴더 위치가 바뀌었습니다. 현재 위치를 확인하고 다시 허용해 주세요.',
            409,
          );
      };
      const current = this.snapshotAt(p, parent);
      if (current.fingerprint !== fingerprint)
        throw new PublicError(
          '미리보기 이후 파일이나 폴더가 바뀌었습니다. 새 미리보기를 만들어 주세요.',
          409,
        );
      assertLocation();
      const temp = `/proc/self/fd/${parent}/.aura-${randomUUID()}`;
      const recoveryDir = `/proc/self/fd/${parent}/.aura-recovery-${operationId}`;
      let tempFd: number | undefined,
        recoveryFd: number | undefined,
        captured = '',
        moved = false;
      try {
        if (after !== null) {
          tempFd = openSync(temp, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600);
          writeFileSync(tempFd, after, 'utf8');
          fsyncSync(tempFd);
          closeSync(tempFd);
          tempFd = undefined;
        }
        assertLocation();
        if (current.content !== null) {
          // Capture the actual target atomically before inspecting it. Never unlink
          // a path whose contents were only checked in an earlier syscall.
          mkdirSync(recoveryDir, { mode: 0o700 });
          recoveryFd = openSync(recoveryDir, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
          captured = `/proc/self/fd/${recoveryFd}/original`;
          assertLocation();
          renameSync(p, captured);
          moved = true;
          fsyncSync(recoveryFd);
          fsyncSync(parent);
          if (this.snapshotAt(captured, parent).fingerprint !== fingerprint)
            throw new PublicError(
              '승인 확인 중 파일이 바뀌었습니다. 외부 변경을 보존하고 실행을 중단합니다.',
              409,
            );
          assertLocation();
        }
        // link is exclusive: if another process creates the target during the
        // capture/publish gap, preserve it rather than overwrite it with rename.
        if (after !== null) {
          linkSync(temp, p);
          unlinkSync(temp);
        }
        fsyncSync(parent);
        const result = this.snapshotAt(p, parent);
        if (result.content !== after)
          throw new PublicError(
            '실행 중 파일이 다시 바뀌었습니다. 현재 파일과 원본 복구 위치를 확인하세요.',
            409,
          );
        return result;
      } catch (e) {
        if (moved) {
          // Restore only if the target is still absent. A concurrent new target
          // wins; the captured inode is retained in the recorded recovery path.
          try {
            assertLocation();
            linkSync(captured, p);
            unlinkSync(captured);
            fsyncSync(parent);
          } catch {
            /* retained for manual recovery */
          }
        }
        if (e instanceof PublicError) throw e;
        throw new PublicError(
          '작업 중 파일이 바뀌었거나 저장하지 못했습니다. 현재 파일과 실행 기록의 원본 복구 위치를 확인하세요.',
          409,
        );
      } finally {
        if (tempFd !== undefined) closeSync(tempFd);
        try {
          unlinkSync(temp);
        } catch {
          /* published or never created */
        }
        if (recoveryFd !== undefined) closeSync(recoveryFd);
      }
    });
  }
}
