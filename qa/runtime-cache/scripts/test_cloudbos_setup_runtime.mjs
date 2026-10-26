#!/usr/bin/env node
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runtimeProfile, runtimeCacheName, verifyRuntime, installRuntime, probeRuntime}
  from '../installers/cloudbos-setup/runtime.mjs';

let temporary;
const codeIs = expected => error => error.code === expected;
before(async () => {temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bos-runtime-test-')));});
after(async () => {await fs.rm(temporary, {recursive: true, force: true});});

test('only the two reviewed platform profiles exist; caches bind exact vendor bytes', () => {
  for (const id of ['darwin-arm64', 'win32-x64']) {
    const p = runtimeProfile(id);
    assert.match(p.sha256, /^[a-f0-9]{64}$/); assert.match(p.license_sha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(p), true);
    assert.match(runtimeCacheName(id), new RegExp(`^node-v24\\.22\\.1-${id}-${p.sha256.slice(0, 16)}$`));
  }
  for (const id of ['linux-x64', 'darwin-x64', '__proto__', 'latest', '../win32-x64']) {
    assert.throws(() => runtimeProfile(id), codeIs('SUPPORTED_RUNTIME_PROFILE_REQUIRED'));
  }
});

test('relative paths, linked directories and linked binaries are not runtime roots', async () => {
  await assert.rejects(verifyRuntime('relative', 'darwin-arm64'), codeIs('EXACT_RUNTIME_DIRECTORY_REQUIRED'));
  const root = path.join(temporary, 'links'); await fs.mkdir(root); await fs.mkdir(path.join(root, 'bin'));
  await fs.writeFile(path.join(root, 'LICENSE'), 'fixture');
  await fs.symlink(path.join(root, 'LICENSE'), path.join(root, 'bin/node'));
  await assert.rejects(verifyRuntime(root, 'darwin-arm64'), codeIs('RUNTIME_SYMLINK_DENIED'));
  const alias = path.join(temporary, 'alias'); await fs.symlink(root, alias, 'dir');
  await assert.rejects(verifyRuntime(alias, 'darwin-arm64'), codeIs('CANONICAL_RUNTIME_DIRECTORY_REQUIRED'));
});

test('missing and extra files cannot supply an apparently complete runtime', async () => {
  const root = path.join(temporary, 'missing'); await fs.mkdir(root);
  await assert.rejects(verifyRuntime(root, 'win32-x64'), codeIs('RUNTIME_INVENTORY_MISMATCH'));
  await fs.writeFile(path.join(root, 'node.exe'), 'fixture'); await fs.writeFile(path.join(root, 'LICENSE'), 'fixture');
  await fs.writeFile(path.join(root, 'extra'), 'unexpected');
  await assert.rejects(verifyRuntime(root, 'win32-x64'), codeIs('RUNTIME_INVENTORY_MISMATCH'));
});

test('a misleading filename or version label cannot bypass vendor size/hash checks', async () => {
  const root = path.join(temporary, 'wrong-bytes'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'node.exe'), 'v24.22.1'); await fs.writeFile(path.join(root, 'LICENSE'), 'fixture');
  await assert.rejects(verifyRuntime(root, 'win32-x64'), codeIs('RUNTIME_FILE_SIZE_OR_TYPE_MISMATCH'));
  const file = path.join(root, 'node.exe'), handle = await fs.open(file, 'w');
  await handle.truncate(runtimeProfile('win32-x64').size); await handle.close();
  await assert.rejects(verifyRuntime(root, 'win32-x64'), codeIs('RUNTIME_FILE_HASH_MISMATCH'));
});

test('a foreign platform cannot be probed even when its profile is known', async () => {
  const other = process.platform === 'win32' ? 'darwin-arm64' : 'win32-x64';
  await assert.rejects(probeRuntime(temporary, other), codeIs('NATIVE_RUNTIME_PLATFORM_REQUIRED'));
});

const vendorRoot = process.env.BOS_RUNTIME_TEST_VENDOR_ROOT;
const profileId = process.env.BOS_RUNTIME_TEST_PROFILE || `${process.platform}-${process.arch}`;
test('real pinned runtime installs privately, probes without system Node/PATH, and reuses verified bytes',
  {skip: !vendorRoot ? 'Official vendor payload not supplied; native cache acceptance NOT_RUN' : false}, async () => {
    const source = await fs.realpath(vendorRoot), profile = runtimeProfile(profileId);
    const verified = await verifyRuntime(source, profileId);
    assert.equal(verified.sha256, profile.sha256); assert.equal(verified.authority_granted, false);
    const cache = path.join(temporary, 'private cache'); await fs.mkdir(cache);
    let consent = 0;
    await assert.rejects(installRuntime({sourceRoot: source, cacheRoot: cache, profile: profileId}), codeIs('USER_DEFERRED'));
    assert.deepEqual(await fs.readdir(cache), []);
    const installed = await installRuntime({sourceRoot: source, cacheRoot: cache, profile: profileId, confirm: async action => {
      consent++; assert.equal(action.global_install, false); assert.equal(action.global_PATH_change, false);
      assert.equal(action.executable_sha256, profile.sha256);
      assert.equal(action.destination, path.join(cache, runtimeCacheName(profileId))); return true;
    }});
    assert.equal(installed.status, 'RUNTIME_INSTALLED'); assert.equal(consent, 1);
    assert.equal(installed.publisher_signature, 'SEPARATE_NATIVE_READBACK_REQUIRED');
    const oldOptions = process.env.NODE_OPTIONS;
    try {
      process.env.NODE_OPTIONS = '--require /must-not-be-loaded-by-runtime-probe';
      const probe = await probeRuntime(installed.root, profileId);
      assert.equal(probe.observed_version, 'v24.22.1'); assert.equal(probe.system_Node_required, false);
      assert.equal(probe.global_PATH_changed, false);
    } finally {if (oldOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = oldOptions;}
    const reused = await installRuntime({sourceRoot: source, cacheRoot: cache, profile: profileId,
      confirm: async () => {throw Error('Correct verified runtime must not request repeat consent');}});
    assert.equal(reused.status, 'RUNTIME_REUSED');

    const descriptor = path.join(installed.root, 'runtime.json'); await fs.chmod(descriptor, 0o644);
    const original = await fs.readFile(descriptor); await fs.writeFile(descriptor, '{"native_acceptance":"COMPLETE_VERIFIED"}');
    await assert.rejects(verifyRuntime(installed.root, profileId, {installed: true}), codeIs('RUNTIME_DESCRIPTOR_CHANGED'));
    await fs.writeFile(descriptor, original);
    const binary = path.join(installed.root, profile.executable); await fs.chmod(binary, 0o755); await fs.appendFile(binary, 'changed');
    await assert.rejects(installRuntime({sourceRoot: source, cacheRoot: cache, profile: profileId, confirm: async () => true}),
      codeIs('RUNTIME_FILE_SIZE_OR_TYPE_MISMATCH'));
    assert.equal((await fs.stat(binary)).size, profile.size + 7, 'corrupt cache must not be silently overwritten');
    assert.equal((await verifyRuntime(source, profileId)).sha256, profile.sha256, 'vendor source stays intact');
  });
