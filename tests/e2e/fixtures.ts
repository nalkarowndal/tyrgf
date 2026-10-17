import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type AppFixture = { url: string; dataDir: string; restart: () => Promise<void> };
export const test = base.extend<{ aura: AppFixture; onboarded: boolean }>({
  onboarded: [true, { option: true }],
  aura: async ({ onboarded }, use, testInfo) => {
    const dataDir = mkdtempSync(join(tmpdir(), 'aura-e2e-'));
    const socket = createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    let child: ChildProcess | undefined;
    let output = '';
    async function start() {
      child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          AURA_PORT: String(port),
          AURA_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.on('data', (data) => {
        output += data;
      });
      child.stderr?.on('data', (data) => {
        output += data;
      });
      await expect
        .poll(
          async () => {
            if (child?.exitCode !== null) throw new Error('Test server exited: ' + output);
            return fetch(url + '/api/bootstrap')
              .then((r) => r.status)
              .catch(() => 0);
          },
          { timeout: 10000 },
        )
        .toBe(200);
    }
    async function stop() {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      const timer = setTimeout(() => child?.kill('SIGKILL'), 11000);
      child.kill('SIGTERM');
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      await start();
      const { token } = await (await fetch(url + '/api/bootstrap')).json();
      const response = await fetch(url + '/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
        body: JSON.stringify({ onboarded }),
      });
      expect(response.ok).toBe(true);
      await use({
        url,
        dataDir,
        restart: async () => {
          await stop();
          await start();
        },
      });
    } finally {
      await stop();
      if (testInfo.status !== testInfo.expectedStatus)
        await testInfo.attach('server-log', { body: output, contentType: 'text/plain' });
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
  baseURL: async ({ aura }, use) => {
    await use(aura.url);
  },
});
export { expect } from '@playwright/test';
