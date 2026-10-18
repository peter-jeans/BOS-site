import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {verifyDistribution, verifyPackage, setupHost, findExecutable, runCommand, invocation, selectedFolder, sha256} from './setup/setup.mjs';

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Real GitHub-hosted Windows qualification only');
const root = path.dirname(fileURLToPath(import.meta.url));
const setupRoot = path.join(root, 'setup');
const release = await verifyDistribution(setupRoot);
const pkg = await verifyPackage(path.join(root, 'package'), release);
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'Cloud BOS Windows QA '));
const report = {schema: 'CLOUDBOS_WINDOWS_NATIVE_QUALIFICATION_V1', commit: process.env.GITHUB_SHA,
  platform: process.platform, architecture: process.arch, os_release: os.release(), node: process.version,
  package_version: release.plugin_version, setup_version: release.setup_version,
  setup_inventory_sha256: sha256(await fs.readFile(path.join(setupRoot, 'SETUP_MANIFEST.json'))),
  OAuth: 'NOT_RUN_NO_CREDENTIALS', native_model_calls: 'NOT_RUN', browser_and_desktop_prompts: 'NOT_RUN',
  governance: 'NOT_INSTALLED_NO_BASELINE_OR_PLAN_ACCEPTANCE_SYNTHESIZED', hosts: []};
let activeHost = null, activeCommand = null;
let nativeMetadata = {};
function publicPaths(value) {
  if (typeof value === 'string') return value.split(work).join('<QA_TEMP>').split(root).join('<QA_SOURCE>');
  if (Array.isArray(value)) return value.map(publicPaths);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, publicPaths(v)]));
  return value;
}

async function runShell(exe, args, timeout = 20000, env = process.env) {
  return new Promise(resolve => {
    const child = spawn(exe, args, {cwd: work, env, shell: false,
      windowsVerbatimArguments: path.basename(exe).toLowerCase() === 'cmd.exe', stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const timer = setTimeout(() => child.kill(), timeout);
    child.on('error', () => {clearTimeout(timer);resolve({code: 127, stdout: '', stderr: ''});});
    child.on('close', code => {clearTimeout(timer);resolve({code: code ?? 124, stdout, stderr});});
  });
}

try {
  for (const host of ['codex', 'claude_code']) {
    activeHost = host;
    nativeMetadata = {};
    const profile = path.join(work, host + ' profile'); await fs.mkdir(profile);
    // Intended vendor profile-directory options, confined to this disposable VM.
    process.env[host === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR'] = profile;
    const executable = await findExecutable(host === 'codex' ? 'codex' : 'claude');
    if (!executable) throw new Error('NATIVE_CLI_NOT_INSTALLED');
    const calls = [], decisions = [];
    const runner = async (exe, args, options) => {
      activeCommand = args;
      const result = await runCommand(exe, args, {...options, interactive: false, timeout: 60000});
      calls.push({args, code: result.code, native_mutation: options.interactive === true});
      if (result.code === 0 && args.join(' ') === 'plugin marketplace list --json') {
        const raw = JSON.parse(result.stdout);
        const rows = Array.isArray(raw) ? raw : raw.marketplaces;
        nativeMetadata.marketplace = publicPaths(rows.filter(x => x.name === 'cloudbos-public')
          .map(x => Object.fromEntries(['name', 'marketplaceSource', 'source', 'path', 'root', 'installLocation']
            .filter(k => k in x).map(k => [k, x[k]]))));
      }
      return result;
    };
    const projectRoot = path.join(work, 'Projects', 'Nested group', host + ' App');
    await fs.mkdir(projectRoot, {recursive: true});
    const controls = {'AGENTS.md': 'Preserve my project instructions.\r\n', 'CLAUDE.md': '@AGENTS.md\r\nPreserve this import.\r\n'};
    for (const [name, text] of Object.entries(controls)) await fs.writeFile(path.join(projectRoot, name), text);
    const confirm = async action => {decisions.push(action.kind); return ['INSTALL_RELEASE', 'CREATE_EXACT_FOLDER', 'ADD_PUBLIC_MCP'].includes(action.kind);};
    const options = {host, executable, release, projectRoot, localPackage: pkg.root, runner, confirm, startLogin: false};
    const first = await setupHost(options);
    if (first.status !== 'NATIVE_PROJECT_HANDOFF_REQUIRED') throw new Error('FIRST_INSTALL_NOT_AT_HANDOFF');
    const writesAfterFirst = calls.filter(x => x.native_mutation).length;
    const rerun = await setupHost({...options, mode: 'add-project', startLogin: true});
    if (rerun.status !== 'NATIVE_PROJECT_HANDOFF_REQUIRED' || calls.filter(x => x.native_mutation).length !== writesAfterFirst) throw new Error('RERUN_CHANGED_NATIVE_CONFIG');
    const secondRoot = path.join(work, 'Projects', 'Another nested group', host + ' Second App');
    const second = await setupHost({...options, projectRoot: secondRoot, mode: 'add-project', startLogin: true});
    if (second.status !== 'NATIVE_PROJECT_HANDOFF_REQUIRED' || (await fs.readdir(secondRoot)).length
      || calls.filter(x => x.native_mutation).length !== writesAfterFirst) throw new Error('SECOND_FOLDER_NOT_PRESERVED');
    for (const [name, text] of Object.entries(controls)) if ((await fs.readFile(path.join(projectRoot, name), 'utf8')) !== text) throw new Error('EXISTING_INSTRUCTION_CHANGED');
    const beforeCheck = calls.length;
    const checked = await setupHost({...options, mode: 'check', startLogin: true});
    if (checked.status !== 'PLUGIN_VERSION_OBSERVED_NATIVE_CONNECTION_CHECK_REQUIRED'
      || calls.slice(beforeCheck).some(x => x.native_mutation || x.args[0] === 'mcp')) throw new Error('READ_ONLY_CHECK_CHANGED_NATIVE_STATE');
    if (calls.some(x => x.args[0] === 'mcp' && x.args[1] === 'login')) throw new Error('UNEXPECTED_AUTHENTICATION');
    report.hosts.push({host, executable_kind: path.extname(executable), host_version: first.host_version,
      plugin_version: first.plugin_version, first: first.status, rerun: rerun.status, second: second.status,
      check: checked.status, existing_instructions: 'EXACT', second_folder_files: 0,
      native_writes_first: writesAfterFirst, native_writes_rerun_and_second: 0, login_calls: 0,
      native_loading: 'NOT_OBSERVED', project_binding: 'NOT_INSTALLED', decisions, calls});
  }
  if (selectedFolder('"' + work + '"') !== work || selectedFolder('~/App', work) !== path.join(work, 'App')) throw new Error('WINDOWS_FOLDER_SELECTION_FAILED');
  for (const arg of ['%PATH%', 'x&whoami', 'x|whoami', 'x!y']) {
    let rejected = false; try {invocation('codex.cmd', [arg], 'win32');} catch {rejected = true;}
    if (!rejected) throw new Error('BATCH_METACHARACTER_NOT_BLOCKED');
  }
  const shell = path.join(process.env.SystemRoot, 'System32', 'cmd.exe');
  const entry = path.join(setupRoot, 'Start Cloud BOS.cmd');
  const command = `""${entry}""`;
  const entryResult = await runShell(shell, ['/d', '/s', '/c', command]);
  if (entryResult.code === 0 || !entryResult.stderr.includes('INTERACTIVE_TERMINAL_REQUIRED')) throw new Error('CMD_ENTRYPOINT_NONINTERACTIVE_GUARD_NOT_OBSERVED');
  report.cmd_entrypoint = 'EXECUTED_EXPECTED_INTERACTIVE_TERMINAL_REQUIREMENT';
  const ps = await runShell('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', path.join(setupRoot, 'Start-CloudBOS.ps1'), '--help']);
  if (ps.code !== 0 || !ps.stdout.includes('Cloud BOS setup:')) throw new Error('POWERSHELL_ENTRYPOINT_HELP_FAILED');
  report.powershell_entrypoint = 'HELP_EXECUTED_WITH_DEFAULT_RUNNER_POLICY';
  report.status = 'PASS_BOUNDED_NATIVE_WINDOWS_INSTALL_REUSE_AND_ENTRYPOINT_CHECKS';
} catch (error) {
  report.status = 'FAILED'; report.failed_host = activeHost; report.failed_native_command = activeCommand;
  report.native_metadata = nativeMetadata;
  report.failure = /^[A-Z0-9_]+$/.test(error.code || error.message || '') ? error.code || error.message : 'QUALIFICATION_FAILED';
  process.exitCode = 1;
}
console.log('CLOUDBOS_WINDOWS_REPORT_BEGIN');console.log(JSON.stringify(report, null, 2));console.log('CLOUDBOS_WINDOWS_REPORT_END');
