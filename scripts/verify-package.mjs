import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export function verifyPackage(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const actual = [];
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (path !== join(root, 'manifest.json'))
        actual.push(path.slice(root.length + 1).replaceAll('\\', '/'));
    }
  }
  walk(root);
  assert.deepEqual(
    Object.keys(manifest.files).sort(),
    actual.sort(),
    'manifest must list exactly the package files, excluding itself',
  );
  for (const [name, hash] of Object.entries(manifest.files)) {
    const file = resolve(root, name);
    assert.ok(file.startsWith(root + sep));
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash, name);
  }
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyPackage(process.argv[2]);
  console.log('PASS: package manifest and all file SHA256 values');
}
