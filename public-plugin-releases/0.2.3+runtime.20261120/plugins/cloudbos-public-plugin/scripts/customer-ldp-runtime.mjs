// Customer-distributable local project runtime. Uses local project files only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CUSTOMER_LDP_PROFILE = 'CLOUDBOS_CUSTOMER_LDP_V1';
export const CUSTOMER_LDP_VERSION = '1.0.0';
export const JOURNAL_TARGET = '.bos/DEVPACK/DECISIONS.jsonl';
export const RUNTIME_TARGET = '.bos/OPERATOR/customer-runtime.mjs';
export const LOCAL_TARGETS = Object.freeze([
  'bos', 'bos.cmd', RUNTIME_TARGET, '.bos/LDP_MANIFEST.json', '.bos/LDP_INTEGRITY.json',
  '.bos/SESSION_ONBOARDING.md', '.bos/DEVPACK/PROJECT.json',
  '.bos/DEVPACK/DECISIONS.jsonl', '.bos/BUILDPACK/BUILD_PROGRAM.json',
  '.bos/RECEIPTS/INSTALLATION.json',
]);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), {code}); };
const json = value => JSON.stringify(value, null, 2) + '\n';

export async function readLocalFile(root, target, limit = 262144) {
  if (!LOCAL_TARGETS.includes(target) && ![
    '.cloudbos/project-memory.json', '.cloudbos/governance/binding.json',
  ].includes(target)) fail('LDP_TARGET_NOT_ALLOWLISTED');
  let current = root;
  for (const [index, part] of target.split('/').entries()) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) return null;
    if (stat.isSymbolicLink()) fail('LDP_SYMLINK_DENIED');
    if (index < target.split('/').length - 1 && !stat.isDirectory()) fail('LDP_PARENT_INVALID');
    if (index === target.split('/').length - 1 && (!stat.isFile() || stat.size > limit)) fail('LDP_FILE_INVALID');
  }
  return fs.readFile(current, 'utf8');
}

export async function verifyCustomerLdp(root, {project_ref, runtime_sha256} = {}) {
  const stat = await fs.lstat(path.join(root, '.bos')).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return {status: 'NOT_INSTALLED', profile: null};
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('LDP_SYMLINK_OR_DIRECTORY_INVALID');
  const raw = await readLocalFile(root, '.bos/LDP_MANIFEST.json');
  if (!raw) fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  const manifest = JSON.parse(raw);
  if (manifest.distribution_profile !== CUSTOMER_LDP_PROFILE) fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  const canonicalRoot = await fs.realpath(root);
  if (canonicalRoot !== path.resolve(root) || manifest.selected_root !== canonicalRoot
      || (project_ref && manifest.project_ref !== project_ref)) fail('LDP_PROJECT_ROOT_MISMATCH');
  const binding = JSON.parse(await readLocalFile(root, '.cloudbos/governance/binding.json'));
  if (!binding || binding.project_ref !== manifest.project_ref
      || binding.project_binding_id !== manifest.project_binding_id) fail('LDP_CLOUD_BINDING_MISMATCH');
  const integrity = JSON.parse(await readLocalFile(root, '.bos/LDP_INTEGRITY.json'));
  if (integrity?.schema !== 'CLOUDBOS_CUSTOMER_LDP_INTEGRITY_V1'
      || integrity.project_ref !== manifest.project_ref
      || !Array.isArray(integrity.files) || integrity.files.length !== 8
      || new Set(integrity.files.map(item => item.target)).size !== 8) fail('LDP_INTEGRITY_INVALID');
  const expected = LOCAL_TARGETS.filter(target => ![
    '.bos/LDP_INTEGRITY.json', '.bos/DEVPACK/DECISIONS.jsonl',
  ].includes(target));
  for (const target of expected) {
    const item = integrity.files.find(item => item.target === target);
    if (!item || !/^[a-f0-9]{64}$/.test(item.sha256)
        || digest(await readLocalFile(root, target) ?? '') !== item.sha256) fail('LDP_ARTIFACT_CHANGED');
  }
  if (runtime_sha256 && integrity.files.find(item => item.target === RUNTIME_TARGET)?.sha256 !== runtime_sha256)
    fail('LDP_RUNTIME_VERSION_REVIEW_REQUIRED');
  const memory = JSON.parse(await readLocalFile(root, '.bos/DEVPACK/PROJECT.json'));
  if (memory?.project_ref !== manifest.project_ref || memory.selected_root !== canonicalRoot
      || memory.accepted_baseline_sha256 !== manifest.accepted_baseline_sha256) fail('LDP_MEMORY_BINDING_MISMATCH');
  return {status: 'LOCAL_LDP_VERIFIED', profile: CUSTOMER_LDP_PROFILE,
    version: manifest.version, project_ref: manifest.project_ref, selected_root: canonicalRoot,
    mode: 'DEV', access: manifest.mode_access_binding.access_overlay_id,
    service_connection: 'LIVE_NATIVE_CALL_REQUIRED', native_instruction_loading: 'NOT_OBSERVED'};
}

// Authority classification is read-only and never executes a project's command.
export async function assertCustomerOrUninstalled(root, project_ref) {
  if (await fs.lstat(path.join(root, 'BOS_PRODUCT_AUTHORITY.json')).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  })) fail('EXISTING_LOCAL_OR_PRIVATE_ROUTE');
  const runtime = await fs.readFile(fileURLToPath(import.meta.url));
  return verifyCustomerLdp(root, {project_ref, runtime_sha256: digest(runtime)});
}

export async function customerLdpArtifacts({root, project_ref, binding, memory}) {
  const installed = await assertCustomerOrUninstalled(root, project_ref);
  const runtime = await fs.readFile(fileURLToPath(import.meta.url), 'utf8');
  const manifest = {
    schema: 'BOS_LOCAL_DEVELOPMENT_PACK_MANIFEST_V1', distribution_profile: CUSTOMER_LDP_PROFILE,
    version: CUSTOMER_LDP_VERSION, project_ref, project_binding_id: binding.project_binding_id,
    selected_root: root, accepted_baseline_sha256: memory.accepted_baseline_sha256,
    mode_access_binding: {mode_id: 'LDP_DEV_ONLY', access_overlay_id: 'CUSTOMER_OWNER'},
    components: ['LOCAL_STATUS', 'PROJECT_MEMORY', 'BUILD_PLAN', 'APPROVED_EVENT_JOURNAL', 'INTEGRITY_READBACK'],
    hosted_capabilities: 'Use the existing authenticated host connection and current server entitlement',
    native_instruction_loading: 'NOT_OBSERVED', grants_authority: false,
  };
  const contents = {
    bos: '#!/bin/sh\nset -eu\nroot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)\nexec node "$root/' + RUNTIME_TARGET + '" "$@"\n',
    'bos.cmd': '@echo off\r\nnode "%~dp0' + RUNTIME_TARGET.replaceAll('/', '\\') + '" %*\r\n',
    [RUNTIME_TARGET]: runtime,
    '.bos/LDP_MANIFEST.json': json(manifest),
    '.bos/SESSION_ONBOARDING.md': '# BOS project startup\n\nRun `./bos /activate` on Mac or `.\\bos.cmd /activate` on Windows from this exact app folder. Read the local project memory and build plan. Use the existing authenticated BOS connection to verify account access and current service binding. The local command verifies saved files. Fresh native instruction loading and live service verification are separate checks.\n',
    '.bos/DEVPACK/PROJECT.json': json({...memory, distribution_profile: CUSTOMER_LDP_PROFILE}),
    '.bos/DEVPACK/DECISIONS.jsonl': (memory.decisions ?? []).map(value => JSON.stringify(value) + '\n').join(''),
    '.bos/BUILDPACK/BUILD_PROGRAM.json': json({schema: 'CLOUDBOS_CUSTOMER_BUILD_PROGRAM_V1', project_ref,
      accepted_baseline_sha256: memory.accepted_baseline_sha256,
      active_intention: memory.baseline.active_intention, acceptance_criteria: memory.baseline.acceptance_criteria,
      status: 'OWNER_BUILD_PLAN_REQUIRED', approved_execution: false}),
    '.bos/RECEIPTS/INSTALLATION.json': json({schema: 'CLOUDBOS_CUSTOMER_LDP_INSTALLATION_V1', project_ref,
      project_binding_id: binding.project_binding_id, accepted_baseline_sha256: memory.accepted_baseline_sha256,
      version: CUSTOMER_LDP_VERSION, evidence: 'EXACT_FILESYSTEM_READBACK_REQUIRED',
      native_instruction_loading: 'NOT_OBSERVED', service_connection: 'LIVE_NATIVE_CALL_REQUIRED'}),
  };
  // A current installation is reused byte-for-byte, including owner journal entries.
  if (installed.status === 'LOCAL_LDP_VERIFIED') {
    return Promise.all(LOCAL_TARGETS.map(async target => ({target, content: await readLocalFile(root, target)})));
  }
  // Existing commands have an independent purpose and require reconciliation.
  if (await readLocalFile(root, 'bos') !== null || await readLocalFile(root, 'bos.cmd') !== null)
    fail('EXISTING_PROJECT_COMMAND_REVIEW_REQUIRED');
  contents['.bos/LDP_INTEGRITY.json'] = json({schema: 'CLOUDBOS_CUSTOMER_LDP_INTEGRITY_V1', project_ref,
    files: Object.entries(contents).filter(([target]) => target !== '.bos/DEVPACK/DECISIONS.jsonl')
      .map(([target, content]) => ({target, sha256: digest(content)}))});
  return LOCAL_TARGETS.map(target => ({target, content: contents[target]}));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const [command = 'status', ...args] = process.argv.slice(2);
  const status = await verifyCustomerLdp(root);
  if (status.status !== 'LOCAL_LDP_VERIFIED') fail('LOCAL_LDP_REQUIRED');
  if (['status', 'verify', '/activate', '/rebind'].includes(command)) return status;
  if (command === 'project-memory') {
    return {project: JSON.parse(await readLocalFile(root, '.bos/DEVPACK/PROJECT.json')),
      decisions: (await readLocalFile(root, '.bos/DEVPACK/DECISIONS.jsonl') ?? '').split('\n').filter(Boolean).map(JSON.parse)};
  }
  if (command === 'build' && args[0] === 'status') return JSON.parse(await readLocalFile(root, '.bos/BUILDPACK/BUILD_PROGRAM.json'));
  if (command === 'plan') {
    if (!['decision', 'intention', 'verification'].includes(args[0]) || !args.slice(1).join(' ').trim()) fail('EVENT_KIND_AND_TEXT_REQUIRED');
    const ledger = await readLocalFile(root, '.bos/DEVPACK/DECISIONS.jsonl') ?? '';
    const plan = {schema: 'CLOUDBOS_LOCAL_EVENT_PLAN_V1', project_ref: status.project_ref, selected_root: root,
      prior_sha256: digest(ledger), kind: args[0], text: args.slice(1).join(' ')};
    return {...plan, plan_hash: digest(JSON.stringify(plan)), zero_write: true};
  }
  if (command === 'apply') {
    if (args.length !== 3 || args[1] !== '--approve' || !/^[a-f0-9]{64}$/.test(args[2])) fail('EXACT_EVENT_PLAN_APPROVAL_REQUIRED');
    const input = await fs.readFile(path.resolve(args[0]), 'utf8');
    if (Buffer.byteLength(input) > 65536) fail('EVENT_PLAN_TOO_LARGE');
    const {plan_hash, zero_write, ...plan} = JSON.parse(input);
    if (plan_hash !== args[2] || plan_hash !== digest(JSON.stringify(plan)) || plan.selected_root !== root
        || plan.project_ref !== status.project_ref || plan.schema !== 'CLOUDBOS_LOCAL_EVENT_PLAN_V1'
        || !['decision', 'intention', 'verification'].includes(plan.kind) || typeof plan.text !== 'string') fail('EVENT_PLAN_MISMATCH');
    const lock = path.join(root, '.bos', 'event.lock');
    await fs.mkdir(lock).catch(() => fail('LOCAL_EVENT_BUSY_RETRY'));
    try {
      const prior = await readLocalFile(root, '.bos/DEVPACK/DECISIONS.jsonl') ?? '';
      const lines = prior.split('\n').filter(Boolean).map(JSON.parse);
      if (lines.some(item => item.plan_hash === plan_hash)) return {status: 'EVENT_ALREADY_RECORDED', plan_hash};
      if (digest(prior) !== plan.prior_sha256) fail('EVENT_LEDGER_CHANGED_REPLAN_REQUIRED');
      const event = {kind: plan.kind, text: plan.text, plan_hash, recorded_at: new Date().toISOString()};
      await fs.appendFile(path.join(root, '.bos/DEVPACK/DECISIONS.jsonl'), JSON.stringify(event) + '\n', {mode: 0o600});
      return {status: 'LOCAL_EVENT_RECORDED', plan_hash, event};
    } finally { await fs.rmdir(lock); }
  }
  fail('Use status, verify, /activate, /rebind, project-memory, build status, plan or apply');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(json(result))).catch(error => {
    console.error(json({status: 'BLOCKED',reason: error.code ?? 'LOCAL_READBACK_FAILED'}));
    process.exitCode = 1;
  });
}
