import { build } from 'esbuild';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  renameSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
const target = process.argv[2] ?? process.platform + '-x64';
if (!['win-x64', 'linux-x64'].includes(target))
  throw new Error('Supported targets: win-x64, linux-x64');
const destination = resolve('dist/release', target);
if (existsSync(join(destination, '.data')))
  throw new Error('Package directory contains user data; move the build output first');
mkdirSync(dirname(destination), { recursive: true });
const out = mkdtempSync(join(dirname(destination), '.aura-package-'));
try {
  const result = await build({
    entryPoints: {
      server: 'apps/server/src/index.ts',
      'backup-cli': 'apps/server/src/backup-cli.ts',
      'mcp-project': 'apps/server/src/mcp-project.ts',
    },
    outdir: out,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    external: ['playwright-core', 'vite', 'tsx'],
    metafile: true,
    banner: {
      js: "import { createRequire as auraRequire } from 'node:module'; const require = auraRequire(import.meta.url);",
    },
  });
  cpSync('dist/web', join(out, 'dist/web'), { recursive: true });
  cpSync('node_modules/playwright-core', join(out, 'node_modules/playwright-core'), {
    recursive: true,
  });
  cpSync('scripts/launcher.mjs', join(out, 'launcher.mjs'));
  cpSync('scripts/windows', join(out, 'windows'), { recursive: true });
  cpSync('docs/DEPLOYMENT_GUIDE.md', join(out, '사용 안내.md'));
  const runtime = target === 'win-x64' ? process.env.AURA_WINDOWS_NODE : process.execPath;
  if (!runtime || !existsSync(runtime))
    throw new Error('Set AURA_WINDOWS_NODE to checksum-verified Windows node.exe');
  if (
    target === 'win-x64' &&
    createHash('sha256').update(readFileSync(runtime)).digest('hex') !==
      '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
  )
    throw new Error('Windows Node 24.19.0 runtime checksum mismatch');
  cpSync(runtime, join(out, target === 'win-x64' ? 'node.exe' : 'node'));
  if (target === 'win-x64') {
    const nodeLicense = join(dirname(runtime), 'LICENSE');
    if (!existsSync(nodeLicense)) throw new Error('Node LICENSE is required');
    cpSync(nodeLicense, join(out, 'NODE_LICENSE.txt'));
  }
  const packages = new Map();
  for (const path of [
    ...Object.keys(result.metafile.inputs),
    'node_modules/playwright-core/package.json',
  ]) {
    if (!path.includes('node_modules/')) continue;
    let dir = dirname(resolve(path));
    while (dir.includes('node_modules')) {
      const json = join(dir, 'package.json');
      if (existsSync(json)) {
        const pkg = JSON.parse(readFileSync(json, 'utf8'));
        if (pkg.name) packages.set(pkg.name + '@' + pkg.version, { dir, pkg });
        break;
      }
      dir = dirname(dir);
    }
  }
  let notices = 'AURA Agent bundled third-party software\n\n';
  for (const [name, { dir, pkg }] of [...packages].sort()) {
    notices += `\n=== ${name} (${JSON.stringify(pkg.license ?? 'see package')}) ===\n`;
    const licenses = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
    for (const f of licenses) {
      try {
        notices += readFileSync(join(dir, f), 'utf8') + '\n';
      } catch {
        /* A license entry can be a directory; metadata remains in the notice. */
      }
    }
  }
  writeFileSync(join(out, 'THIRD_PARTY_NOTICES.txt'), notices);
  writeFileSync(
    join(out, 'package.json'),
    JSON.stringify({
      name: 'aura-agent-distribution',
      version: '0.1.0',
      type: 'module',
      private: true,
    }),
  );
  const files = {};
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (path !== join(out, 'manifest.json'))
        files[path.slice(out.length + 1).replaceAll('\\', '/')] = createHash('sha256')
          .update(readFileSync(path))
          .digest('hex');
    }
  }
  walk(out);
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify({ format: 1, target, node: '24.19.0', files }, null, 2),
  );
  rmSync(destination, { recursive: true, force: true });
  renameSync(out, destination);
  console.log(destination);
} finally {
  rmSync(out, { recursive: true, force: true });
}
