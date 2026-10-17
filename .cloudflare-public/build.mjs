import { readFileSync, readdirSync, lstatSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(here, 'dist');
const manifest = JSON.parse(readFileSync(resolve(here, 'assets-manifest.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = Object.keys(manifest.files).sort();
const sourceManifest = JSON.parse(readFileSync(resolve(here, 'marketplace-source-manifest.json')));
assert.equal(sourceManifest.schema, 'BOS_PUBLIC_MARKETPLACE_SOURCE_MANIFEST_V1');
const sourceFiles = Object.keys(sourceManifest.files);
assert(sourceFiles.every(name => !files.includes(name)), 'Source and web asset partitions must be disjoint');
assert(sourceFiles.every(name => name.startsWith('public-plugin-releases/') || ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json'].includes(name)), 'Unexpected marketplace source path');
const allFiles = [...files, ...sourceFiles].sort();
const allEntries = { ...manifest.files, ...sourceManifest.files };
assert.equal(manifest.schema, 'BOS_PUBLIC_STATIC_ASSET_MANIFEST_V1');
assert(files.includes('index.html') && files.includes('setup.html'));
for (const name of allFiles) {
  assert(!name.startsWith('/') && !name.split('/').some(p => p === '..' || p === '.' || p === '.git'));
  const path = resolve(root, name);
  assert(path.startsWith(root + sep) && !path.startsWith(here + sep));
  let part = root;
  for (const segment of name.split('/')) {
    part = resolve(part, segment);
    assert(!lstatSync(part).isSymbolicLink(), `Symlink rejected: ${name}`);
  }
  assert(lstatSync(path).isFile());
  assert.equal(lstatSync(path).size, allEntries[name].bytes, `Input size mismatch: ${name}`);
  assert.equal(hash(readFileSync(path)), allEntries[name].sha256, `Input mismatch: ${name}`);
}
// Reject unreviewed web assets. Deployment metadata is never an asset input.
const observed = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === root && ['.git', '.github', '.cloudflare-public'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Symlink rejected: ${path}`);
    if (entry.isDirectory()) walk(path);
    else observed.push(relative(root, path).split(sep).join('/'));
  }
}
walk(root);
assert.deepEqual(observed.sort(), allFiles, 'Unreviewed or missing public input');
if (!process.argv.includes('--check')) {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const name of files) {
    const dest = resolve(output, name);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(resolve(root, name), dest);
  }
  copyFileSync(resolve(here, 'asset-routing.txt'), resolve(output, '_redirects'));
}
console.log(JSON.stringify({ status: 'PASS', assets: files.length, marketplace_source_files: sourceFiles.length, manifest_sha256: hash(readFileSync(resolve(here, 'assets-manifest.json'))), mode: process.argv.includes('--check') ? 'check' : 'build' }));
