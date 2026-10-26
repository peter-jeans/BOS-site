#!/usr/bin/env node
// Disposable native qualification only. Never copies credentials or approves hooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyPackage, verifyDistribution} from '../installers/cloudbos-setup/setup.mjs';
import {readCodexHooks, installedSignInCheckpoint} from '../installers/cloudbos-setup/codex-native.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!['--codex', '--setup', '--bundle', '--output'].includes(key) || !value || args[key]) throw Error('EXACT_QUALIFICATION_ARGUMENTS_REQUIRED');
  args[key] = path.resolve(value);
}
if (Object.keys(args).length !== 4) throw Error('EXACT_QUALIFICATION_ARGUMENTS_REQUIRED');
try {await fs.lstat(args['--output']); throw Error('NEW_RECEIPT_REQUIRED');} catch (e) {if (e.code !== 'ENOENT') throw e;}
const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-guided-native-')));
const home = path.join(workspace, 'codex-home'), cwd = path.join(workspace, 'public test app');
await fs.mkdir(home); await fs.mkdir(cwd);
// CODEX_HOME selects a supported disposable native profile. No existing auth,
// native trust, model configuration, BOS owner registry or project is copied.
const env = {CODEX_HOME: home};
for (const name of ['PATH', 'USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA']) if (process.env[name]) env[name] = process.env[name];
const guardPaths = [path.join(os.homedir(), '.codex', 'config.toml'), path.join(os.homedir(), '.config', 'bos', 'hook-owners.json')];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function guardReadback() {
  return Promise.all(guardPaths.map(async filename => {
    try {return hash(await fs.readFile(filename));} catch (e) {if (e.code === 'ENOENT') return 'ABSENT'; throw e;}
  }));
}
const before = await guardReadback(), calls = [];
async function run(argv, json = true) {
  calls.push(argv);
  return new Promise((resolve, reject) => {
    let done = false, size = 0, output = '', cleanup;
    const child = spawn(args['--codex'], ['--no-daemon', ...argv], {cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(); cleanup = setTimeout(() => child.kill('SIGKILL'), 500); cleanup.unref();
      }
      if (error) reject(Error(error)); else resolve(value);
    };
    const timer = setTimeout(() => finish('NATIVE_QUALIFICATION_TIMEOUT'), 25000);
    child.stdout.on('data', bytes => {size += bytes.length; if (size > 4194304) finish('NATIVE_QUALIFICATION_OVERSIZE'); else output += bytes;});
    child.stderr.on('data', () => {});
    child.once('error', () => finish('NATIVE_QUALIFICATION_UNAVAILABLE'));
    child.once('close', code => {
      clearTimeout(cleanup);
      if (code !== 0) finish('NATIVE_QUALIFICATION_COMMAND_FAILED');
      else {try {finish(null, json ? JSON.parse(output) : output.trim());} catch {finish('NATIVE_QUALIFICATION_METADATA_INVALID');}}
    });
  });
}
const release = await verifyDistribution(args['--setup']);
if (release.delivery !== 'QUALIFICATION_ONLY') throw Error('QUALIFICATION_ONLY_PACKAGE_REQUIRED');
const pkg = await verifyPackage(args['--bundle'], release);
const hostVersion = await run(['--version'], false);
const initial = await run(['plugin', 'marketplace', 'list', '--json']);
const initialRows = Array.isArray(initial) ? initial : initial.marketplaces;
if (!Array.isArray(initialRows) || initialRows.length) throw Error('DISPOSABLE_NATIVE_PROFILE_NOT_EMPTY');
await run(['plugin', 'marketplace', 'add', pkg.root, '--json']);
const installed = await run(['plugin', 'add', 'cloudbos-public-plugin@cloudbos-public', '--json']);
if (installed.version !== release.plugin_version || installed.authPolicy !== 'ON_USE'
  || !installed.installedPath?.startsWith(home + path.sep)) throw Error('EXACT_NATIVE_INSTALL_OR_AUTH_ORDER_FAILED');
const nativeRead = input => readCodexHooks({...input, env});
const metadata = await nativeRead({executable: args['--codex'], cwd});
const group = metadata.data?.find(item => item.cwd === cwd);
if (!group || group.errors?.length || group.warnings?.length || group.hooks?.length !== 6
  || group.hooks.some(hook => hook.enabled !== true || hook.trustStatus !== 'untrusted')) throw Error('CLEAN_NATIVE_HOOK_REVIEW_REQUIRED');
const checkpoint = await installedSignInCheckpoint({executable: args['--codex'], cwd, verifiedPackage: pkg,
  pluginId: installed.pluginId, pluginVersion: release.plugin_version, nativeRead});
if (checkpoint.status !== 'WAITING_NATIVE_HOOK_APPROVAL' || checkpoint.may_start_sign_in !== false) throw Error('UNTRUSTED_HOOKS_DID_NOT_HOLD_SIGN_IN');
const after = await guardReadback();
if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('OWNER_SETTINGS_CHANGED_DURING_TEST');
const evidence = {schema: 'BOS_GUIDED_ISOLATED_NATIVE_INSTALL_V2', at: new Date().toISOString(),
  platform: process.platform, architecture: process.arch, host_version: hostVersion,
  public_plugin: release.plugin_version, package_digest: release.package_digest, setup_version: release.setup_version,
  isolated_profile: home, native_install: installed,
  hooks: group.hooks.map(hook => ({event: hook.eventName, enabled: hook.enabled, trust: hook.trustStatus, timeout: hook.timeoutSec})),
  native_warnings: group.warnings, native_errors: group.errors, checkpoint,
  owner_config_and_hook_registry: 'BYTE_IDENTICAL', calls, model_started: false, oauth_started: false,
  hook_trust_written: false, actual_hook_execution: 'NOT_OBSERVED', full_desktop_journey: 'NOT_QUALIFIED',
  desktop_only_prerequisites: 'NOT_QUALIFIED', public_release: false,
  acceptance_status: 'PARTIAL_VERIFIED', claim: 'Native CLI installation, exact files, deferred auth and genuine untrusted-hook hold only'};
await fs.writeFile(args['--output'], JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
console.log('BOS_NATIVE_QUALIFICATION_RESULT ' + JSON.stringify(evidence));
