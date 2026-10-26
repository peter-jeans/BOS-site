#!/usr/bin/env node
// Native dependency integration in a disposable profile. No OAuth or hook trust.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {installRuntime, probeRuntime} from '../installers/cloudbos-setup/runtime.mjs';
import {installCodexSetup, probeCodexSetup} from '../installers/cloudbos-setup/codex-cli.mjs';

const names = ['--runtime-source', '--cli-source', '--qualifier', '--setup', '--bundle', '--output'];
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!names.includes(key) || !value || args[key]) throw Error('EXACT_DEPENDENCY_QUALIFICATION_ARGUMENTS_REQUIRED');
  args[key] = path.resolve(value);
}
if (Object.keys(args).length !== names.length) throw Error('EXACT_DEPENDENCY_QUALIFICATION_ARGUMENTS_REQUIRED');
try {await fs.lstat(args['--output']); throw Error('NEW_RECEIPT_REQUIRED');} catch (e) {if (e.code !== 'ENOENT') throw e;}
const profile = `${process.platform}-${process.arch}`;
const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-private-dependencies-')));
const cache = path.join(workspace, 'private dependencies'); await fs.mkdir(cache);
// Owner-authorised qualification installs only under this new temp directory.
// Production setup must ask its own exact dependency installation question.
const runtime = await installRuntime({sourceRoot: await fs.realpath(args['--runtime-source']), cacheRoot: cache,
  profile, confirm: async () => true});
const cli = await installCodexSetup({sourceRoot: await fs.realpath(args['--cli-source']), cacheRoot: cache,
  profile, confirm: async () => true});
const runtimeProbe = await probeRuntime(runtime.root, profile), cliProbe = await probeCodexSetup(cli.root, profile);
const env = {PATH: [path.dirname(runtime.executable), ...(process.platform === 'win32'
  ? [path.join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'])].join(path.delimiter)};
for (const name of ['USER', 'LOGNAME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA']) if (process.env[name]) env[name] = process.env[name];
const nativeOutput = path.join(workspace, 'native-install.json');
const result = spawnSync(runtime.executable, [args['--qualifier'], '--codex', cli.executable,
  '--setup', args['--setup'], '--bundle', args['--bundle'], '--output', nativeOutput],
{cwd: workspace, env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 1048576});
if (result.status !== 0) {
  // No raw host stderr/config/auth content is propagated by this public test.
  throw Error('PRIVATE_DEPENDENCY_NATIVE_INSTALL_FAILED');
}
const native = JSON.parse(await fs.readFile(nativeOutput, 'utf8'));
if (native.checkpoint?.status !== 'WAITING_NATIVE_HOOK_APPROVAL' || native.model_started !== false
  || native.oauth_started !== false || native.hook_trust_written !== false
  || native.owner_config_and_hook_registry !== 'BYTE_IDENTICAL') throw Error('PRIVATE_DEPENDENCY_NATIVE_GATES_CHANGED');
const evidence = {schema: 'BOS_PRIVATE_DEPENDENCY_NATIVE_INTEGRATION_V1', at: new Date().toISOString(),
  platform: process.platform, architecture: process.arch, runtime: runtimeProbe, setup_cli: cliProbe,
  system_Node_required_for_child: false, system_CLI_required: false, global_PATH_changed: false,
  inherited_auth_or_model_environment: false, native_install: native,
  delivery: 'QUALIFICATION_ONLY', desktop_launcher_without_prerequisites: 'NOT_QUALIFIED',
  native_hook_execution: 'NOT_OBSERVED', signing: 'SEPARATE_READBACK_REQUIRED', public_release: false,
  acceptance_status: 'PARTIAL_VERIFIED'};
await fs.writeFile(args['--output'], JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
console.log('BOS_PRIVATE_DEPENDENCY_RESULT ' + JSON.stringify(evidence));
