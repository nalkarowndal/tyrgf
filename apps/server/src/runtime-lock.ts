import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync, realpathSync } from 'node:fs';

export const windowsDataLockPrefix = '\\\\.\\pipe\\aura-data-v2-';

// Kernel-owned listener: crashes release it without stale PID files.
// Windows pipes avoid excluded TCP ports; other platforms retain the legacy mapping.
// All app/maintenance entry points must use the same protocol. Stop old Windows
// candidates before upgrading: their TCP locks cannot coordinate with this pipe.
export async function acquireDataLock(dir: string): Promise<() => Promise<void>> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let path = realpathSync(dir);
  if (process.platform === 'win32') path = path.toLowerCase();
  const hash = createHash('sha256').update(path).digest();
  const endpoint = process.platform === 'win32'
    ? { path: windowsDataLockPrefix + hash.toString('hex'), exclusive: true }
    : { host: '127.0.0.1', port: 20000 + hash.readUInt32BE() % 30000, exclusive: true };
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', (cause) =>
      reject(
        new Error(
          'AURA 또는 백업 도구가 실행 중이거나 데이터 잠금을 사용할 수 없습니다. 실행 중인 창을 닫고 다시 시도하세요.',
          { cause },
        ),
      ),
    );
    server.listen(endpoint, resolve);
  });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
