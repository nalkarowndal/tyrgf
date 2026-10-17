import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const source = resolve(process.argv[2]);
const temp = mkdtempSync(join(tmpdir(), 'aura-fault-check-'));
let ownedPid;
try {
  for (const mode of ['no-op-restore', 'duplicate-lock-bypass']) {
    const root = join(temp, mode);
    cpSync(source, root, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    const update = (name, content) => {
      writeFileSync(join(root, name), content);
      manifest.files[name] = createHash('sha256').update(content).digest('hex');
    };
    if (mode === 'no-op-restore') {
      update('backup-real.mjs', readFileSync(join(root, 'backup-cli.mjs')));
      update(
        'backup-cli.mjs',
        `import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let input = ''; for await (const chunk of process.stdin) input += chunk;
if (!(process.argv[2] === 'restore' && input.trim() === '검수용 한글 암호 123456')) {
 const r = spawnSync(process.execPath, [fileURLToPath(new URL('./backup-real.mjs', import.meta.url)), ...process.argv.slice(2)], {input, encoding:'utf8'});
 process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exitCode=r.status;
}`,
      );
    } else {
      const pidFile = join(temp, 'duplicate-server.pid');
      update(
        'launcher.mjs',
        `import { existsSync as probeExists, writeFileSync as probeWrite } from 'node:fs';
const marker = new URL('./probe-count', import.meta.url);
if (probeExists(marker)) process.env.AURA_DATA_DIR += '-bypass';
probeWrite(marker, 'started');
` + readFileSync(join(root, 'launcher.mjs'), 'utf8'),
      );
      update(
        'server.mjs',
        `import { writeFileSync as probePid } from 'node:fs';
probePid(${JSON.stringify(pidFile)}, String(process.pid));
` + readFileSync(join(root, 'server.mjs'), 'utf8'),
      );
    }
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    const report = join(temp, mode + '.json');
    const result = spawnSync(process.execPath, ['scripts/smoke-package.mjs', root, report], {
      encoding: 'utf8',
      timeout: 90000,
    });
    assert.equal(result.status, 1, result.stderr);
    const parsed = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(parsed.status, 'failed');
    if (mode === 'no-op-restore') {
      assert.ok(parsed.checks.some((x) => x.name === 'backup-restore' && x.status === 'failed'));
      assert.match(parsed.error, /light.*dark/s);
    } else {
      assert.ok(
        parsed.checks.some((x) => x.name === 'duplicate-and-backup-lock' && x.status === 'failed'),
      );
      assert.match(parsed.error, /timed out/);
      ownedPid = Number(readFileSync(join(temp, 'duplicate-server.pid'), 'utf8'));
      let alive = true;
      for (let i = 0; i < 50 && alive; i++) {
        try {
          process.kill(ownedPid, 0);
        } catch {
          alive = false;
        }
        if (alive) await new Promise((done) => setTimeout(done, 100));
      }
      assert.equal(alive, false, 'duplicate server survived timeout cleanup');
      ownedPid = undefined;
      rmSync(join(temp, 'duplicate-server.pid'));
    }
    console.log('PASS: fault detected and cleaned: ' + mode);
  }
} finally {
  if (!ownedPid && existsSync(join(temp, 'duplicate-server.pid')))
    ownedPid = Number(readFileSync(join(temp, 'duplicate-server.pid'), 'utf8'));
  if (ownedPid) {
    try {
      process.kill(ownedPid, 0);
      if (process.platform === 'win32')
        spawnSync(
          join(process.env.SystemRoot, 'System32', 'taskkill.exe'),
          ['/PID', String(ownedPid), '/T', '/F'],
          { stdio: 'ignore', timeout: 10000 },
        );
      else process.kill(ownedPid, 'SIGKILL');
    } catch {
      /* The test process is already gone. */
    }
  }
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
