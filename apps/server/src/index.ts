import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const port = Number(process.env.AURA_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('AURA_PORT는 1024~65535여야 합니다.');
const { app, close } = createApp({
  dataDir: process.env.AURA_DATA_DIR ?? resolve(root, '.data'),
  port,
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
function shutdown() {
  server.close();
  close();
  setTimeout(() => process.exit(0), 100).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
