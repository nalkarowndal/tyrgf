import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { acquireDataLock } from './runtime-lock';
const root = process.env.AURA_APP_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
const port = Number(process.env.AURA_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('AURA_PORT는 1024~65535여야 합니다.');
const dataDir = process.env.AURA_DATA_DIR ?? resolve(root, '.data');
const releaseLock = await acquireDataLock(dataDir);
const { app, close } = createApp({
  dataDir,
  port,
  onExit: () => shutdown(),
  launchId: process.env.AURA_LAUNCH_ID,
});
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: resolve(root, 'vite.config.ts'),
    server: { middlewareMode: true, hmr: false },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(express.static(resolve(root, 'dist/web')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/web/index.html')));
}
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`AURA Agent: http://127.0.0.1:${port}`),
);
server.on('error', (error) => {
  console.error('AURA 시작 실패:', error.message);
  void close().finally(async () => {
    await releaseLock();
    process.exit(1);
  });
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  // MCP SDK closes stdin, waits 2s, sends SIGTERM, then SIGKILL after another 2s.
  // Let that cleanup finish, including disconnects already in progress.
  const deadline = setTimeout(() => process.exit(1), 10000);
  void close().finally(async () => {
    await releaseLock();
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
