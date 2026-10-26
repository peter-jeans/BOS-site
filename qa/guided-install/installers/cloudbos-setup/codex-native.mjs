// Read-only Codex metadata adapter. Native approval is never written here.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const NAME = 'cloudbos-public-plugin';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'];
const eventName = value => value[0].toLowerCase() + value.slice(1);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), {code}); };
const verdict = (status, extra = {}) => ({status, may_start_sign_in: false,
  native_trust_changed: false, hook_execution: 'NOT_OBSERVED', ...extra});

function localPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('EXACT_NATIVE_PATH_REQUIRED');
  return path.normalize(value);
}

async function regularFile(filename, limit = 262144) {
  const metadata = await fs.lstat(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > limit) fail('BOUNDED_REGULAR_FILE_REQUIRED');
  return fs.readFile(filename);
}

// The caller must first verify the complete immutable public package inventory.
// This readback binds its hook definitions to the independently verified root.
export async function expectedCodexHooks({pluginRoot, pluginId, pluginVersion, hookSourceSha256}) {
  pluginRoot = localPath(pluginRoot);
  if (await fs.realpath(pluginRoot) !== pluginRoot || !pluginId?.startsWith(NAME + '@')
    || !/^[a-zA-Z0-9._-]+$/.test(pluginId.slice(NAME.length + 1))) fail('EXACT_PUBLIC_PLUGIN_REQUIRED');
  const meta = JSON.parse(await regularFile(path.join(pluginRoot, '.codex-plugin', 'plugin.json')));
  if (meta.name !== NAME || meta.version !== pluginVersion || meta.hooks !== './hooks/codex-hooks.json') fail('PUBLIC_PLUGIN_HOOK_PROFILE_UNSUPPORTED');
  const sourcePath = path.join(pluginRoot, 'hooks', 'codex-hooks.json');
  const bytes = await regularFile(sourcePath);
  if (!/^[a-f0-9]{64}$/.test(hookSourceSha256 ?? '') || sha256(bytes) !== hookSourceSha256) fail('VERIFIED_HOOK_SOURCE_REQUIRED');
  const config = JSON.parse(bytes);
  if (!config.hooks || EVENTS.some(event => !Array.isArray(config.hooks[event]) || !config.hooks[event].length)) fail('PUBLIC_HOOK_EVENTS_INCOMPLETE');
  const definitions = [];
  for (const [event, groups] of Object.entries(config.hooks)) {
    if (!EVENTS.includes(event) || !Array.isArray(groups)) fail('PUBLIC_HOOK_PROFILE_CHANGED');
    for (const group of groups) {
      if (!Array.isArray(group.hooks) || !group.hooks.length) fail('PUBLIC_HOOK_PROFILE_CHANGED');
      for (const hook of group.hooks) {
        if (hook.type !== 'command' || typeof hook.command !== 'string'
          || !hook.command.includes('${PLUGIN_ROOT}')) fail('PUBLIC_HOOK_PROFILE_CHANGED');
        if (event === 'SessionEnd' && (!Number.isInteger(hook.timeout) || hook.timeout < 1 || hook.timeout > 3)) fail('PUBLIC_HOOK_TIMEOUT_UNSUPPORTED');
        definitions.push({eventName: eventName(event), matcher: group.matcher ?? null,
          command: hook.command.replaceAll('${PLUGIN_ROOT}', pluginRoot),
          timeoutSec: hook.timeout ?? 600, async: hook.async ?? false,
          statusMessage: hook.statusMessage ?? null, additionalContextLimit: hook.additionalContextLimit ?? null});
      }
    }
  }
  return {pluginRoot, pluginId, pluginVersion, sourcePath, hookSourceSha256, definitions};
}

export function assessCodexHooks(readback, {cwd, expected}) {
  cwd = localPath(cwd);
  if (!readback || !Array.isArray(readback.data)) return verdict('NATIVE_HOOK_READBACK_INVALID');
  const groups = readback.data.filter(group => group?.cwd === cwd);
  if (groups.length !== 1 || !Array.isArray(groups[0].hooks)
    || !Array.isArray(groups[0].errors) || groups[0].errors.length
    || !Array.isArray(groups[0].warnings) || groups[0].warnings.length) return verdict('NATIVE_HOOK_READBACK_INCOMPLETE');
  const rows = groups[0].hooks;
  if (rows.some(hook => !hook || typeof hook !== 'object' || Array.isArray(hook)
    || (hook.pluginId !== null && typeof hook.pluginId !== 'string'))) return verdict('NATIVE_HOOK_READBACK_INVALID');
  const own = rows.filter(hook => hook?.pluginId === expected.pluginId);
  if (!own.length) return verdict('WAITING_NATIVE_HOOK_DISCOVERY');
  // A separate private/local family may coexist. An enabled second public
  // registration requires ownership review; never silently disable it here.
  if (rows.some(hook => hook?.pluginId?.startsWith(NAME + '@')
      && hook.pluginId !== expected.pluginId && hook.enabled === true)) return verdict('PUBLIC_HOOK_REGISTRATION_CONFLICT');
  if (own.length !== expected.definitions.length) return verdict('PUBLIC_HOOK_DEFINITION_MISMATCH');
  const remaining = [...own];
  for (const definition of expected.definitions) {
    const index = remaining.findIndex(hook => hook.eventName === definition.eventName
      && hook.matcher === definition.matcher && hook.command === definition.command
      && hook.timeoutSec === definition.timeoutSec && hook.async === definition.async
      && hook.statusMessage === definition.statusMessage && hook.additionalContextLimit === definition.additionalContextLimit);
    if (index < 0) return verdict('PUBLIC_HOOK_DEFINITION_MISMATCH');
    const hook = remaining.splice(index, 1)[0];
    if (hook.source !== 'plugin' || hook.sourcePath !== expected.sourcePath
      || hook.handlerType !== 'command' || hook.isManaged !== false
      || typeof hook.key !== 'string' || !hook.key
      // Native 0.163 emits one digest; 0.164 also binds a source-file digest.
      // Both remain native-owned trust identifiers. Full package bytes and
      // the explicit native trusted state are checked independently.
      || !/^sha256:[a-f0-9]{64}(?:\/sha256:[a-f0-9]{64})?$/.test(hook.currentHash ?? '')) return verdict('PUBLIC_HOOK_SOURCE_MISMATCH');
    if (hook.enabled !== true) return verdict('WAITING_NATIVE_HOOK_ENABLEMENT');
    if (hook.trustStatus !== 'trusted') return verdict('WAITING_NATIVE_HOOK_APPROVAL');
  }
  return verdict('NATIVE_HOOKS_APPROVED', {may_start_sign_in: true,
    native_definitions_loaded: true, approved_hook_count: own.length,
    plugin_id: expected.pluginId, plugin_version: expected.pluginVersion,
    // This is a metadata checkpoint only. Registration ownership and useful
    // first-session execution remain separate qualification requirements.
    owner_registration: 'SEPARATE_READBACK_REQUIRED'});
}

export function readCodexHooks({executable, cwd, env = process.env, timeoutMs = 20000,
  maxBytes = 4 * 1024 * 1024, spawnProcess = spawn} = {}) {
  executable = localPath(executable); cwd = localPath(cwd);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4 * 1024 * 1024) fail('NATIVE_READBACK_BOUNDS_REQUIRED');
  return new Promise((resolve, reject) => {
    let child, timer, cleanup, done = false, received = 0, buffer = '', initialized = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin?.end(); child.kill();
        // A dedicated metadata process must not survive a timed-out installer.
        cleanup = setTimeout(() => child.kill('SIGKILL'), 500);
        cleanup.unref();
      }
      if (error) reject(Object.assign(new Error(error), {code: error})); else resolve(result);
    };
    const send = value => {
      try {child.stdin.write(JSON.stringify(value) + '\n');}
      catch {finish('NATIVE_HOOK_READBACK_UNAVAILABLE');}
    };
    try {
      // A short-lived dedicated stdio process, never an existing UI/control
      // socket. No model/thread, OAuth, config mutation or trust operation.
      child = spawnProcess(executable, ['--no-daemon', 'app-server', '--stdio'],
        {cwd, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true});
      child.once('error', () => finish('NATIVE_HOOK_READBACK_UNAVAILABLE'));
      child.stdin.on('error', () => finish('NATIVE_HOOK_READBACK_UNAVAILABLE'));
      child.once('close', () => {clearTimeout(cleanup); finish('NATIVE_HOOK_READBACK_INCOMPLETE');});
      timer = setTimeout(() => finish('NATIVE_HOOK_READBACK_TIMEOUT'), timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', text => {
        if (done) return;
        received += Buffer.byteLength(text);
        if (received > maxBytes) {finish('NATIVE_HOOK_READBACK_OVERSIZE'); return;}
        buffer += text;
        while (!done && buffer.includes('\n')) {
          const split = buffer.indexOf('\n'), line = buffer.slice(0, split); buffer = buffer.slice(split + 1);
          let response;
          try {response = JSON.parse(line);} catch {finish('NATIVE_HOOK_READBACK_INVALID'); return;}
          if (!response || typeof response !== 'object' || Array.isArray(response)) {finish('NATIVE_HOOK_READBACK_INVALID'); return;}
          if (response.id === 1 && !initialized) {
            if (!response.result || response.error) {finish('NATIVE_HOOK_READBACK_UNAVAILABLE'); return;}
            initialized = true;
            send({method: 'initialized', params: {}});
            send({id: 2, method: 'hooks/list', params: {cwds: [cwd]}});
          } else if (response.id === 2) {
            if (!initialized) {finish('NATIVE_HOOK_READBACK_INVALID'); return;}
            if (response.error || !response.result) {finish('NATIVE_HOOK_READBACK_UNAVAILABLE'); return;}
            finish(null, response.result);
          }
        }
      });
      send({id: 1, method: 'initialize', params: {clientInfo: {name: 'bos_guided_setup_readback', version: '0.1.0'}}});
    } catch {finish('NATIVE_HOOK_READBACK_UNAVAILABLE');}
  });
}

// This boundary must be rerun immediately before a guided sign-in attempt.
// A cached summary, checkbox or installed-version label cannot unlock it.
export async function signInCheckpoint({executable, cwd, expected, nativeRead = readCodexHooks}) {
  const readback = await nativeRead({executable, cwd});
  return assessCodexHooks(readback, {cwd, expected});
}

async function installedFiles(root, relative = '') {
  const rows = [];
  for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes: true})) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await installedFiles(root, name));
    else if (entry.isFile()) rows.push(name);
    else fail('INSTALLED_PLUGIN_SPECIAL_FILE_DENIED');
  }
  return rows.sort();
}

// verifiedPackage must come from the setup launcher's complete immutable
// inventory verification. A displayed version/source URL is insufficient.
export async function installedSignInCheckpoint({executable, cwd, verifiedPackage, pluginId,
  pluginVersion, nativeRead = readCodexHooks}) {
  const readback = await nativeRead({executable, cwd});
  const groups = Array.isArray(readback?.data) ? readback.data.filter(group => group?.cwd === cwd) : null;
  if (!groups || groups.length !== 1 || groups[0].errors?.length !== 0
    || groups[0].warnings?.length !== 0 || !Array.isArray(groups[0].hooks)) return verdict('NATIVE_HOOK_READBACK_INCOMPLETE');
  const own = groups[0].hooks.filter(hook => hook?.pluginId === pluginId);
  if (!own.length) return verdict('WAITING_NATIVE_HOOK_DISCOVERY');
  const sourcePath = own[0].sourcePath;
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)
    || !sourcePath.endsWith(path.join('hooks', 'codex-hooks.json'))
    || own.some(hook => hook.sourcePath !== sourcePath)) return verdict('PUBLIC_HOOK_SOURCE_MISMATCH');
  const pluginRoot = path.dirname(path.dirname(sourcePath));
  if (await fs.realpath(pluginRoot) !== pluginRoot) fail('INSTALLED_PLUGIN_CANONICAL_ROOT_REQUIRED');
  const prefix = `plugins/${NAME}/`;
  const inventory = verifiedPackage.manifest.files.filter(item => item.path.startsWith(prefix))
    .map(item => ({...item, path: item.path.slice(prefix.length)}));
  const hookSource = inventory.find(item => item.path === 'hooks/codex-hooks.json');
  if (!hookSource || !inventory.length) fail('PUBLIC_PLUGIN_HOOK_PROFILE_UNSUPPORTED');
  if (JSON.stringify(await installedFiles(pluginRoot)) !== JSON.stringify(inventory.map(item => item.path).sort())) fail('INSTALLED_PLUGIN_INVENTORY_CHANGED');
  for (const item of inventory) {
    const bytes = await regularFile(path.join(pluginRoot, item.path), 2 * 1024 * 1024);
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) fail('INSTALLED_PLUGIN_FILE_HASH_MISMATCH');
  }
  const expected = await expectedCodexHooks({pluginRoot, pluginId, pluginVersion,
    hookSourceSha256: hookSource.sha256});
  return {...assessCodexHooks(readback, {cwd, expected}), installed_inventory: 'EXACT_VERIFIED_PUBLIC_PACKAGE'};
}
