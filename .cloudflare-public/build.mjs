import { readFileSync, readdirSync, lstatSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const output = resolve(here, 'dist');
const approved = resolve(here, 'approved-assets');
const manifestPath = resolve(here, 'assets-manifest.json');
const readJson = name => JSON.parse(readFileSync(resolve(here, name)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = readJson('assets-manifest.json');
const market = readJson('marketplace-source-manifest.json');
const isolation = readJson('hosting-input-isolation.json');
const files = Object.keys(manifest.files).sort();
const marketplaceFiles = Object.keys(market.files);
const sourceOnlyFiles = Object.keys(isolation.files);
const companion = name => name.startsWith('companions/base44/');
const shadowable = name => name === 'setup.html' || companion(name);
const shadowed = files.filter(name => Object.hasOwn(isolation.files, name));
assert.equal(manifest.schema, 'BOS_PUBLIC_STATIC_ASSET_MANIFEST_V1');
assert.equal(market.schema, 'BOS_PUBLIC_MARKETPLACE_SOURCE_MANIFEST_V1');
assert.equal(isolation.schema, 'BOS_PUBLIC_HOSTING_INPUT_ISOLATION_V1');
assert(files.includes('index.html') && files.includes('setup.html'));
assert(marketplaceFiles.every(name => !Object.hasOwn(manifest.files, name) && !Object.hasOwn(isolation.files, name)),
  'Marketplace source must be separate from other inputs');
assert(marketplaceFiles.every(name => name.startsWith('public-plugin-releases/') || name.startsWith('public-plugin-candidates/') || ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json'].includes(name)), 'Unexpected marketplace source path');
assert(sourceOnlyFiles.every(name => shadowable(name) || name.startsWith('downloads/cloudbos-setup/')), 'Unexpected isolated source path');
assert(shadowed.every(shadowable), 'Only the setup page and Base44 companions can use a preserved live copy');
assert(!sourceOnlyFiles.includes('setup.html') || shadowed.includes('setup.html'), 'Setup page must remain hosted');

// Validate every root file, including candidates that will never be copied into dist.
const allEntries = { ...manifest.files, ...market.files, ...isolation.files };
function verifyFile(base, name, expected) {
  assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').some(p => !p || p === '..' || p === '.' || p === '.git'));
  const path = resolve(base, name);
  assert(path.startsWith(base + sep) && (base !== root || !path.startsWith(here + sep)));
  let part = base;
  for (const segment of name.split('/')) {
    part = resolve(part, segment);
    assert(!lstatSync(part).isSymbolicLink(), `Symlink rejected: ${part}`);
  }
  const stat = lstatSync(path);
  assert(stat.isFile());
  assert.equal(stat.size, expected.bytes, `Input size mismatch: ${name}`);
  assert.equal(hash(readFileSync(path)), expected.sha256, `Input mismatch: ${name}`);
  return path;
}
function inventory(base, skip = []) {
  const observed = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (directory === base && skip.includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      assert(!entry.isSymbolicLink(), `Symlink rejected: ${path}`);
      if (entry.isDirectory()) walk(path);
      else observed.push(relative(base, path).split(sep).join('/'));
    }
  }
  assert(lstatSync(base).isDirectory(), `Expected a directory: ${base}`);
  walk(base);
  return observed.sort();
}

const rootPaths = Object.keys(allEntries).sort();
for (const name of rootPaths) verifyFile(root, name, allEntries[name]);
assert.deepEqual(inventory(root, ['.git', '.github', '.cloudflare-public']), rootPaths, 'Unreviewed or missing public input');
assert.deepEqual(inventory(approved), shadowed, 'Unreviewed or missing preserved live copy');
const hosted = new Map(files.map(name => [name, Object.hasOwn(isolation.files, name)
  ? verifyFile(approved, name, manifest.files[name]) : resolve(root, name)]));
if (!process.argv.includes('--check')) {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const [name, source] of hosted) {
    const dest = resolve(output, name);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
  }
  copyFileSync(resolve(here, 'asset-routing.txt'), resolve(output, '_redirects'));
}
console.log(JSON.stringify({ status: 'PASS', assets: files.length, marketplace_source_files: marketplaceFiles.length,
  isolated_source_files: sourceOnlyFiles.length, preserved_live_copies: shadowed.length,
  manifest_sha256: hash(readFileSync(manifestPath)), mode: process.argv.includes('--check') ? 'check' : 'build' }));
