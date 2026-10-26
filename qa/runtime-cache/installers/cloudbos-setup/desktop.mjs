// User-level Codex installation. Account and project setup remain native stages.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {verifyDistribution, preparePackage, verifyPackage, inspectHost, runCommand} from './setup.mjs';
import {installedSignInCheckpoint} from './codex-native.mjs';

const NAME = 'cloudbos-public-plugin', MARKET = 'cloudbos-public';
const fail = code => {throw Object.assign(new Error(code), {code});};
const parse = result => {
  if (result.code !== 0) fail('NATIVE_DESKTOP_INSTALL_STEP_FAILED');
  try {return JSON.parse(result.stdout);} catch {fail('NATIVE_DESKTOP_INSTALL_METADATA_INVALID');}
};
export async function installCodexDesktop({distributionRoot, localPackage, cacheRoot, executable,
  confirm = async () => false, runner = runCommand, nativeRead} = {}) {
  if (!path.isAbsolute(executable || '')) fail('EXACT_SETUP_CLI_REQUIRED');
  const release = await verifyDistribution(distributionRoot);
  // This fresh installer-owned context is never a customer project and cannot
  // produce project activation evidence. No app folder is requested or written.
  const context = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-install-context-')));
  await fs.writeFile(path.join(context, 'INSTALL_CONTEXT.json'), JSON.stringify({
    schema: 'CLOUDBOS_INSTALL_CONTEXT_V1', customer_project: false, grants_authority: false}) + '\n', {flag: 'wx', mode: 0o600});
  const metadataRunner = (bin, args, options) => runner(bin, ['--no-daemon', ...args], options);
  let observed = await inspectHost('codex', executable, metadataRunner, context);
  if (observed.prerequisite !== 'AVAILABLE') fail('NATIVE_DESKTOP_METADATA_REQUIRED');
  if (observed.other_distribution) fail('OTHER_BOS_DISTRIBUTION_REVIEW_REQUIRED');
  if (observed.plugin && (observed.plugin.version !== release.plugin_version || !observed.plugin.enabled)) {
    fail('EXISTING_PLUGIN_VERSION_OR_ENABLEMENT_REVIEW_REQUIRED');
  }
  const pkg = await preparePackage(release, {cacheRoot, localPackage});
  if (observed.market) {
    const root = observed.market.source || observed.market.root;
    if (!root || !path.isAbsolute(root) || path.resolve(root) !== pkg.root) fail('EXISTING_MARKETPLACE_REVIEW_REQUIRED');
    await verifyPackage(root, release);
  }
  if (!observed.plugin) {
    if (await confirm({kind: 'INSTALL_BOS_DESKTOP', host: 'codex', version: release.plugin_version,
      package_digest: release.package_digest, marketplace: MARKET, source: pkg.root,
      scope: 'USER_PLUGIN_ONLY', project_selected: false, account_sign_in: false,
      native_hook_trust_change: false}) !== true) fail('USER_DEFERRED');
    if (!observed.market) parse(await metadataRunner(executable, ['plugin', 'marketplace', 'add', pkg.root, '--json'], {cwd: context}));
    const installed = parse(await metadataRunner(executable, ['plugin', 'add', `${NAME}@${MARKET}`, '--json'], {cwd: context}));
    if (installed.pluginId !== `${NAME}@${MARKET}` || installed.version !== release.plugin_version
      || installed.authPolicy !== 'ON_USE') fail('NATIVE_INSTALL_IDENTITY_OR_AUTH_ORDER_MISMATCH');
    observed = await inspectHost('codex', executable, metadataRunner, context);
    if (observed.plugin?.version !== release.plugin_version || observed.plugin.enabled !== true) fail('INSTALLED_VERSION_NOT_VERIFIED');
  }
  const checkpoint = await installedSignInCheckpoint({executable, cwd: context, verifiedPackage: pkg,
    pluginId: `${NAME}@${MARKET}`, pluginVersion: release.plugin_version, nativeRead});
  const marketplacePath = path.join(pkg.root, '.agents', 'plugins', 'marketplace.json');
  const detail = new URL(`codex://plugins/${NAME}`); detail.searchParams.set('marketplacePath', marketplacePath);
  const repair = !['WAITING_NATIVE_HOOK_APPROVAL', 'NATIVE_HOOKS_APPROVED'].includes(checkpoint.status);
  // Return navigation data only. Opening the native view does not approve it,
  // invoke setup, authenticate an account or prove a real hook ran.
  return {schema: 'CLOUDBOS_DESKTOP_HOST_INSTALL_V1', status: checkpoint.status,
    host: 'codex', host_version: observed.version, plugin_version: release.plugin_version,
    package_digest: release.package_digest, installed_inventory: checkpoint.installed_inventory,
    native_checks: checkpoint, native_detail_url: detail.href,
    stage: repair ? 'REPAIR_NATIVE_INSTALL' : checkpoint.may_start_sign_in ? 'SIGN_IN_IN_CODEX' : 'REVIEW_AUTOMATIC_CHECKS_IN_CODEX',
    account_connection: 'NOT_VERIFIED',
    project_setup: 'NOT_SELECTED', customer_project_written: false,
    hook_execution: 'NOT_OBSERVED', oauth_started: false, native_trust_changed: false,
    next_action: repair ? 'Review the reported native install condition before continuing.'
      : 'Open BOS in Codex, approve the named automatic checks, then use Setup to sign in and choose your project.'};
}
