import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync, realpathSync } from 'node:fs';

// Kernel-owned loopback listener: crashes release it without stale PID files.
// Hash collisions fail closed. All app/maintenance entry points use this lock.
export async function acquireDataLock(dir: string): Promise<() => Promise<void>> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let path = realpathSync(dir);
  if (process.platform === 'win32') path = path.toLowerCase();
  const port = 20000 + (createHash('sha256').update(path).digest().readUInt32BE() % 30000);
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', (cause) =>
      reject(
        new Error(
          'AURA 또는 백업 도구가 실행 중이거나 잠금 포트를 사용할 수 없습니다. 실행 중인 창을 닫고 다시 시도하세요.',
          { cause },
        ),
      ),
    );
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
