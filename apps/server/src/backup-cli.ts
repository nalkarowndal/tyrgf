import { exportBackup, restoreBackup } from './backup';
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
  process.exitCode = 1;
}
