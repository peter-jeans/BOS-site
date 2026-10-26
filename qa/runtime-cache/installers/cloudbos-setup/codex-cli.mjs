// Pinned setup dependency, not an AI executor. No global install or trust writes.
import fs from 'node:fs/promises';
import {createReadStream, constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export const CODEX_SETUP_VERSION = '0.163.0';
const LICENSE = {path: 'LICENSE', size: 10926, sha256: 'd17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc'};
const NOTICE = {path: 'NOTICE', size: 242, sha256: '9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915'};
const PROFILES = {
  'darwin-arm64': {os: 'darwin', arch: 'arm64', executable: 'codex', size: 249952688,
    sha256: '8813367285524ac798dd96d1b071aea30d58708c7226fd236cd275cf1cfdee31',
    archive_sha256: '1193ff4ce72387a5d6c34820b54a9dc57d007c67a958e8acb4715924facd3c31'},
  'win32-x64': {os: 'win32', arch: 'x64', executable: 'codex.exe', size: 341270320,
    sha256: '2692c8c7bb2cf8b0aefe638741fc90236f4b824c59578ce84994f9de58200993',
    archive_sha256: '81377fd73b502a9e7208e32a4da2d468cdb3fc978e0b818c4707d846ad94eb1e'},
};
const fail = code => {throw Object.assign(new Error(code), {code});};
export function codexSetupProfile(id) {
  if (!Object.hasOwn(PROFILES, id)) fail('SUPPORTED_SETUP_CLI_PROFILE_REQUIRED');
  return Object.freeze({id, version: CODEX_SETUP_VERSION, ...PROFILES[id],
    source: `https://registry.npmjs.org/@openai/codex/-/codex-${CODEX_SETUP_VERSION}-${id}.tgz`,
    notices_source_commit: '83086188ae0614bd882818ff1aa23f3194962012'});
}
export const codexSetupCacheName = id => {
  const p = codexSetupProfile(id);
  return `codex-${p.version}-${id}-${p.sha256.slice(0, 16)}`;
};
async function directory(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('EXACT_SETUP_CLI_DIRECTORY_REQUIRED');
  root = path.normalize(root);
  if (root === path.parse(root).root || await fs.realpath(root) !== root
    || !(await fs.lstat(root)).isDirectory()) fail('CANONICAL_SETUP_CLI_DIRECTORY_REQUIRED');
  return root;
}
async function exactFile(filename, {size, sha256}) {
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== size) fail('SETUP_CLI_FILE_SIZE_OR_TYPE_MISMATCH');
  const digest = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    bytes += chunk.length; if (bytes > size) fail('SETUP_CLI_FILE_CHANGED'); digest.update(chunk);
  }
  const after = await fs.lstat(filename);
  if (bytes !== size || before.ino !== after.ino || before.dev !== after.dev
    || before.mtimeMs !== after.mtimeMs || after.size !== size) fail('SETUP_CLI_FILE_CHANGED');
  if (digest.digest('hex') !== sha256) fail('SETUP_CLI_FILE_HASH_MISMATCH');
}
const descriptor = p => ({schema: 'CLOUDBOS_PRIVATE_SETUP_CLI_V1', profile: p.id, version: p.version,
  executable: p.executable, executable_sha256: p.sha256, source: p.source,
  archive_sha256: p.archive_sha256, notices_source_commit: p.notices_source_commit,
  license_sha256: LICENSE.sha256, notice_sha256: NOTICE.sha256,
  use: 'SETUP_PLUGIN_AND_METADATA_ONLY', authority_granted: false,
  native_trust: 'NOT_GRANTED_BY_CACHE', authenticated_account: 'NOT_ATTESTED'});

export async function verifyCodexSetup(root, id, {installed = false} = {}) {
  const p = codexSetupProfile(id); root = await directory(root);
  const expected = [p.executable, 'LICENSE', 'NOTICE', ...(installed ? ['setup-cli.json'] : [])].sort();
  const entries = await fs.readdir(root, {withFileTypes: true});
  if (entries.some(e => !e.isFile() || e.isSymbolicLink())
    || JSON.stringify(entries.map(e => e.name).sort()) !== JSON.stringify(expected)) fail('SETUP_CLI_INVENTORY_MISMATCH');
  for (const item of [{path: p.executable, size: p.size, sha256: p.sha256}, LICENSE, NOTICE]) {
    await exactFile(path.join(root, item.path), item);
  }
  if (installed) {
    const filename = path.join(root, 'setup-cli.json'), stat = await fs.lstat(filename);
    if (stat.size > 4096) fail('SETUP_CLI_DESCRIPTOR_INVALID');
    let saved; try {saved = JSON.parse(await fs.readFile(filename, 'utf8'));} catch {fail('SETUP_CLI_DESCRIPTOR_INVALID');}
    if (JSON.stringify(saved) !== JSON.stringify(descriptor(p))) fail('SETUP_CLI_DESCRIPTOR_CHANGED');
    if (process.platform !== 'win32') await fs.access(path.join(root, p.executable), constants.X_OK);
  }
  return {status: 'SETUP_CLI_BYTES_VERIFIED', profile: id, version: p.version, root,
    executable: path.join(root, p.executable), sha256: p.sha256,
    publisher_signature: 'SEPARATE_NATIVE_READBACK_REQUIRED', authority_granted: false};
}

export async function installCodexSetup({sourceRoot, cacheRoot, profile: id, confirm = async () => false}) {
  const p = codexSetupProfile(id); await verifyCodexSetup(sourceRoot, id); cacheRoot = await directory(cacheRoot);
  const destination = path.join(cacheRoot, codexSetupCacheName(id));
  try {await fs.lstat(destination); return {...await verifyCodexSetup(destination, id, {installed: true}), status: 'SETUP_CLI_REUSED'};}
  catch (e) {if (e.code !== 'ENOENT') throw e;}
  if (await confirm({kind: 'INSTALL_PRIVATE_SETUP_CLI', profile: id, version: p.version,
    executable_sha256: p.sha256, destination, global_install: false, global_PATH_change: false,
    model_execution: false, native_trust_change: false}) !== true) fail('USER_DEFERRED');
  try {await fs.mkdir(destination, {mode: 0o700});}
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {return {...await verifyCodexSetup(destination, id, {installed: true}), status: 'SETUP_CLI_REUSED'};}
    catch {fail('CONCURRENT_OR_PARTIAL_SETUP_CLI_REVIEW_REQUIRED');}
  }
  for (const relative of [p.executable, 'LICENSE', 'NOTICE']) {
    const target = path.join(destination, relative);
    await fs.copyFile(path.join(sourceRoot, relative), target, constants.COPYFILE_EXCL);
    await fs.chmod(target, relative === p.executable ? 0o555 : 0o444);
  }
  await fs.writeFile(path.join(destination, 'setup-cli.json'), JSON.stringify(descriptor(p)) + '\n', {flag: 'wx', mode: 0o444});
  return {...await verifyCodexSetup(destination, id, {installed: true}), status: 'SETUP_CLI_INSTALLED'};
}

export async function probeCodexSetup(root, id) {
  const p = codexSetupProfile(id);
  if (p.os !== process.platform || p.arch !== process.arch) fail('NATIVE_SETUP_CLI_PLATFORM_REQUIRED');
  const verified = await verifyCodexSetup(root, id, {installed: true});
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  return new Promise((resolve, reject) => {
    let output = '', done = false, cleanup;
    const child = spawn(verified.executable, ['--no-daemon', '--version'], {env, shell: false,
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
    const finish = error => {
      if (done) return; done = true; clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(); cleanup = setTimeout(() => child.kill('SIGKILL'), 500); cleanup.unref();
      }
      if (error) reject(Object.assign(new Error(error), {code: error}));
      else resolve({...verified, status: 'NATIVE_SETUP_CLI_VERSION_OBSERVED', observed_version: output.trim(),
        system_CLI_required: false, global_PATH_changed: false, model_started: false});
    };
    const timer = setTimeout(() => finish('SETUP_CLI_PROBE_TIMEOUT'), 5000);
    child.stdout.on('data', bytes => {output += bytes; if (output.length > 256) finish('SETUP_CLI_PROBE_OUTPUT_INVALID');});
    child.once('error', () => finish('SETUP_CLI_PROBE_UNAVAILABLE'));
    child.once('close', code => {clearTimeout(cleanup); finish(code === 0 && output.trim() === `codex-cli ${p.version}` ? null : 'SETUP_CLI_VERSION_MISMATCH');});
  });
}
