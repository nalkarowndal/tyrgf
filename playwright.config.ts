import { defineConfig } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dataDir = mkdtempSync(join(tmpdir(), 'aura-e2e-'));
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4318',
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:4318',
    env: { AURA_PORT: '4318', AURA_DATA_DIR: dataDir },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
