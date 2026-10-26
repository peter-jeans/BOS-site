#!/usr/bin/env node
// Real native host-stage qualification, not a desktop click-through certificate.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {installRuntime} from '../installers/cloudbos-setup/runtime.mjs';
import {installCodexSetup} from '../installers/cloudbos-setup/codex-cli.mjs';
import {installCodexDesktop} from '../installers/cloudbos-setup/desktop.mjs';
import {readCodexHooks} from '../installers/cloudbos-setup/codex-native.mjs';

const args = {}, names = ['--runtime-source', '--cli-source', '--setup', '--bundle', '--output'];
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!names.includes(key) || !value || args[key]) throw Error('EXACT_DESKTOP_QUALIFICATION_ARGUMENTS_REQUIRED');
  args[key] = path.resolve(value);
}
if (Object.keys(args).length !== names.length) throw Error('EXACT_DESKTOP_QUALIFICATION_ARGUMENTS_REQUIRED');
try {await fs.lstat(args['--output']); throw Error('NEW_RECEIPT_REQUIRED');} catch (e) {if (e.code !== 'ENOENT') throw e;}
const work = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-desktop-native-')));
const cache = path.join(work, 'dependencies'), home = path.join(work, 'native home');
await fs.mkdir(cache); await fs.mkdir(home);
const profile = `${process.platform}-${process.arch}`;
const node = await installRuntime({sourceRoot: await fs.realpath(args['--runtime-source']), cacheRoot: cache, profile, confirm: async () => true});
const cli = await installCodexSetup({sourceRoot: await fs.realpath(args['--cli-source']), cacheRoot: cache, profile, confirm: async () => true});
const env = {CODEX_HOME: home, PATH: [path.dirname(node.executable), ...(process.platform === 'win32'
  ? [path.join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'])].join(path.delimiter)};
for (const key of ['USER', 'LOGNAME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
const guardPaths = [path.join(os.homedir(), '.codex/config.toml'), path.join(os.homedir(), '.config/bos/hook-owners.json')];
const guards = () => Promise.all(guardPaths.map(async p => {
  try {return createHash('sha256').update(await fs.readFile(p)).digest('hex');}
  catch (e) {if (e.code === 'ENOENT') return 'ABSENT'; throw e;}
}));
const before = await guards(), calls = [], contexts = new Set();
const runner = async (exe, argv, {cwd} = {}) => {
  assert.equal(exe, cli.executable); assert.equal(argv[0], '--no-daemon');
  const tail = argv.slice(1);
  const allowed = tail[0] === '--version' || tail[0] === 'plugin' && (
    tail[1] === 'list' || tail[1] === 'marketplace' && ['list', 'add'].includes(tail[2])
    || tail[1] === 'add' && tail[2] === 'cloudbos-public-plugin@cloudbos-public');
  assert.equal(allowed, true, 'Qualification cannot start an account, model or trust operation');
  assert.ok(cwd && path.isAbsolute(cwd)); contexts.add(cwd); calls.push(tail);
  const result = spawnSync(exe, argv, {cwd, env, shell: false, windowsHide: true,
    encoding: 'utf8', timeout: 25000, maxBuffer: 1048576});
  return {code: result.status ?? 124, stdout: result.stdout || ''};
};
const input = {distributionRoot: args['--setup'], localPackage: args['--bundle'], executable: cli.executable,
  runner, nativeRead: options => readCodexHooks({...options, env})};
await assert.rejects(installCodexDesktop(input), error => error.code === 'USER_DEFERRED');
assert.equal(calls.some(c => c[0] === 'plugin' && c.includes('add')), false, 'Declining must not register/install BOS');
let decisions = 0;
const installed = await installCodexDesktop({...input, confirm: async action => {
  decisions++; assert.equal(action.scope, 'USER_PLUGIN_ONLY'); assert.equal(action.project_selected, false);
  assert.equal(action.account_sign_in, false); assert.equal(action.native_hook_trust_change, false); return true;
}});
assert.equal(decisions, 1); assert.equal(installed.status, 'WAITING_NATIVE_HOOK_APPROVAL');
assert.equal(installed.project_setup, 'NOT_SELECTED'); assert.equal(installed.customer_project_written, false);
assert.equal(installed.native_checks.may_start_sign_in, false); assert.equal(installed.oauth_started, false);
assert.equal(installed.installed_inventory, 'EXACT_VERIFIED_PUBLIC_PACKAGE');
const detail = new URL(installed.native_detail_url);
assert.equal(detail.protocol, 'codex:'); assert.equal(detail.hostname, 'plugins');
assert.equal(detail.pathname, '/cloudbos-public-plugin');
assert.equal(detail.searchParams.get('marketplacePath'), path.join(args['--bundle'], '.agents/plugins/marketplace.json'));
const reused = await installCodexDesktop({...input, confirm: async () => {throw Error('Verified existing install must not repeat installation');}});
assert.equal(reused.status, installed.status);
assert.equal(calls.filter(c => c[0] === 'plugin' && c[1] === 'add').length, 1);
for (const context of contexts) {
  assert.deepEqual(await fs.readdir(context), ['INSTALL_CONTEXT.json']);
  assert.equal(JSON.parse(await fs.readFile(path.join(context, 'INSTALL_CONTEXT.json'))).customer_project, false);
}
assert.deepEqual(await guards(), before);
const evidence = {schema: 'BOS_NATIVE_DESKTOP_HOST_STAGE_V1', at: new Date().toISOString(),
  platform: process.platform, architecture: process.arch, plugin_version: installed.plugin_version,
  package_digest: installed.package_digest, result: installed, native_user_decline: 'NO_PLUGIN_MUTATION',
  existing_exact_install: 'REUSED_WITHOUT_REINSTALL', context_type: 'INSTALLER_ONLY_NOT_CUSTOMER_PROJECT',
  owner_config_and_hook_registry: 'BYTE_IDENTICAL', system_CLI_required: false,
  customer_folder_required: false, calls, native_hook_trust_written: false, oauth_started: false,
  desktop_navigation: 'NOT_OBSERVED', actual_hook_execution: 'NOT_OBSERVED',
  full_customer_journey: 'NOT_QUALIFIED', public_release: false, acceptance_status: 'PARTIAL_VERIFIED'};
await fs.writeFile(args['--output'], JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
console.log('BOS_DESKTOP_HOST_STAGE_RESULT ' + JSON.stringify(evidence));
