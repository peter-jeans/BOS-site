// Private native-window bridge. Qualification only, never the owner's profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyDistribution, verifyPackage} from './setup.mjs';
import {verifyRuntime, installRuntime} from './runtime.mjs';
import {verifyCodexSetup, installCodexSetup} from './codex-cli.mjs';
import {installCodexDesktop} from './desktop.mjs';
import {readCodexHooks} from './codex-native.mjs';

const fail = code => {throw Object.assign(new Error(code), {code});};
async function entry() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--resources' || args[2] !== '--action'
    || !['preflight', 'install'].includes(args[3]) || !path.isAbsolute(args[1])) fail('EXACT_NATIVE_SETUP_ARGUMENTS_REQUIRED');
  const resources = await fs.realpath(args[1]);
  if (path.join(resources, 'engine', 'desktop-entry.mjs') !== fileURLToPath(import.meta.url)) fail('EXACT_NATIVE_SETUP_BUNDLE_REQUIRED');
  const descriptor = JSON.parse(await fs.readFile(path.join(resources, 'DESKTOP_MANIFEST.json'), 'utf8'));
  const profile = `${process.platform}-${process.arch}`;
  if (descriptor.schema !== 'CLOUDBOS_DESKTOP_QUALIFICATION_V1' || descriptor.delivery !== 'QUALIFICATION_ONLY'
    || descriptor.profile !== profile || descriptor.public_release !== false) fail('NATIVE_QUALIFICATION_PROFILE_REQUIRED');
  const release = await verifyDistribution(path.join(resources, 'sealed-setup'));
  const pkg = await verifyPackage(path.join(resources, 'package'), release);
  const runtimeSource = path.join(resources, 'vendor', 'node'), cliSource = path.join(resources, 'vendor', 'codex');
  await verifyRuntime(runtimeSource, profile); await verifyCodexSetup(cliSource, profile);
  if (args[3] === 'preflight') return {status: 'READY_TO_TEST_INSTALL',
    message: 'BOS download checked. This test build uses a separate Codex profile.',
    plugin_version: release.plugin_version, public_release: false, changes_made: false};
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-native-window-qa-')));
  const cache = path.join(workspace, 'dependencies'), home = path.join(workspace, 'codex-home');
  await fs.mkdir(cache); await fs.mkdir(home);
  const runtime = await installRuntime({sourceRoot: runtimeSource, cacheRoot: cache, profile, confirm: async () => true});
  const cli = await installCodexSetup({sourceRoot: cliSource, cacheRoot: cache, profile, confirm: async () => true});
  const env = {CODEX_HOME: home, PATH: [path.dirname(runtime.executable), ...(process.platform === 'win32'
    ? [path.join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'])].join(path.delimiter)};
  for (const key of ['USER', 'LOGNAME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
    'SystemRoot', 'WINDIR', 'COMSPEC', 'TMPDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const runner = (executable, argv, {cwd} = {}) => new Promise(resolve => {
    let stdout = '', bytes = 0, done = false, cleanup;
    const child = spawn(executable, argv, {cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']});
    const finish = code => {
      if (done) return; done = true; clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(); cleanup = setTimeout(() => child.kill('SIGKILL'), 500); cleanup.unref();
      }
      resolve({code, stdout: code === 0 ? stdout : ''});
    };
    const timer = setTimeout(() => finish(124), 25000);
    child.stdout.on('data', b => {bytes += b.length; if (bytes > 1048576) finish(125); else stdout += b;});
    child.once('error', () => finish(127)); child.once('close', code => {clearTimeout(cleanup); finish(code ?? 124);});
  });
  const result = await installCodexDesktop({distributionRoot: path.join(resources, 'sealed-setup'), localPackage: pkg.root,
    executable: cli.executable, runner, nativeRead: input => readCodexHooks({...input, env}), confirm: async () => true});
  const receipt = {schema: 'CLOUDBOS_NATIVE_WINDOW_QUALIFICATION_RESULT_V1', at: new Date().toISOString(),
    delivery: 'QUALIFICATION_ONLY', result, code_profile: 'FRESH_DISPOSABLE',
    native_hook_trust_written: false, owner_registration_changed: false,
    customer_project_written: false, oauth_started: false, public_release: false};
  const saved = path.join(workspace, 'qualification-result.json');
  await fs.writeFile(saved, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {status: result.status, message: result.status === 'WAITING_NATIVE_HOOK_APPROVAL'
    ? 'Test installation passed. Codex correctly requires approval of the automatic checks. Your everyday Codex installation is unchanged.'
    : 'The native install needs review before continuing.',
    plugin_version: release.plugin_version, exact_native_definition_count: result.native_checks.exact_native_definition_count,
    receipt: saved, receipt_sha256: createHash('sha256').update(await fs.readFile(saved)).digest('hex'),
    public_release: false, test_profile_only: true,
    native_navigation: 'HELD_TEST_PROFILE_MUST_NOT_OPEN_IN_OWNER_SESSION'};
}
try {console.log(JSON.stringify(await entry()));}
catch (error) {
  console.log(JSON.stringify({status: 'SETUP_NEEDS_REVIEW', code: /^[A-Z][A-Z0-9_]+$/.test(error.code || '')
    ? error.code : 'NATIVE_SETUP_STEP_FAILED', message: 'Setup stopped safely. Your project and approval settings have not been changed.', public_release: false}));
  process.exitCode = 1;
}
