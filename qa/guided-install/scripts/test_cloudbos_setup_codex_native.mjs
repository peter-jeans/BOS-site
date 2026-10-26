#!/usr/bin/env node
// Test doubles exercise denial/protocol boundaries. These are not native install receipts.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {expectedCodexHooks, assessCodexHooks, readCodexHooks, signInCheckpoint, installedSignInCheckpoint}
  from '../installers/cloudbos-setup/codex-native.mjs';

let temporary, root, cwd, expected, options;
const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd'];
const pluginId = 'cloudbos-public-plugin@test-source';
const version = '0.1.20-test.1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const codeIs = code => error => error.code === code;

before(async () => {
  temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-native-check-')));
  root = path.join(temporary, 'public plugin'); cwd = path.join(temporary, 'project');
  await fs.mkdir(path.join(root, '.codex-plugin'), {recursive: true});
  await fs.mkdir(path.join(root, 'hooks')); await fs.mkdir(cwd);
  await fs.writeFile(path.join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({
    name: 'cloudbos-public-plugin', version, hooks: './hooks/codex-hooks.json'}));
  const config = {hooks: Object.fromEntries(events.map(event => [event, [{hooks: [{type: 'command',
    command: 'node "${PLUGIN_ROOT}/scripts/bos_hook_ownership.mjs" run --host codex',
    timeout: event === 'SessionEnd' ? 3 : 5, statusMessage: 'BOS / Public / Codex — test fixture'}]}]]))};
  const bytes = JSON.stringify(config);
  await fs.writeFile(path.join(root, 'hooks', 'codex-hooks.json'), bytes);
  options = {pluginRoot: root, pluginId, pluginVersion: version, hookSourceSha256: digest(bytes)};
  expected = await expectedCodexHooks(options);
});
after(async () => {await fs.rm(temporary, {recursive: true, force: true});});

function readback() {
  return {data: [{cwd, errors: [], warnings: [], hooks: expected.definitions.map((definition, index) => ({
    ...definition, source: 'plugin', sourcePath: expected.sourcePath, pluginId,
    handlerType: 'command', isManaged: false, key: `fixture:${index}`, enabled: true,
    currentHash: `sha256:${'a'.repeat(64)}/sha256:${'b'.repeat(64)}`, trustStatus: 'trusted'}))}]};
}
const assess = value => assessCodexHooks(value, {cwd, expected});

test('exact trusted public definitions allow sign-in, without claiming hook execution or registry ownership', () => {
  const result = assess(readback());
  assert.equal(result.status, 'NATIVE_HOOKS_APPROVED'); assert.equal(result.may_start_sign_in, true);
  assert.equal(result.approved_hook_count, 6); assert.equal(result.native_trust_changed, false);
  assert.equal(result.hook_execution, 'NOT_OBSERVED');
  assert.equal(result.owner_registration, 'SEPARATE_READBACK_REQUIRED');
});

test('native 0.163 single-digest identifiers retain the same explicit trust and complete-definition checks', () => {
  const value = readback();
  for (const hook of value.data[0].hooks) hook.currentHash = `sha256:${'c'.repeat(64)}`;
  assert.equal(assess(value).may_start_sign_in, true);
  value.data[0].hooks[0].trustStatus = 'untrusted';
  assert.equal(assess(value).status, 'WAITING_NATIVE_HOOK_APPROVAL');
  value.data[0].hooks[0].trustStatus = 'trusted';
  for (const hash of ['sha256:short', `sha256:${'g'.repeat(64)}`, `sha256:${'c'.repeat(64)}/sha256:${'d'.repeat(64)}/sha256:${'e'.repeat(64)}`]) {
    value.data[0].hooks[0].currentHash = hash; assert.equal(assess(value).may_start_sign_in, false);
  }
});

test('expected definitions bind exact canonical root, public family, version and independently pinned source hash', async () => {
  for (const [patch, code] of [
    [{pluginRoot: 'relative'}, 'EXACT_NATIVE_PATH_REQUIRED'],
    [{pluginId: 'cloudbos-connector@test-source'}, 'EXACT_PUBLIC_PLUGIN_REQUIRED'],
    [{pluginId: 'cloudbos-public-plugin@'}, 'EXACT_PUBLIC_PLUGIN_REQUIRED'],
    [{pluginVersion: '0.1.0'}, 'PUBLIC_PLUGIN_HOOK_PROFILE_UNSUPPORTED'],
    [{hookSourceSha256: 'a'.repeat(64)}, 'VERIFIED_HOOK_SOURCE_REQUIRED'],
    [{hookSourceSha256: null}, 'VERIFIED_HOOK_SOURCE_REQUIRED'],
  ]) await assert.rejects(expectedCodexHooks({...options, ...patch}), codeIs(code));
  const alias = path.join(temporary, 'alias'); await fs.symlink(root, alias, 'dir');
  await assert.rejects(expectedCodexHooks({...options, pluginRoot: alias}), codeIs('EXACT_PUBLIC_PLUGIN_REQUIRED'));
});

test('missing or extra lifecycle event cannot be certified as the full public hook profile', async () => {
  const filename = path.join(root, 'hooks', 'codex-hooks.json'), original = await fs.readFile(filename);
  try {
    for (const mutate of [config => delete config.hooks.Stop,
      config => {config.hooks.UnknownEvent = clone(config.hooks.Stop);},
      config => {config.hooks.Stop[0].hooks[0].command = 'node arbitrary.mjs';},
      config => {config.hooks.SessionEnd[0].hooks[0].timeout = 5;}]) {
      const config = JSON.parse(original); mutate(config); const bytes = JSON.stringify(config);
      await fs.writeFile(filename, bytes);
      await assert.rejects(expectedCodexHooks({...options, hookSourceSha256: digest(bytes)}));
    }
  } finally {await fs.writeFile(filename, original);}
});

test('native Windows command override is bound to its source and never used for Mac', async () => {
  const filename = path.join(root, 'hooks', 'codex-hooks.json'), original = await fs.readFile(filename);
  try {
    const config = JSON.parse(original);
    for (const groups of Object.values(config.hooks)) groups[0].hooks[0].commandWindows =
      'cmd.exe /d /s /c call "${PLUGIN_ROOT}/scripts/bootstrap-codex.cmd" SessionStart';
    const bytes = JSON.stringify(config); await fs.writeFile(filename, bytes);
    const input = {...options, hookSourceSha256: digest(bytes)};
    const windows = await expectedCodexHooks({...input, platform: 'win32'});
    const mac = await expectedCodexHooks({...input, platform: 'darwin'});
    assert.ok(windows.definitions.every(d => d.command.startsWith('cmd.exe ')));
    assert.ok(mac.definitions.every(d => d.command.startsWith('node ')));
    const native = readback();
    for (let i = 0; i < native.data[0].hooks.length; i++) Object.assign(native.data[0].hooks[i], windows.definitions[i]);
    assert.equal(assessCodexHooks(native, {cwd, expected: windows}).may_start_sign_in, true);
    assert.equal(assessCodexHooks(native, {cwd, expected: mac}).may_start_sign_in, false);
    config.hooks.Stop[0].hooks[0].commandWindows = 'arbitrary executable';
    const changed = JSON.stringify(config); await fs.writeFile(filename, changed);
    await assert.rejects(expectedCodexHooks({...options, hookSourceSha256: digest(changed), platform: 'darwin'}),
      codeIs('PUBLIC_HOOK_PROFILE_CHANGED'));
  } finally {await fs.writeFile(filename, original);}
});

const rowCases = [
  ['disabled', {enabled: false}, 'WAITING_NATIVE_HOOK_ENABLEMENT'],
  ['untrusted', {trustStatus: 'untrusted'}, 'WAITING_NATIVE_HOOK_APPROVAL'],
  ['changed since trust', {trustStatus: 'modified'}, 'WAITING_NATIVE_HOOK_APPROVAL'],
  ['unknown trust', {trustStatus: null}, 'WAITING_NATIVE_HOOK_APPROVAL'],
  ['managed rather than owner-reviewed', {isManaged: true}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['project rather than plugin source', {source: 'project'}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['wrong source path', {sourcePath: '/other/hooks.json'}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['wrong hash shape', {currentHash: 'trusted'}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['missing key', {key: ''}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['wrong handler', {handlerType: 'prompt'}, 'PUBLIC_HOOK_SOURCE_MISMATCH'],
  ['changed command', {command: 'different command'}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed event', {eventName: 'unknown'}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed matcher', {matcher: '.*'}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed timeout', {timeoutSec: 600}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed async behavior', {async: true}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed context limit', {additionalContextLimit: 1}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
  ['changed review label', {statusMessage: 'Other product'}, 'PUBLIC_HOOK_DEFINITION_MISMATCH'],
];
for (const [label, patch, status] of rowCases) test(`${label} prevents sign-in`, () => {
  const value = readback(); Object.assign(value.data[0].hooks[0], patch);
  assert.equal(assess(value).status, status); assert.equal(assess(value).may_start_sign_in, false);
});

test('missing, repeated or duplicate definitions cannot satisfy the complete set', () => {
  for (const change of [rows => rows.pop(), rows => rows.push(clone(rows[0])), rows => {rows[1] = clone(rows[0]);}]) {
    const value = readback(); change(value.data[0].hooks);
    assert.equal(assess(value).may_start_sign_in, false);
  }
  const value = readback(); value.data[0].hooks = [];
  assert.equal(assess(value).status, 'WAITING_NATIVE_HOOK_DISCOVERY');
});

test('a second enabled public source needs review; independent private/local sources coexist', () => {
  const value = readback(), rows = value.data[0].hooks;
  rows.push({...clone(rows[0]), pluginId: 'cloudbos-connector@bos-local'});
  rows.push({...clone(rows[0]), pluginId: 'bos-codex-operator-plugin@bos-local'});
  assert.equal(assess(value).may_start_sign_in, true);
  const other = {...clone(rows[0]), pluginId: 'cloudbos-public-plugin@older-market', enabled: false};
  rows.push(other); assert.equal(assess(value).may_start_sign_in, true);
  other.enabled = true;
  assert.equal(assess(value).status, 'PUBLIC_HOOK_REGISTRATION_CONFLICT');
});

test('errors, warnings, other-folder and ambiguous readback never unlock sign-in', () => {
  for (const change of [v => {v.data[0].errors.push({message: 'fixture'});},
    v => {v.data[0].warnings.push('fixture');}, v => {v.data[0].cwd += '-other';},
    v => v.data.push(clone(v.data[0])), v => {delete v.data[0].errors;},
    v => {delete v.data[0].warnings;}]) {
    const value = readback(); change(value); assert.equal(assess(value).may_start_sign_in, false);
  }
  assert.equal(assess(null).may_start_sign_in, false);
});

test('sign-in checkpoint refreshes native evidence on every invocation and cannot reuse earlier approval', async () => {
  let count = 0;
  const nativeRead = async input => {
    assert.equal(input.cwd, cwd); assert.equal(input.executable, process.execPath);
    const value = readback(); if (++count > 1) value.data[0].hooks[0].trustStatus = 'modified'; return value;
  };
  const input = {executable: process.execPath, cwd, expected, nativeRead};
  assert.equal((await signInCheckpoint(input)).may_start_sign_in, true);
  assert.equal((await signInCheckpoint(input)).may_start_sign_in, false); assert.equal(count, 2);
});

test('native paths and version labels cannot substitute for the complete installed payload inventory', async () => {
  const files = ['.codex-plugin/plugin.json', 'hooks/codex-hooks.json'];
  const inventory = [];
  for (const name of files) {
    const bytes = await fs.readFile(path.join(root, name));
    inventory.push({path: `plugins/cloudbos-public-plugin/${name}`, sha256: digest(bytes), size: bytes.length});
  }
  const input = {executable: process.execPath, cwd, pluginId, pluginVersion: version,
    verifiedPackage: {manifest: {files: inventory}}, nativeRead: async () => readback()};
  assert.equal((await installedSignInCheckpoint(input)).may_start_sign_in, true);
  const changed = path.join(root, 'unexpected.txt'); await fs.writeFile(changed, 'unexpected payload');
  await assert.rejects(installedSignInCheckpoint(input), codeIs('INSTALLED_PLUGIN_INVENTORY_CHANGED'));
  await fs.unlink(changed);
  const file = path.join(root, '.codex-plugin', 'plugin.json'), original = await fs.readFile(file);
  try {
    await fs.appendFile(file, ' ');
    await assert.rejects(installedSignInCheckpoint(input), codeIs('INSTALLED_PLUGIN_FILE_HASH_MISMATCH'));
  } finally {await fs.writeFile(file, original);}
  const link = path.join(root, 'unexpected-link'); await fs.symlink(file, link);
  try {await assert.rejects(installedSignInCheckpoint(input), codeIs('INSTALLED_PLUGIN_SPECIAL_FILE_DENIED'));}
  finally {await fs.unlink(link);}
});

function transportFixture(behavior) {
  const requests = [], spawns = [], kills = [];
  const spawnProcess = (executable, args, opts) => {
    spawns.push({executable, args, opts});
    const child = new EventEmitter();
    Object.assign(child, {stdin: new PassThrough(), stdout: new PassThrough(), exitCode: null, signalCode: null});
    child.kill = (signal = 'SIGTERM') => {kills.push(signal); child.signalCode = signal; queueMicrotask(() => child.emit('close')); return true;};
    const respond = value => queueMicrotask(() => child.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n'));
    child.stdin.on('data', bytes => {
      const message = JSON.parse(bytes); requests.push(message);
      behavior({message, child, respond});
    });
    return child;
  };
  return {requests, spawns, kills, spawnProcess};
}
const initialized = ({message, respond}) => {if (message.id === 1) respond({id: 1, result: {userAgent: 'fixture'}});};
const read = (fixture, extra = {}) => readCodexHooks({executable: process.execPath, cwd,
  env: {BOS_TEST_ONLY: 'fixture'}, timeoutMs: 1000, spawnProcess: fixture.spawnProcess, ...extra});

test('bounded native transport calls only initialize and hooks/list, then closes dedicated process', async () => {
  const fixture = transportFixture(input => {
    initialized(input);
    if (input.message.id === 2) {
      // Partial lines are allowed; arbitrary native requests are never approved.
      input.respond({method: 'someServerRequest', id: 91, params: {}});
      const text = JSON.stringify({id: 2, result: readback()}) + '\n';
      input.respond(text.slice(0, 17)); input.respond(text.slice(17));
    }
  });
  const result = await read(fixture); assert.equal(assess(result).may_start_sign_in, true);
  assert.deepEqual(fixture.requests.map(x => x.method), ['initialize', 'initialized', 'hooks/list']);
  assert.deepEqual(fixture.requests[2].params, {cwds: [cwd]});
  assert.deepEqual(fixture.spawns[0].args, ['--no-daemon', 'app-server', '--stdio']);
  assert.equal(fixture.spawns[0].opts.cwd, cwd); assert.equal(fixture.spawns[0].opts.shell, undefined);
  assert.equal(fixture.kills.length, 1);
});

for (const raw of ['null\n', '[]\n', '"string"\n', 'garbage\n']) test(`invalid native frame ${raw.trim()} is rejected`, async () => {
  const fixture = transportFixture(({respond}) => respond(raw));
  await assert.rejects(read(fixture), codeIs('NATIVE_HOOK_READBACK_INVALID'));
});

test('premature data, native error and closed transport never produce approval', async () => {
  const premature = transportFixture(({respond}) => respond({id: 2, result: readback()}));
  await assert.rejects(read(premature), codeIs('NATIVE_HOOK_READBACK_INVALID'));
  const denied = transportFixture(({respond}) => respond({id: 1, error: {message: 'do not retain'}}));
  await assert.rejects(read(denied), codeIs('NATIVE_HOOK_READBACK_UNAVAILABLE'));
  const closed = transportFixture(({child}) => queueMicrotask(() => {child.exitCode = 1; child.emit('close');}));
  await assert.rejects(read(closed), codeIs('NATIVE_HOOK_READBACK_INCOMPLETE'));
});

test('timeouts and output limits stop the dedicated process and sanitize failure output', async () => {
  const silent = transportFixture(() => {});
  await assert.rejects(read(silent, {timeoutMs: 10}), codeIs('NATIVE_HOOK_READBACK_TIMEOUT'));
  assert.equal(silent.kills.length, 1);
  const loud = transportFixture(({respond}) => respond('secret-like fixture output'.repeat(20)));
  await assert.rejects(read(loud, {maxBytes: 32}), error => error.code === 'NATIVE_HOOK_READBACK_OVERSIZE'
    && !error.message.includes('secret-like'));
  assert.equal(loud.kills.length, 1);
  for (const patch of [{timeoutMs: 0}, {timeoutMs: 60001}, {maxBytes: -1}, {maxBytes: 4194305}]) {
    assert.throws(() => read(loud, patch), codeIs('NATIVE_READBACK_BOUNDS_REQUIRED'));
  }
});
