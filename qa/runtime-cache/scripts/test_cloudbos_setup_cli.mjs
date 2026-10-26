#!/usr/bin/env node
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {codexSetupProfile, codexSetupCacheName, verifyCodexSetup, installCodexSetup, probeCodexSetup}
  from '../installers/cloudbos-setup/codex-cli.mjs';

let temporary;
const codeIs = code => error => error.code === code;
before(async () => {temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-setup-cli-test-')));});
after(async () => {await fs.rm(temporary, {recursive: true, force: true});});

test('private setup CLI pins reject unknown platforms and floating versions', () => {
  for (const id of ['darwin-arm64', 'win32-x64']) {
    const p = codexSetupProfile(id);
    assert.equal(p.version, '0.163.0'); assert.equal(Object.isFrozen(p), true);
    assert.match(p.source, /^https:\/\/registry\.npmjs\.org\/@openai\/codex\/-\/codex-0\.163\.0-/);
    assert.ok(codexSetupCacheName(id).endsWith(p.sha256.slice(0, 16)));
  }
  for (const id of ['darwin-x64', 'linux-x64', 'latest', '__proto__', '../win32-x64']) {
    assert.throws(() => codexSetupProfile(id), codeIs('SUPPORTED_SETUP_CLI_PROFILE_REQUIRED'));
  }
});

test('relative roots, symlinks, directories and extra files cannot supply a CLI payload', async () => {
  await assert.rejects(verifyCodexSetup('relative', 'win32-x64'), codeIs('EXACT_SETUP_CLI_DIRECTORY_REQUIRED'));
  const root = path.join(temporary, 'inventory'); await fs.mkdir(root);
  for (const name of ['codex.exe', 'LICENSE', 'NOTICE']) await fs.writeFile(path.join(root, name), 'fixture');
  await fs.mkdir(path.join(root, 'auth'));
  await assert.rejects(verifyCodexSetup(root, 'win32-x64'), codeIs('SETUP_CLI_INVENTORY_MISMATCH'));
  await fs.rmdir(path.join(root, 'auth')); await fs.unlink(path.join(root, 'codex.exe'));
  await fs.symlink(path.join(root, 'LICENSE'), path.join(root, 'codex.exe'));
  await assert.rejects(verifyCodexSetup(root, 'win32-x64'), codeIs('SETUP_CLI_INVENTORY_MISMATCH'));
  const alias = path.join(temporary, 'alias'); await fs.symlink(root, alias, 'dir');
  await assert.rejects(verifyCodexSetup(alias, 'win32-x64'), codeIs('CANONICAL_SETUP_CLI_DIRECTORY_REQUIRED'));
});

test('a native-looking filename/version cannot replace vendor bytes', async () => {
  const root = path.join(temporary, 'wrong-bytes'); await fs.mkdir(root);
  for (const name of ['codex.exe', 'LICENSE', 'NOTICE']) await fs.writeFile(path.join(root, name), 'codex-cli 0.163.0');
  await assert.rejects(verifyCodexSetup(root, 'win32-x64'), codeIs('SETUP_CLI_FILE_SIZE_OR_TYPE_MISMATCH'));
  const binary = await fs.open(path.join(root, 'codex.exe'), 'w');
  await binary.truncate(codexSetupProfile('win32-x64').size); await binary.close();
  await assert.rejects(verifyCodexSetup(root, 'win32-x64'), codeIs('SETUP_CLI_FILE_HASH_MISMATCH'));
});

test('probing a foreign platform never executes its binary', async () => {
  const id = process.platform === 'win32' ? 'darwin-arm64' : 'win32-x64';
  await assert.rejects(probeCodexSetup(temporary, id), codeIs('NATIVE_SETUP_CLI_PLATFORM_REQUIRED'));
});

const vendorRoot = process.env.BOS_SETUP_CLI_TEST_VENDOR_ROOT;
const profile = process.env.BOS_SETUP_CLI_TEST_PROFILE || `${process.platform}-${process.arch}`;
test('real vendor CLI installs and probes privately without system CLI/PATH or account data',
  {skip: !vendorRoot ? 'Official vendor CLI not supplied; native cache acceptance NOT_RUN' : false}, async () => {
    const source = await fs.realpath(vendorRoot), p = codexSetupProfile(profile);
    const cache = path.join(temporary, 'private CLI cache'); await fs.mkdir(cache);
    await assert.rejects(installCodexSetup({sourceRoot: source, cacheRoot: cache, profile}), codeIs('USER_DEFERRED'));
    assert.deepEqual(await fs.readdir(cache), []);
    let decisions = 0;
    const installed = await installCodexSetup({sourceRoot: source, cacheRoot: cache, profile, confirm: async action => {
      decisions++; assert.equal(action.global_install, false); assert.equal(action.global_PATH_change, false);
      assert.equal(action.native_trust_change, false); assert.equal(action.model_execution, false);
      assert.equal(action.executable_sha256, p.sha256); return true;
    }});
    assert.equal(decisions, 1); assert.equal(installed.status, 'SETUP_CLI_INSTALLED');
    assert.equal(installed.publisher_signature, 'SEPARATE_NATIVE_READBACK_REQUIRED');
    const probe = await probeCodexSetup(installed.root, profile);
    assert.equal(probe.observed_version, 'codex-cli 0.163.0'); assert.equal(probe.system_CLI_required, false);
    assert.equal(probe.global_PATH_changed, false); assert.equal(probe.model_started, false);
    const reused = await installCodexSetup({sourceRoot: source, cacheRoot: cache, profile,
      confirm: async () => {throw Error('Already verified cache does not request repeat consent');}});
    assert.equal(reused.status, 'SETUP_CLI_REUSED');
    const saved = path.join(installed.root, 'setup-cli.json'); await fs.chmod(saved, 0o644);
    const original = await fs.readFile(saved); await fs.writeFile(saved, '{"native_trust":"trusted"}');
    await assert.rejects(verifyCodexSetup(installed.root, profile, {installed: true}), codeIs('SETUP_CLI_DESCRIPTOR_CHANGED'));
    await fs.writeFile(saved, original);
    const binary = path.join(installed.root, p.executable); await fs.chmod(binary, 0o755); await fs.appendFile(binary, 'changed');
    await assert.rejects(installCodexSetup({sourceRoot: source, cacheRoot: cache, profile, confirm: async () => true}),
      codeIs('SETUP_CLI_FILE_SIZE_OR_TYPE_MISMATCH'));
    assert.equal((await fs.stat(binary)).size, p.size + 7, 'corrupt installed bytes are retained for review');
    assert.equal((await verifyCodexSetup(source, profile)).sha256, p.sha256, 'official source is unchanged');
  });
