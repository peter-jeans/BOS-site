// Private, versioned dependency cache. No global install, PATH or trust writes.
import fs from 'node:fs/promises';
import {createReadStream, constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export const NODE_VERSION = '24.22.1';
const PROFILES = Object.freeze({
  'darwin-arm64': Object.freeze({os: 'darwin', arch: 'arm64', executable: 'bin/node',
    archive: 'node-v24.22.1-darwin-arm64.tar.gz',
    archive_sha256: '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7',
    size: 122545856, sha256: '6f32069480ec14d52b6d7b1f3c7124cfbbc46203abf5ddf5c65b127435f3f329',
    license_size: 157609, license_sha256: '5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace'}),
  'win32-x64': Object.freeze({os: 'win32', arch: 'x64', executable: 'node.exe',
    archive: 'node-v24.22.1-win-x64.zip',
    archive_sha256: 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5',
    size: 93915464, sha256: 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5',
    license_size: 160555, license_sha256: 'ed34dd8e3f0a78dbaf00d0444ce8e285b015b765379c2e17880455f70370f8e9'}),
});
const fail = code => {throw Object.assign(new Error(code), {code});};
export function runtimeProfile(id) {
  if (!Object.hasOwn(PROFILES, id)) fail('SUPPORTED_RUNTIME_PROFILE_REQUIRED');
  return Object.freeze({id, version: NODE_VERSION, ...PROFILES[id]});
}
export function runtimeCacheName(id) {
  const profile = runtimeProfile(id);
  return `node-v${NODE_VERSION}-${id}-${profile.sha256.slice(0, 16)}`;
}

async function canonicalDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('EXACT_RUNTIME_DIRECTORY_REQUIRED');
  directory = path.normalize(directory);
  if (directory === path.parse(directory).root || await fs.realpath(directory) !== directory
    || !(await fs.lstat(directory)).isDirectory()) fail('CANONICAL_RUNTIME_DIRECTORY_REQUIRED');
  return directory;
}

async function regularHash(filename, expectedSize, expectedHash) {
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== expectedSize) fail('RUNTIME_FILE_SIZE_OR_TYPE_MISMATCH');
  const digest = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length;
    if (bytes > expectedSize) fail('RUNTIME_FILE_CHANGED');
    digest.update(chunk);
  }
  const after = await fs.lstat(filename);
  if (bytes !== expectedSize || before.ino !== after.ino || before.dev !== after.dev
    || before.mtimeMs !== after.mtimeMs || after.size !== expectedSize) fail('RUNTIME_FILE_CHANGED');
  if (digest.digest('hex') !== expectedHash) fail('RUNTIME_FILE_HASH_MISMATCH');
}

async function inventory(root, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes: true})) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail('RUNTIME_SYMLINK_DENIED');
    if (entry.isDirectory() && name === 'bin') result.push(...await inventory(root, name));
    else if (entry.isFile()) result.push(name);
    else fail('RUNTIME_UNEXPECTED_ENTRY');
    if (result.length > 3) fail('RUNTIME_UNEXPECTED_ENTRY');
  }
  return result.sort();
}

const descriptor = profile => ({schema: 'CLOUDBOS_PRIVATE_RUNTIME_V1', profile: profile.id,
  version: NODE_VERSION, executable: profile.executable, executable_sha256: profile.sha256,
  license_sha256: profile.license_sha256, source: `https://nodejs.org/download/release/v${NODE_VERSION}/${profile.archive}`,
  archive_sha256: profile.archive_sha256, grants_authority: false, native_acceptance: 'NOT_GRANTED_BY_CACHE'});

export async function verifyRuntime(root, id, {installed = false} = {}) {
  const profile = runtimeProfile(id); root = await canonicalDirectory(root);
  const expected = [profile.executable, 'LICENSE', ...(installed ? ['runtime.json'] : [])].sort();
  if (JSON.stringify(await inventory(root)) !== JSON.stringify(expected)) fail('RUNTIME_INVENTORY_MISMATCH');
  // Reject a linked bin directory as well as linked files.
  const executable = path.join(root, profile.executable);
  if (await fs.realpath(executable) !== executable) fail('RUNTIME_SYMLINK_DENIED');
  await regularHash(executable, profile.size, profile.sha256);
  await regularHash(path.join(root, 'LICENSE'), profile.license_size, profile.license_sha256);
  if (installed) {
    const p = path.join(root, 'runtime.json'), stat = await fs.lstat(p);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) fail('RUNTIME_DESCRIPTOR_INVALID');
    let saved; try {saved = JSON.parse(await fs.readFile(p, 'utf8'));} catch {fail('RUNTIME_DESCRIPTOR_INVALID');}
    if (JSON.stringify(saved) !== JSON.stringify(descriptor(profile))) fail('RUNTIME_DESCRIPTOR_CHANGED');
    if (process.platform !== 'win32') await fs.access(executable, constants.X_OK);
  }
  return {status: 'RUNTIME_BYTES_VERIFIED', profile: id, version: NODE_VERSION, root,
    executable, sha256: profile.sha256, publisher_signature: 'SEPARATE_NATIVE_READBACK_REQUIRED',
    authority_granted: false};
}

// The interactive install decision covers this exact public dependency and its
// pinned bytes. Verification never supplies that decision or native hook trust.
export async function installRuntime({sourceRoot, cacheRoot, profile: id, confirm = async () => false}) {
  const profile = runtimeProfile(id);
  await verifyRuntime(sourceRoot, id);
  cacheRoot = await canonicalDirectory(cacheRoot);
  const destination = path.join(cacheRoot, runtimeCacheName(id));
  try {await fs.lstat(destination); return {...await verifyRuntime(destination, id, {installed: true}), status: 'RUNTIME_REUSED'};}
  catch (e) {if (e.code !== 'ENOENT') throw e;}
  if (await confirm({kind: 'INSTALL_PRIVATE_RUNTIME', profile: id, version: NODE_VERSION,
    executable_sha256: profile.sha256, source: descriptor(profile).source, destination,
    global_install: false, global_PATH_change: false}) !== true) fail('USER_DEFERRED');
  try {await fs.mkdir(destination, {mode: 0o700});}
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {return {...await verifyRuntime(destination, id, {installed: true}), status: 'RUNTIME_REUSED'};}
    catch {fail('CONCURRENT_OR_PARTIAL_RUNTIME_REVIEW_REQUIRED');}
  }
  // Do not overwrite an existing or interrupted cache. A failure leaves a
  // visible incomplete state, never a success marker or silently chosen Node.
  for (const relative of [profile.executable, 'LICENSE']) {
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), {recursive: true, mode: 0o700});
    await fs.copyFile(path.join(sourceRoot, relative), target, constants.COPYFILE_EXCL);
    await fs.chmod(target, relative === 'LICENSE' ? 0o444 : 0o555);
  }
  await fs.writeFile(path.join(destination, 'runtime.json'), JSON.stringify(descriptor(profile)) + '\n', {flag: 'wx', mode: 0o444});
  return {...await verifyRuntime(destination, id, {installed: true}), status: 'RUNTIME_INSTALLED'};
}

export async function probeRuntime(root, id) {
  const profile = runtimeProfile(id);
  if (profile.os !== process.platform || profile.arch !== process.arch) fail('NATIVE_RUNTIME_PLATFORM_REQUIRED');
  const verified = await verifyRuntime(root, id, {installed: true});
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  // Do not inherit NODE_OPTIONS, preload modules, account data or model tokens.
  return new Promise((resolve, reject) => {
    const child = spawn(verified.executable, ['--version'], {env, shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']});
    let output = '', done = false, cleanup;
    const finish = error => {
      if (done) return; done = true; clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(); cleanup = setTimeout(() => child.kill('SIGKILL'), 500); cleanup.unref();
      }
      if (error) reject(Object.assign(new Error(error), {code: error}));
      else resolve({...verified, status: 'NATIVE_RUNTIME_VERSION_OBSERVED', observed_version: output.trim(),
        system_Node_required: false, global_PATH_changed: false});
    };
    const timer = setTimeout(() => finish('RUNTIME_PROBE_TIMEOUT'), 5000);
    child.stdout.on('data', chunk => {output += chunk; if (output.length > 256) finish('RUNTIME_PROBE_OUTPUT_INVALID');});
    child.once('error', () => finish('RUNTIME_PROBE_UNAVAILABLE'));
    child.once('close', code => {clearTimeout(cleanup); finish(code === 0 && output.trim() === `v${NODE_VERSION}` ? null : 'RUNTIME_VERSION_MISMATCH');});
  });
}
