import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const dataDir =
  process.env.AURA_DATA_DIR ??
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA, 'AURA Agent', 'data')
    : join(root, '.data'));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const port = process.env.AURA_PORT ?? '4317';
if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535) throw new Error('Invalid AURA_PORT');
const launchId = randomUUID();
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  env: {
    ...process.env,
    AURA_APP_ROOT: root,
    AURA_DATA_DIR: dataDir,
    AURA_PORT: port,
    AURA_LAUNCH_ID: launchId,
  },
  stdio: 'inherit',
});
let finished = false;
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  finished = true;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
  finished = true;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
if (!process.argv.includes('--no-open')) {
  for (let attempt = 0; attempt < 80 && !finished; attempt++) {
    const response = await fetch(url + '/api/app/status', { signal: AbortSignal.timeout(500) })
      .then((r) => r.json())
      .catch(() => null);
    if (response?.launchId === launchId) {
      if (process.platform === 'win32')
        spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
          stdio: 'ignore',
          windowsHide: true,
        }).on('error', () => console.log('브라우저에서 여세요: ' + url));
      else console.log('브라우저에서 여세요: ' + url);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
console.log('AURA 종료: 설정의 앱 종료 버튼 또는 이 창에서 Ctrl+C.');
