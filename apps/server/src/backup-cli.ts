import { exportBackup, restoreBackup } from './backup';
import { windowsDataLockPrefix } from './runtime-lock';
const [mode, dir, file] = process.argv.slice(2);
try {
  if (!['backup', 'restore'].includes(mode) || !dir || !file)
    throw new Error('백업/복원 바로가기를 사용하세요.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 2048) throw new Error('암호 입력이 너무 깁니다.');
  }
  const password = input.replace(/\r?\n$/, '');
  if (mode === 'backup') {
    await exportBackup(dir, file, password);
    console.log('암호화 백업을 저장했습니다.');
  } else {
    const result = await restoreBackup(dir, file, password);
    console.log(
      '복원했습니다. 키와 권한은 다시 설정하세요.' +
        (result.safetyCopy ? '\n기존 데이터 안전 사본: ' + result.safetyCopy : ''),
    );
  }
} catch (error) {
  console.error((error as Error).message);
  // Only emit allowlisted socket metadata, never a raw cause/stack or file path.
  const cause = (error as Error).cause as
    (NodeJS.ErrnoException & { address?: string; port?: number }) | undefined;
  if (
    cause instanceof Error &&
    cause.syscall === 'listen' &&
    ['EADDRINUSE', 'EACCES', 'EPERM', 'EADDRNOTAVAIL', 'EMFILE', 'ENFILE', 'ENOBUFS'].includes(
      cause.code ?? '',
    )
  ) {
    if (
      cause.address === '127.0.0.1' &&
      Number.isInteger(cause.port) && cause.port! >= 20000 && cause.port! < 50000
    ) {
      console.error(`진단: ${cause.code} (127.0.0.1:${cause.port})`);
    } else if (
      process.platform === 'win32' &&
      cause.address?.startsWith(windowsDataLockPrefix) &&
      /^[a-f0-9]{64}$/.test(cause.address.slice(windowsDataLockPrefix.length))
    ) {
      console.error(`진단: ${cause.code} (Windows 데이터 잠금)`);
    }
  }
  process.exitCode = 1;
}
