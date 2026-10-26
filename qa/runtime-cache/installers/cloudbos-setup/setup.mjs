#!/usr/bin/env node
// No dependencies, credentials, hidden vendor configuration edits or project writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {installedSignInCheckpoint} from './codex-native.mjs';

const PLUGIN = 'cloudbos-public-plugin', MARKET = 'cloudbos-public';
const REPO = 'https://github.com/peter-jeans/BOS-site.git';
const RESOURCE = 'https://bos-live03-test.peterjeans2.workers.dev/mcp';
const ownFiles = ['README.md', 'Start Cloud BOS.command', 'Start Cloud BOS.cmd', 'Start-CloudBOS.ps1', 'release.json', 'setup.mjs'];
const distributionFiles = version => ['0.1.2', '0.1.3'].includes(version) ? [...ownFiles, 'codex-native.mjs'] : ownFiles;
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export const sha256 = v => createHash('sha256').update(v).digest('hex');
const fail = code => {throw Object.assign(new Error(code), {code});};
const exists = async p => {try {await fs.lstat(p); return true;} catch (e) {if (e.code === 'ENOENT') return false; throw e;}};
const safeCode = e => /^[A-Z][A-Z0-9_]+$/.test(e?.code || '') ? e.code : 'SETUP_OPERATION_FAILED';
const strip = v => String(v).replace(/\x1b\[[0-9;]*m/g, '');

export function environment(platform = process.platform, env = process.env) {
  if (platform === 'darwin') return 'MACOS';
  if (platform === 'win32') return 'WINDOWS_NATIVE';
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return 'WSL_GUIDED_HANDOFF';
  return 'UNSUPPORTED_OS';
}

export function selectedFolder(input, home = os.homedir()) {
  if (typeof input !== 'string') fail('EXACT_PROJECT_FOLDER_REQUIRED');
  let value = input.trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (value === '~') value = home;
  else if (value.startsWith('~/') || value.startsWith('~\\')) value = path.join(home, value.slice(2));
  if (!path.isAbsolute(value)) fail('ABSOLUTE_PROJECT_FOLDER_REQUIRED');
  return path.resolve(value);
}

export function validateRelease(r) {
  if (r?.schema !== 'CLOUDBOS_SETUP_RELEASE_V1' || !['0.1.0', '0.1.1', '0.1.2', '0.1.3'].includes(r.setup_version)
    || r.plugin_name !== PLUGIN || r.marketplace !== MARKET || r.repository !== REPO
    || r.mcp_endpoint !== RESOURCE || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*)?(?:\+[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/.test(r.plugin_version || '')
    || !/^[a-f0-9]{64}$/.test(r.package_digest || '') || !/^[a-f0-9]{64}$/.test(r.package_manifest_sha256 || '')
    || !['QUALIFICATION_ONLY', 'PINNED_PUBLIC_SOURCE'].includes(r.delivery)) fail('RELEASE_METADATA_INVALID');
  if (r.delivery === 'PINNED_PUBLIC_SOURCE' && !/^[a-f0-9]{40}$/.test(r.public_git_commit || '')) fail('IMMUTABLE_PUBLIC_COMMIT_REQUIRED');
  return r;
}

export function safeRelative(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\\:\x00-\x1f<>"|?*]/.test(value)
    || value.startsWith('/') || value.split('/').some(x => !x || x === '.' || x === '..'
      || /[. ]$/.test(x) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x))) fail('PACKAGE_PATH_INVALID');
  return value;
}

async function filesBelow(root, rel = '') {
  const result = [];
  for (const item of await fs.readdir(path.join(root, rel), {withFileTypes: true})) {
    const name = rel ? `${rel}/${item.name}` : item.name;
    const s = await fs.lstat(path.join(root, name));
    if (s.isSymbolicLink()) fail('PACKAGE_SYMLINK_DENIED');
    if (s.isDirectory()) result.push(...await filesBelow(root, name));
    else if (s.isFile()) result.push(name);
    else fail('PACKAGE_SPECIAL_FILE_DENIED');
  }
  return result.sort();
}

async function boundedFile(filename, limit = 2 * 1024 * 1024) {
  const s = await fs.lstat(filename);
  if (s.isSymbolicLink() || !s.isFile() || s.size > limit) fail('BOUNDED_REGULAR_FILE_REQUIRED');
  return fs.readFile(filename);
}

export async function verifyDistribution(root) {
  const m = JSON.parse(await boundedFile(path.join(root, 'SETUP_MANIFEST.json')));
  if (m.schema !== 'CLOUDBOS_SETUP_INVENTORY_V1' || !['0.1.0', '0.1.1', '0.1.2', '0.1.3'].includes(m.setup_version) || !Array.isArray(m.files)
    || canonical(m.files.map(x => x.path).sort()) !== canonical([...distributionFiles(m.setup_version)].sort())) fail('SETUP_INVENTORY_INVALID');
  if (canonical(await filesBelow(root)) !== canonical([...distributionFiles(m.setup_version), 'SETUP_MANIFEST.json'].sort())) fail('SETUP_INVENTORY_CHANGED');
  for (const item of m.files) if (sha256(await boundedFile(path.join(root, safeRelative(item.path)))) !== item.sha256) fail('SETUP_FILE_HASH_MISMATCH');
  const release = validateRelease(JSON.parse(await boundedFile(path.join(root, 'release.json'))));
  if (release.setup_version !== m.setup_version) fail('SETUP_VERSION_MISMATCH');
  return release;
}

function packageManifest(bytes, r) {
  if (sha256(bytes) !== r.package_manifest_sha256) fail('PACKAGE_MANIFEST_HASH_MISMATCH');
  const m = JSON.parse(bytes);
  if (m.schema_version !== 'BOS_CLOUDBOS_PUBLIC_PACKAGE_MANIFEST_V1' || m.package_name !== PLUGIN
    || m.package_version !== r.plugin_version || m.package_digest !== r.package_digest
    || !['self-service-beta', 'release'].includes(m.mode) || !Array.isArray(m.files)
    || m.files.length < 3 || m.files.length > 200 || sha256(canonical(m.files)) !== r.package_digest) fail('PACKAGE_IDENTITY_INVALID');
  const seen = new Set(); let total = 0;
  for (const x of m.files) {
    safeRelative(x.path);
    if (seen.has(x.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(x.sha256)
      || !Number.isSafeInteger(x.size) || x.size < 0 || x.size > 2 * 1024 * 1024) fail('PACKAGE_INVENTORY_INVALID');
    seen.add(x.path.toLowerCase()); total += x.size;
  }
  if (total > 12 * 1024 * 1024 || seen.has('public_package_manifest.json')) fail('PACKAGE_INVENTORY_INVALID');
  return m;
}

export async function verifyPackage(root, r) {
  validateRelease(r);
  const manifest = packageManifest(await boundedFile(path.join(root, 'PUBLIC_PACKAGE_MANIFEST.json')), r);
  if (canonical(await filesBelow(root)) !== canonical([...manifest.files.map(x => x.path), 'PUBLIC_PACKAGE_MANIFEST.json'].sort())) fail('PACKAGE_INVENTORY_CHANGED');
  for (const x of manifest.files) {
    const bytes = await boundedFile(path.join(root, x.path));
    if (bytes.length !== x.size || sha256(bytes) !== x.sha256) fail('PACKAGE_FILE_HASH_MISMATCH');
  }
  const pluginRoot = path.join(root, 'plugins', PLUGIN);
  if (['0.1.2', '0.1.3'].includes(r.setup_version)) {
    const market = JSON.parse(await boundedFile(path.join(root, '.agents', 'plugins', 'marketplace.json')));
    const entry = market.plugins?.find(item => item.name === PLUGIN);
    if (market.name !== MARKET || market.plugins?.length !== 1
      || entry?.policy?.authentication !== 'ON_USE') fail('GUIDED_AUTH_ORDER_REQUIRES_NEW_PACKAGE');
  }
  for (const host of ['.codex-plugin', '.claude-plugin']) {
    const p = JSON.parse(await boundedFile(path.join(pluginRoot, host, 'plugin.json')));
    if (p.name !== PLUGIN || p.version !== r.plugin_version) fail('PACKAGE_PLUGIN_IDENTITY_INVALID');
  }
  const mcp = JSON.parse(await boundedFile(path.join(pluginRoot, '.mcp.json')));
  if (canonical(mcp) !== canonical({mcpServers: {cloudbos: {type: 'http', url: r.mcp_endpoint}}})) fail('PACKAGE_CONNECTION_INVALID');
  return {root, manifest, pluginRoot};
}

async function assertNoSymlinkParents(target) {
  let p = path.resolve(target);
  for (;;) {
    try {if ((await fs.lstat(p)).isSymbolicLink()) fail('SYMLINK_PATH_REQUIRES_REVIEW');}
    catch (e) {if (e.code !== 'ENOENT') throw e;}
    const parent = path.dirname(p); if (parent === p) break; p = parent;
  }
}

async function download(url, limit) {
  const response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!response.ok || Number(response.headers.get('content-length') || 0) > limit) fail('PUBLIC_DOWNLOAD_UNAVAILABLE');
  let total = 0; const chunks = [];
  for await (const chunk of response.body) {total += chunk.length; if (total > limit) fail('PUBLIC_DOWNLOAD_TOO_LARGE'); chunks.push(chunk);}
  return Buffer.concat(chunks);
}

export async function preparePackage(r, {cacheRoot, localPackage, fetchBytes = download} = {}) {
  validateRelease(r);
  if (localPackage) {
    if (r.delivery !== 'QUALIFICATION_ONLY') fail('LOCAL_QUALIFICATION_NOT_ALLOWED');
    await assertNoSymlinkParents(localPackage);
    return verifyPackage(await fs.realpath(localPackage), r);
  }
  if (r.delivery !== 'PINNED_PUBLIC_SOURCE') fail('RELEASE_NOT_PUBLISHED');
  if (!cacheRoot || !path.isAbsolute(cacheRoot)) fail('EXACT_SETUP_CACHE_REQUIRED');
  await assertNoSymlinkParents(cacheRoot);
  const destination = path.join(cacheRoot, `${r.plugin_version}-${r.package_digest.slice(0, 16)}`);
  if (await exists(destination)) return verifyPackage(destination, r);
  await fs.mkdir(cacheRoot, {recursive: true, mode: 0o700});
  const temporary = await fs.mkdtemp(path.join(cacheRoot, '.partial-'));
  const base = `https://raw.githubusercontent.com/peter-jeans/BOS-site/${r.public_git_commit}/public-plugin-releases/${r.plugin_version}/`;
  try {
    const raw = await fetchBytes(base + 'PUBLIC_PACKAGE_MANIFEST.json', 1024 * 1024);
    const manifest = packageManifest(raw, r);
    await fs.writeFile(path.join(temporary, 'PUBLIC_PACKAGE_MANIFEST.json'), raw, {flag: 'wx', mode: 0o600});
    for (const item of manifest.files) {
      const bytes = await fetchBytes(base + item.path.split('/').map(encodeURIComponent).join('/'), item.size + 1);
      if (bytes.length !== item.size || sha256(bytes) !== item.sha256) fail('PACKAGE_FILE_HASH_MISMATCH');
      const filename = path.join(temporary, item.path);
      await fs.mkdir(path.dirname(filename), {recursive: true, mode: 0o700});
      await fs.writeFile(filename, bytes, {flag: 'wx', mode: 0o600});
    }
    await verifyPackage(temporary, r);
    // Never overwrite a concurrent run or a pre-existing cache.
    if (await exists(destination)) return verifyPackage(destination, r);
    await fs.rename(temporary, destination);
    return verifyPackage(destination, r);
  } finally {await fs.rm(temporary, {recursive: true, force: true});}
}

export function invocation(executable, args, platform = process.platform) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    // cmd expands even quoted percent variables. Reject metacharacters instead
    // of interpreting a user's folder name or vendor argument as shell code.
    const all = [executable, ...args];
    if (all.some(x => /[%!^&|<>"\r\n()]/.test(x))) fail('WINDOWS_BATCH_ARGUMENT_REQUIRES_NATIVE_EXE');
    return {executable: 'cmd.exe', args: ['/d', '/s', '/c', `"${all.map(x => `"${x}"`).join(' ')}"`],
      windowsVerbatimArguments: true};
  }
  return {executable, args};
}

export async function runCommand(executable, args, {cwd, interactive = false, timeout = 25000} = {}) {
  const call = invocation(executable, args);
  return new Promise(resolve => {
    // Batch arguments are already quoted for cmd.exe. Node's default Windows
    // escaping would quote them again and make even --version fail.
    const child = spawn(call.executable, call.args, {cwd, shell: false, windowsHide: !interactive,
      windowsVerbatimArguments: call.windowsVerbatimArguments === true,
      stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe']});
    let stdout = '', size = 0, exceeded = false;
    if (!interactive) {
      child.stdout.on('data', b => {size += b.length; if (size > 1024 * 1024) {exceeded = true; child.kill();} else stdout += b;});
      // Never retain arbitrary vendor stderr, which may contain auth output.
      child.stderr.on('data', () => {});
    }
    const timer = setTimeout(() => child.kill(), interactive ? 10 * 60 * 1000 : timeout);
    child.on('error', () => {clearTimeout(timer); resolve({code: 127, stdout: ''});});
    child.on('close', code => {clearTimeout(timer); resolve({code: exceeded ? 125 : code ?? 124, stdout: exceeded ? '' : stdout});});
  });
}

export async function findExecutable(name, env = process.env, platform = process.platform) {
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean)) for (const suffix of suffixes) {
    const p = path.join(dir, name + suffix);
    try {await fs.access(p, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); if ((await fs.stat(p)).isFile()) return p;}
    catch {}
  }
  return null;
}

function parseResult(r) {if (r.code !== 0) fail('NATIVE_METADATA_UNAVAILABLE'); try {return JSON.parse(r.stdout);} catch {fail('NATIVE_METADATA_SCHEMA_UNSUPPORTED');}}

export async function inspectHost(host, executable, runner = runCommand, cwd) {
  if (!['codex', 'claude_code'].includes(host)) fail('SUPPORTED_HOST_REQUIRED');
  if (!executable) return {host, prerequisite: 'HOST_CLI_MISSING'};
  const options = {cwd};
  const versionResult = await runner(executable, ['--version'], options);
  if (versionResult.code !== 0) fail('HOST_VERSION_UNAVAILABLE');
  const version = strip(versionResult.stdout).trim().match(/\b\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/)?.[0];
  if (!version) fail('HOST_VERSION_SCHEMA_UNSUPPORTED');
  const plugins = parseResult(await runner(executable, ['plugin', 'list', '--json'], options));
  const markets = parseResult(await runner(executable, ['plugin', 'marketplace', 'list', '--json'], options));
  const pluginRows = host === 'codex' ? plugins.installed : plugins;
  const marketRows = Array.isArray(markets) ? markets : markets.marketplaces;
  if (!Array.isArray(pluginRows) || !Array.isArray(marketRows)) fail('NATIVE_METADATA_SCHEMA_UNSUPPORTED');
  const id = x => x.pluginId || x.id;
  const matches = pluginRows.filter(x => x.name === PLUGIN || String(id(x) || '').startsWith(PLUGIN + '@'));
  const selected = matches.find(x => id(x) === `${PLUGIN}@${MARKET}`);
  const market = marketRows.find(x => x.name === MARKET);
  // Keep only required public metadata. Raw CLI/config/auth output is not logged.
  return {host, executable, version, prerequisite: 'AVAILABLE', plugin: selected ? {version: selected.version, enabled: selected.enabled === true} : null,
    other_distribution: matches.some(x => id(x) !== `${PLUGIN}@${MARKET}` && x.enabled !== false),
    market: market ? {source: market.marketplaceSource?.source || market.source?.path || market.source?.url
      || (market.source === 'directory' ? market.path : market.source === 'git' ? market.url : null)
      || (typeof market.source === 'string' && /^(?:https:\/\/|\/|[A-Za-z]:[\\/])/.test(market.source) ? market.source : null),
      root: market.root || market.installLocation || null} : null};
}

export async function inspectProject(selected, host) {
  if (!selected || !path.isAbsolute(selected)) fail('EXACT_PROJECT_FOLDER_REQUIRED');
  const root = path.resolve(selected);
  if (root === path.parse(root).root || root === path.resolve(os.homedir())) fail('APP_FOLDER_REQUIRED');
  await assertNoSymlinkParents(root);
  let parent = root;
  for (;;) {
    if (await exists(path.join(parent, '.bos')) || await exists(path.join(parent, 'BOS_PRODUCT_AUTHORITY.json'))) fail('PRIVATE_LOCAL_PROJECT_PRESERVED');
    const next = path.dirname(parent); if (next === parent) break; parent = next;
  }
  if (!(await exists(root))) return {root, exists: false, project_binding: 'NOT_INSTALLED', native_loading: 'NOT_OBSERVED'};
  if (!(await fs.stat(root)).isDirectory()) fail('PROJECT_DIRECTORY_REQUIRED');
  const control = path.join(root, '.cloudbos', 'host-bootstrap-manifest.json');
  if (await exists(control)) {
    await assertNoSymlinkParents(control);
    let m; try {m = JSON.parse(await boundedFile(control, 262144));} catch {fail('EXISTING_PROJECT_REVIEW_REQUIRED');}
    if (m.schema !== 'CLOUDBOS_LOCAL_HOST_BOOTSTRAP_MANIFEST_V1' || m.selected_root !== root || m.host !== host) fail('EXISTING_PROJECT_HOST_OR_ROOT_REVIEW_REQUIRED');
    return {root, exists: true, project_binding: 'LOCAL_MANIFEST_PRESENT_LIVE_READBACK_REQUIRED', native_loading: 'NOT_OBSERVED'};
  }
  if (await exists(path.join(root, '.cloudbos'))) fail('PARTIAL_PROJECT_SETUP_REVIEW_REQUIRED');
  return {root, exists: true, project_binding: 'NOT_INSTALLED', native_loading: 'NOT_OBSERVED'};
}

async function approved(confirm, action) {if (await confirm(action) !== true) fail('USER_DEFERRED');}
async function nativeWrite(runner, executable, args, cwd) {
  const r = await runner(executable, args, {cwd, interactive: true});
  if (r.code !== 0) fail('NATIVE_STEP_INCOMPLETE_RERUN_CHECK');
}

export async function setupHost({host, executable, release, mode = 'setup', projectRoot, localPackage, cacheRoot,
  runner = runCommand, fetchBytes, confirm = async () => false, startLogin = false, nativeRead} = {}) {
  validateRelease(release);
  if (!['setup', 'add-project', 'check'].includes(mode)) fail('SETUP_MODE_INVALID');
  const project = await inspectProject(projectRoot, host);
  const initial = {host, host_version: 'UNKNOWN', plugin_version: 'NOT_OBSERVED', service_connection: 'NOT_VERIFIED',
    project_binding: project.project_binding, native_loading: 'NOT_OBSERVED', release_delivery: release.delivery};
  if (!executable) return {...initial, status: 'HOST_CLI_MISSING'};
  if (!project.exists && mode === 'check') return {...initial, status: 'PROJECT_FOLDER_MISSING'};
  if (!project.exists) {
    await approved(confirm, {kind: 'CREATE_EXACT_FOLDER', host, root: project.root});
    await inspectProject(project.root, host);
    await fs.mkdir(project.root, {recursive: true});
    project.exists = true;
  }
  // Even metadata/install commands run from the selected, reviewed folder;
  // never inherit the launcher's working directory and its project settings.
  let observed = await inspectHost(host, executable, runner, project.exists ? project.root : undefined);
  const report = {host, host_version: observed.version || 'UNKNOWN', plugin_version: observed.plugin?.version || 'NOT_INSTALLED',
    service_connection: 'NOT_VERIFIED', project_binding: project.project_binding, native_loading: 'NOT_OBSERVED',
    release_delivery: release.delivery, status: 'NATIVE_PROJECT_HANDOFF_REQUIRED'};
  if (observed.prerequisite !== 'AVAILABLE') return {...report, status: 'HOST_CLI_MISSING'};
  if (mode === 'check') return {...report, status: observed.plugin?.version === release.plugin_version && observed.plugin.enabled
    ? 'PLUGIN_VERSION_OBSERVED_NATIVE_CONNECTION_CHECK_REQUIRED' : 'PLUGIN_SETUP_REQUIRED'};
  if (observed.other_distribution) fail('OTHER_BOS_DISTRIBUTION_REVIEW_REQUIRED');
  if (observed.plugin && (observed.plugin.version !== release.plugin_version || !observed.plugin.enabled)) fail('EXISTING_PLUGIN_VERSION_OR_ENABLEMENT_REVIEW_REQUIRED');
  let verifiedPackage;
  if (observed.plugin) {
    // Native Windows Codex reports only the registered root. Reuse that exact
    // path only after the same full inventory check used for local sources.
    const source = observed.market?.source || observed.market?.root;
    // An official Git URL and matching version are not byte evidence. This
    // first launcher only reuses its independently verified local inventory.
    // Preserve existing Git installs and route their exact-payload review.
    if (source === REPO) fail('EXISTING_GIT_INSTALLATION_INTEGRITY_REVIEW_REQUIRED');
    if (source !== REPO) {
      const expected = localPackage && release.delivery === 'QUALIFICATION_ONLY' ? path.resolve(localPackage)
        : cacheRoot ? path.join(cacheRoot, `${release.plugin_version}-${release.package_digest.slice(0, 16)}`) : null;
      if (!expected || !source || path.resolve(source) !== expected) fail('EXISTING_MARKETPLACE_REVIEW_REQUIRED');
      verifiedPackage = await verifyPackage(expected, release);
    }
  }
  if (!observed.plugin) {
    if (mode === 'add-project') return {...report, status: 'RUN_SETUP_FIRST'};
    await approved(confirm, {kind: 'INSTALL_RELEASE', host, version: release.plugin_version, qualification: release.delivery === 'QUALIFICATION_ONLY'});
    const pkg = await preparePackage(release, {cacheRoot, localPackage, fetchBytes});
    verifiedPackage = pkg;
    if (observed.market) {
      // Supported metadata must identify this exact verified local source. An
      // existing Git/private/unknown marketplace is not silently overwritten.
      if (path.resolve(observed.market.source || observed.market.root || '.') !== pkg.root) fail('EXISTING_MARKETPLACE_REVIEW_REQUIRED');
    } else {
      const args = ['plugin', 'marketplace', 'add', pkg.root];
      if (host === 'claude_code') args.push('--scope', 'user');
      await nativeWrite(runner, executable, args, project.exists ? project.root : undefined);
    }
    const args = host === 'codex' ? ['plugin', 'add', `${PLUGIN}@${MARKET}`]
      : ['plugin', 'install', `${PLUGIN}@${MARKET}`, '--scope', 'user'];
    await nativeWrite(runner, executable, args, project.exists ? project.root : undefined);
    observed = await inspectHost(host, executable, runner, project.exists ? project.root : undefined);
    if (observed.plugin?.version !== release.plugin_version || !observed.plugin.enabled) fail('INSTALLED_VERSION_NOT_VERIFIED');
    report.plugin_version = observed.plugin.version;
  }
  if (host === 'codex') {
    const rows = parseResult(await runner(executable, ['mcp', 'list', '--json'], {cwd: project.exists ? project.root : undefined}));
    if (!Array.isArray(rows)) fail('NATIVE_MCP_SCHEMA_UNSUPPORTED');
    const server = rows.find(x => x.name === 'cloudbos');
    if (server) {
      if (server.transport?.url !== release.mcp_endpoint || server.transport?.type !== 'streamable_http'
        || server.enabled !== true || server.transport.bearer_token_env_var || server.transport.http_headers
        || server.transport.env_http_headers || server.transport.http_headers_helper) fail('EXISTING_CONNECTION_REVIEW_REQUIRED');
    } else {
      await approved(confirm, {kind: 'ADD_PUBLIC_MCP', host, endpoint: release.mcp_endpoint});
      await nativeWrite(runner, executable, ['mcp', 'add', 'cloudbos', '--url', release.mcp_endpoint], project.exists ? project.root : undefined);
      const saved = parseResult(await runner(executable, ['mcp', 'list', '--json'], {cwd: project.exists ? project.root : undefined}));
      const added = Array.isArray(saved) ? saved.find(x => x.name === 'cloudbos') : null;
      if (added?.transport?.url !== release.mcp_endpoint || added.transport.type !== 'streamable_http'
        || added.enabled !== true || added.transport.bearer_token_env_var || added.transport.http_headers
        || added.transport.env_http_headers || added.transport.http_headers_helper) fail('MCP_CONFIGURATION_READBACK_FAILED');
    }
    report.service_connection = 'CONFIGURED_LIVE_NATIVE_CALL_REQUIRED';
    if (startLogin && mode === 'setup') {
      report.native_checks = await installedSignInCheckpoint({executable, cwd: project.root, verifiedPackage,
        pluginId: `${PLUGIN}@${MARKET}`, pluginVersion: release.plugin_version, nativeRead});
      if (!report.native_checks.may_start_sign_in) return {...report, status: report.native_checks.status,
        next_action: 'Review the BOS / Public automatic checks in Codex, then resume setup. Your trust settings have not been changed.'};
      await approved(confirm, {kind: 'BROWSER_OAUTH', host});
      await nativeWrite(runner, executable, ['mcp', 'login', 'cloudbos'], project.exists ? project.root : undefined);
      report.service_connection = 'LOGIN_COMMAND_COMPLETED_LIVE_NATIVE_CALL_REQUIRED';
    }
  } else {
    // Claude owns the plugin's bundled MCP registration. Never add a second
    // external server merely because its CLI cannot inspect plugin servers.
    report.service_connection = 'BUNDLED_MCP_NATIVE_REVIEW_REQUIRED';
    if (startLogin && mode === 'setup') {
      const name = `plugin:${PLUGIN}:cloudbos`;
      const found = await runner(executable, ['mcp', 'get', name], {cwd: project.exists ? project.root : undefined});
      const text = strip(found.stdout);
      if (found.code === 0 && text.split(/\r?\n/).some(x => x.trim() === `URL: ${release.mcp_endpoint}`)
        && !/\b(?:Headers|Authorization|Bearer)\s*:/i.test(text)) {
        await approved(confirm, {kind: 'BROWSER_OAUTH', host});
        await nativeWrite(runner, executable, ['mcp', 'login', name], project.exists ? project.root : undefined);
        report.service_connection = 'LOGIN_COMMAND_COMPLETED_LIVE_NATIVE_CALL_REQUIRED';
      }
    }
  }
  // Project controls are created only by the existing native lifecycle after
  // exact baseline/plan approval. No fake approval object is constructed here.
  return {...report, project_root: project.root, project_binding: project.project_binding,
    project_instruction: 'Use the installed cloudbos-public-plugin:cloudbos-public-guide Skill for this exact public project folder. Read existing project controls first; reuse the existing account connection. Discover the current project state, ask only missing baseline details, present the exact baseline and installation files for owner approval, and verify the saved controls and actual native loading. Preserve private/local bindings and existing instructions. Do not accept terms or approvals for me.'};
}

function parseArgs(args) {
  const options = {mode: null, host: null, project: null, qualificationPackage: null, login: true};
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (x === '--help') return {help: true};
    if (x === '--no-login') options.login = false;
    else if (['--mode', '--host', '--project', '--qualification-package'].includes(x)) {
      const key = {'--mode': 'mode', '--host': 'host', '--project': 'project', '--qualification-package': 'qualificationPackage'}[x];
      if (!args[i + 1] || args[i + 1].startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED');
      options[key] = args[++i];
    } else fail('UNKNOWN_ARGUMENT');
  }
  if (options.host && !['codex', 'claude_code', 'both'].includes(options.host)) fail('SUPPORTED_HOST_REQUIRED');
  if (options.mode && !['setup', 'add-project', 'check'].includes(options.mode)) fail('SETUP_MODE_INVALID');
  return options;
}

async function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Cloud BOS setup: node setup.mjs [--mode setup|add-project|check] [--host codex|claude_code|both] [--project <absolute folder>] [--no-login]\nUse a sealed download. Native trust, browser login and exact project approvals remain yours. Qualification packages are not published releases.'); return;
  }
  const env = environment();
  if (!['MACOS', 'WINDOWS_NATIVE'].includes(env)) fail(env);
  if (Number(process.versions.node.split('.')[0]) < 20) fail('NODE_20_OR_LATER_REQUIRED');
  const release = await verifyDistribution(path.dirname(fileURLToPath(import.meta.url)));
  if (!process.stdin.isTTY) fail('INTERACTIVE_TERMINAL_REQUIRED');
  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {
    const mode = args.mode || ({'1': 'setup', '2': 'add-project', '3': 'check'}[await rl.question('1 Set up BOS · 2 Add a project · 3 Check setup: ')]);
    const host = args.host || ({'1': 'codex', '2': 'claude_code', '3': 'both'}[await rl.question('1 Codex · 2 Claude Code · 3 Both (separate folders): ')]);
    if (!mode || !host) fail('SELECTION_REQUIRED');
    const confirm = async action => {
      console.log(JSON.stringify(action, null, 2));
      return (await rl.question('Proceed with this step? Type yes: ')).trim().toLowerCase() === 'yes';
    };
    const roots = new Set(), physicalRoots = new Set();
    for (const selected of host === 'both' ? ['codex', 'claude_code'] : [host]) {
      const folder = args.project && host !== 'both' ? args.project : await rl.question(`${selected}: exact app folder (existing or new; no surrounding quotes): `);
      const root = selectedFolder(folder);
      if (!folder || roots.has(root)) fail('SEPARATE_EXACT_APP_FOLDERS_REQUIRED'); roots.add(root);
      const before = await fs.stat(root).catch(e => {if (e.code === 'ENOENT') return null; throw e;});
      if (before && physicalRoots.has(`${before.dev}:${before.ino}`)) fail('SEPARATE_PHYSICAL_APP_FOLDERS_REQUIRED');
      const bin = await findExecutable(selected === 'codex' ? 'codex' : 'claude');
      const runner = async (executable, argv, options) => {
        if (options?.interactive) rl.pause();
        try {return await runCommand(executable, argv, options);}
        finally {if (options?.interactive) rl.resume();}
      };
      const result = await setupHost({host: selected, executable: bin, release, mode, projectRoot: root,
        localPackage: args.qualificationPackage, cacheRoot: path.join(os.homedir(), '.cloudbos-setup', 'releases'), confirm, startLogin: args.login, runner});
      console.log(JSON.stringify(result, null, 2));
      if (await exists(root)) {const s = await fs.stat(root); physicalRoots.add(`${s.dev}:${s.ino}`);}
      if (result.project_root && result.status === 'NATIVE_PROJECT_HANDOFF_REQUIRED') {
        console.log('Open this exact folder in your coding tool, start a new chat and use the project_instruction above. In Claude, review /mcp for its bundled Cloud BOS server if login still needs attention.\nThe launcher has not activated the project. Approve the baseline and exact installation plan in that chat.');
        if (await confirm({kind: 'OPEN_NATIVE_ONBOARDING_CHAT', host: selected, root: result.project_root})) {
          const argv = selected === 'codex' ? ['-C', result.project_root, result.project_instruction] : [result.project_instruction];
          await runner(bin, argv, {cwd: result.project_root, interactive: true});
          console.log('Native session ended. Its actual readback determines project readiness; launcher completion does not.');
        }
      } else if (result.status === 'HOST_CLI_MISSING') console.log('Install/enable the supported tool CLI from its official guide, then rerun. Desktop-only users can follow the website manual setup.');
    }
  } finally {rl.close();}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(e => {console.error(`Cloud BOS: ${safeCode(e)}. Your existing setup is preserved; follow the manual guide or rerun Check setup. No project activation is claimed.`); process.exitCode = 1;});
}
