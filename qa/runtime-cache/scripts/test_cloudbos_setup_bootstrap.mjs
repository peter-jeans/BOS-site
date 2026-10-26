#!/usr/bin/env node
// Controller-assisted bootstrap fixtures; never native hook-trust/firing proof.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {installRuntime, runtimeProfile} from '../installers/cloudbos-setup/runtime.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supported = process.platform === 'darwin' || process.platform === 'win32';
let temporary, plugin, project, script;
before(async () => {
  temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-bootstrap-test-')));
  plugin = path.join(temporary, 'public plugin with spaces'); project = path.join(temporary, 'public project');
  await fs.mkdir(path.join(plugin, 'scripts'), {recursive: true}); await fs.mkdir(project);
  for (const extension of ['sh', 'cmd']) await fs.copyFile(path.join(repository, `installers/cloudbos-setup/bootstrap-codex.${extension}`),
    path.join(plugin, `scripts/bootstrap-codex.${extension}`));
  script = path.join(plugin, `scripts/bootstrap-codex.${process.platform === 'win32' ? 'cmd' : 'sh'}`);
});
after(async () => {await fs.rm(temporary, {recursive: true, force: true});});

function run(event, {cwd = project, cache = path.join(temporary, 'missing runtime'), input = '{}', poison = false} = {}) {
  const env = {BOS_RUNTIME_CACHE_ROOT: cache, PATH: process.platform === 'win32'
    ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin'};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  if (poison) {env.NODE_OPTIONS = '--require /must-not-load-unreviewed-code'; env.NODE_PATH = '/must-not-resolve-unreviewed-modules';}
  const executable = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'cmd.exe') : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', `call "${script}" ${event}`] : [script, event];
  const result = spawnSync(executable, args, {cwd, env, input, encoding: 'utf8', shell: false,
    windowsVerbatimArguments: process.platform === 'win32', timeout: 15000, maxBuffer: 65536});
  assert.equal(result.status, 0, result.stderr || result.error?.message); return JSON.parse(result.stdout);
}

test('missing runtime denies only the dependent Cloud pre-tool operation', {skip: !supported}, () => {
  const result = run('PreToolUse');
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /runtime needs repair/);
  assert.match(run('SessionStart').systemMessage, /Ordinary authorized work can continue/);
});

test('other missing-runtime events stay passive and capture no input', {skip: !supported}, () => {
  for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd']) {
    assert.deepEqual(run(event, {input: '{"prompt":"fixture-private-marker"}'}), {});
  }
});

test('private/local marker at the project or ancestor is preserved even with no public runtime', {skip: !supported}, async () => {
  const parent = path.join(temporary, 'private project'), child = path.join(parent, 'nested child');
  await fs.mkdir(child, {recursive: true}); await fs.mkdir(path.join(parent, '.bos'));
  for (const cwd of [parent, child]) for (const event of ['SessionStart', 'PreToolUse']) assert.deepEqual(run(event, {cwd}), {});
  const master = path.join(temporary, 'explicit authority project'); await fs.mkdir(master);
  await fs.writeFile(path.join(master, 'BOS_PRODUCT_AUTHORITY.json'), '{}');
  assert.deepEqual(run('PreToolUse', {cwd: master}), {});
});

const vendor = process.env.BOS_RUNTIME_TEST_VENDOR_ROOT;
test('real pinned runtime forwards stdin, removes preload overrides and supplies the delegate without system Node',
  {skip: !supported || !vendor ? 'Official native runtime not supplied; bootstrap execution NOT_RUN' : false}, async () => {
    const profile = process.env.BOS_RUNTIME_TEST_PROFILE || `${process.platform}-${process.arch}`;
    const cache = path.join(temporary, 'runtime cache with spaces'); await fs.mkdir(cache);
    const installed = await installRuntime({sourceRoot: await fs.realpath(vendor), cacheRoot: cache, profile, confirm: async () => true});
    // This explicitly labelled fixture checks launch mechanics only. It does
    // not replace or approve the real BOS router or create governance evidence.
    await fs.writeFile(path.join(plugin, 'scripts/bos_hook_ownership.mjs'), `
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
let input = ''; for await (const chunk of process.stdin) input += chunk;
console.log(JSON.stringify({fixture: 'CONTROLLER_ASSISTED_ONLY', runtime: process.version,
  delegated_runtime: spawnSync('node', ['--version'], {encoding: 'utf8'}).stdout.trim(),
  preload_options_present: Boolean(process.env.NODE_OPTIONS || process.env.NODE_PATH),
  input_sha256: createHash('sha256').update(input).digest('hex')}));
`);
    const input = JSON.stringify({hook_event_name: 'UserPromptSubmit', prompt: 'fixture-private-marker'});
    const output = run('UserPromptSubmit', {cache, input, poison: true});
    assert.equal(output.fixture, 'CONTROLLER_ASSISTED_ONLY');
    assert.equal(output.runtime, 'v24.22.1'); assert.equal(output.delegated_runtime, 'v24.22.1');
    assert.equal(output.preload_options_present, false);
    assert.equal(output.input_sha256, createHash('sha256').update(input).digest('hex'));
    assert.doesNotMatch(JSON.stringify(output), /fixture-private-marker/);
    const binary = path.join(installed.root, runtimeProfile(profile).executable);
    await fs.chmod(binary, 0o755); await fs.appendFile(binary, 'changed');
    assert.equal(run('PreToolUse', {cache}).hookSpecificOutput.permissionDecision, 'deny');
    assert.deepEqual(run('UserPromptSubmit', {cache, input}), {});
  });
