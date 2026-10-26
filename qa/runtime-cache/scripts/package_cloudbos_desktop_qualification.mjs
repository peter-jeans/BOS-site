#!/usr/bin/env node
// New local qualification app only. No signing, release or website publication.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyDistribution, verifyPackage} from '../installers/cloudbos-setup/setup.mjs';
import {verifyRuntime} from '../installers/cloudbos-setup/runtime.mjs';
import {verifyCodexSetup} from '../installers/cloudbos-setup/codex-cli.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../installers/cloudbos-setup');
const keys = ['--runtime-source', '--cli-source', '--plugin-bundle', '--setup', '--output'];
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!keys.includes(key) || !value || args[key]) throw Error('EXACT_DESKTOP_PACKAGE_ARGUMENTS_REQUIRED');
  args[key] = path.resolve(value);
}
const profile = `${process.platform}-${process.arch}`, mac = profile === 'darwin-arm64';
if (Object.keys(args).length !== keys.length || !['darwin-arm64', 'win32-x64'].includes(profile)) {
  throw Error('SUPPORTED_NATIVE_QUALIFICATION_BUILD_REQUIRED');
}
const output = args['--output'];
if (mac && !output.endsWith('.app') || output === source || output.startsWith(source + path.sep)
  || output === path.parse(output).root) throw Error('NEW_QUALIFICATION_APP_REQUIRED');
try {await fs.lstat(output); throw Error('NEW_QUALIFICATION_APP_REQUIRED');} catch (e) {if (e.code !== 'ENOENT') throw e;}
if (await fs.realpath(path.dirname(output)) !== path.dirname(output)) throw Error('CANONICAL_BUILD_PARENT_REQUIRED');
const release = await verifyDistribution(args['--setup']);
if (release.delivery !== 'QUALIFICATION_ONLY') throw Error('QUALIFICATION_ONLY_SETUP_REQUIRED');
await verifyPackage(args['--plugin-bundle'], release);
await verifyRuntime(args['--runtime-source'], profile); await verifyCodexSetup(args['--cli-source'], profile);
const resources = path.join(output, mac ? 'Contents/Resources' : 'Resources');
const executable = path.join(output, mac ? 'Contents/MacOS/BOSSetup' : 'BOSSetup.exe');
await fs.mkdir(path.dirname(executable), {recursive: true, mode: 0o700}); await fs.mkdir(resources, {mode: 0o700});
await fs.mkdir(path.join(resources, 'engine'), {mode: 0o700}); await fs.mkdir(path.join(resources, 'vendor'), {mode: 0o700});
for (const name of ['desktop-entry.mjs', 'desktop.mjs', 'setup.mjs', 'codex-native.mjs', 'runtime.mjs', 'codex-cli.mjs']) {
  const stat = await fs.lstat(path.join(source, name)); if (!stat.isFile() || stat.isSymbolicLink()) throw Error('REGULAR_ENGINE_SOURCE_REQUIRED');
  await fs.copyFile(path.join(source, name), path.join(resources, 'engine', name));
}
for (const [from, to] of [[args['--runtime-source'], 'vendor/node'], [args['--cli-source'], 'vendor/codex'],
  [args['--setup'], 'sealed-setup'], [args['--plugin-bundle'], 'package']]) {
  await fs.cp(from, path.join(resources, to), {recursive: true, errorOnExist: true, force: false});
}
await verifyDistribution(path.join(resources, 'sealed-setup'));
await verifyPackage(path.join(resources, 'package'), release);
await verifyRuntime(path.join(resources, 'vendor/node'), profile);
await verifyCodexSetup(path.join(resources, 'vendor/codex'), profile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inventory = [];
async function walk(relative = '') {
  for (const entry of (await fs.readdir(path.join(resources, relative), {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = relative ? `${relative}/${entry.name}` : entry.name, filename = path.join(resources, name);
    if (entry.isSymbolicLink()) throw Error('DESKTOP_RESOURCE_SYMLINK_DENIED');
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile()) {
      const data = await fs.readFile(filename); inventory.push({path: name, size: data.length, sha256: hash(data)});
    } else throw Error('DESKTOP_RESOURCE_SPECIAL_FILE_DENIED');
  }
}
await walk();
const manifest = {schema: 'CLOUDBOS_DESKTOP_QUALIFICATION_V1', profile,
  delivery: 'QUALIFICATION_ONLY', plugin_version: release.plugin_version, package_digest: release.package_digest,
  public_release: false, customer_profile: 'NEVER_USE_OWNER_PROFILE', native_approval: 'NOT_GRANTED_BY_PACKAGE', files: inventory};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), pin = hash(manifestBytes);
await fs.writeFile(path.join(resources, 'DESKTOP_MANIFEST.json'), manifestBytes, {flag: 'wx'});
const build = await fs.mkdtemp(path.join(os.tmpdir(), 'bos-native-window-build-'));
try {
  if (mac) {
    await fs.copyFile(path.join(source, 'native/macos/BOSSetup.swift'), path.join(build, 'main.swift'));
    await fs.writeFile(path.join(build, 'ReleasePin.swift'), `let BOSManifestPin = "${pin}"\n`, {flag: 'wx'});
    execFileSync('/usr/bin/xcrun', ['swiftc', '-swift-version', '5', '-O', '-target', 'arm64-apple-macosx13.0',
      '-module-cache-path', path.join(build, 'module-cache'), '-framework', 'Cocoa', '-framework', 'CryptoKit',
      path.join(build, 'ReleasePin.swift'), path.join(build, 'main.swift'), '-o', executable],
    {stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 1048576});
  } else {
    const template = await fs.readFile(path.join(source, 'native/windows/BOSSetup.cs'), 'utf8');
    if (template.split('__BOS_DESKTOP_MANIFEST_PIN__').length !== 2) throw Error('EXACT_WINDOWS_MANIFEST_PIN_REQUIRED');
    const filename = path.join(build, 'BOSSetup.cs');
    await fs.writeFile(filename, template.replace('__BOS_DESKTOP_MANIFEST_PIN__', pin), {flag: 'wx'});
    const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+',
      '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
      '/out:' + executable, filename], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 1048576});
  }
} catch (error) {
  console.error(String(error.stderr || error.stdout || 'Native compiler unavailable').slice(0, 8192));
  throw Error('NATIVE_QUALIFICATION_COMPILE_FAILED');
}
if (mac) await fs.writeFile(path.join(output, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.cloudbos.setup.qualification</string>
<key>CFBundleName</key><string>BOS Setup Qualification</string>
<key>CFBundleExecutable</key><string>BOSSetup</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`, {flag: 'wx'});
console.log(JSON.stringify({schema: 'BOS_NATIVE_QUALIFICATION_APP_BUILD_V1', at: new Date().toISOString(),
  status: 'NATIVE_QUALIFICATION_APP_COMPILED', profile, output, resources_manifest_sha256: pin,
  executable_sha256: hash(await fs.readFile(executable)), resource_files: inventory.length,
  publisher_signed: false, notarized: false, native_UI_acceptance: 'NOT_OBSERVED', public_release: false}, null, 2));
