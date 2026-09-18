import { createHash } from 'node:crypto';

// Read-only host helper. It constructs an UPDATE request; it neither
// calls the service nor writes app files, records approval, or executes a plan.
const MANIFEST = 'governance/GOVERNANCE_MANIFEST.json';
const STATE = 'governance/PROJECT_STATE.json';
const ROLES = new Map([
  ['documents/AICONTROL.md', 'AICONTROL_ROUTER'],
  ['documents/PROJECT_SPEC.md', 'PROJECT_INTENT'],
  [STATE, 'PROJECT_STATE_AND_BINDING'],
  ['governance/BUILD_INTENTIONS.md', 'BOUNDED_BUILD_INTENT'],
  ['governance/CAPABILITY_MANIFEST.json', 'CAPABILITY_CURRENTNESS'],
  ['governance/EVIDENCE_LEDGER.jsonl', 'APPEND_ONLY_EVIDENCE'],
  ['governance/BUILD_GATES.json', 'ALIGNMENT_WARNING_VERIFICATION_GATES'],
  ['governance/SECURITY_BASELINE.md', 'SECURITY_BASELINE'],
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => /^[a-f0-9]{64}$/.test(value ?? '');
function fail(code, path, action) {
  const error = new Error(code);
  error.code = code;
  // Never echo file contents, arbitrary input values, or credentials.
  error.details = { field: path, recovery_action: action, writes_performed: false, grants_approval: false };
  throw error;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export async function prepareBase44UpdateRequest({ store, binding, baseline, transport = 'INSTALLED_PLAN_REFERENCE' }) {
  // binding is fresh authenticated evidence supplied by the host, not inferred
  // from the same local files being checked. Baseline acceptance is host evidence;
  // the service's normal authorization and exact-plan approval gates still apply.
  if (!binding || !hex(binding.manifest_sha256)
      || binding.project_ref !== `base44:${binding.app_id}`
      || !/^[a-f0-9]{40}$/.test(binding.expected_app_revision ?? '')) {
    fail('CURRENT_BINDING_REQUIRED', 'binding', 'REFRESH_EXACT_APP_CONNECTION_AND_PROVIDER_READBACK');
  }
  if (!baseline || baseline.project_ref !== binding.project_ref
      || baseline.accepted !== true || !hex(baseline.accepted_baseline_sha256)) {
    fail('ACCEPTED_BASELINE_REQUIRED', 'baseline', 'RESTORE_APP_BOUND_ACCEPTED_BASELINE');
  }
  const accepted = { project_spec: baseline.project_spec, build_intentions: baseline.build_intentions };
  // Preserve the exact accepted object; no AI rewriting or scope inference here.
  if (hash(JSON.stringify(accepted)) !== baseline.accepted_baseline_sha256) {
    fail('ACCEPTED_BASELINE_CHANGED', 'baseline.accepted_baseline_sha256', 'REVIEW_CHANGED_REQUIREMENTS');
  }
  if (!Array.isArray(accepted.project_spec?.in_scope) || !Array.isArray(accepted.project_spec?.out_of_scope)
      || !Array.isArray(accepted.build_intentions?.current) || !Array.isArray(accepted.build_intentions?.excluded)
      || typeof accepted.build_intentions?.active_id !== 'string') {
    fail('COMPLETE_BASELINE_REQUIRED', 'baseline', 'RESTORE_MISSING_ACCEPTED_REQUIREMENTS');
  }
  const before = await store.readProviderState();
  if (before.revision !== binding.expected_app_revision || before.clean !== true) {
    fail('PROVIDER_STATE_CHANGED', 'provider', 'REFRESH_REVISION_AND_RECONCILE_CURRENT_WORK');
  }
  const originals = new Map();
  async function read(path) {
    const bytes = await store.readBytes(path);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 131072) {
      fail('RAW_ARTIFACT_UNAVAILABLE', path, 'READ_BOUNDED_ORIGINAL_FILE_BYTES');
    }
    const copy = Buffer.from(bytes);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(copy); }
    catch { fail('ARTIFACT_ENCODING_INVALID', path, 'INSPECT_SOURCE_WITHOUT_REWRITING'); }
    if (!copy.equals(Buffer.from(text))) fail('ARTIFACT_ENCODING_INVALID', path, 'INSPECT_SOURCE_WITHOUT_REWRITING');
    originals.set(path, copy);
    return text;
  }
  const raw = await read(MANIFEST);
  if (hash(originals.get(MANIFEST)) !== binding.manifest_sha256) {
    fail('BOUND_MANIFEST_DRIFT', MANIFEST, 'RECONCILE_WITH_AUTHENTICATED_BOUND_PLAN_NO_AUTO_OVERWRITE');
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch { fail('MANIFEST_INVALID', MANIFEST, 'RECOVER_ORIGINAL_BOUND_MANIFEST'); }
  if (manifest.schema !== 'BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1'
      || manifest.profile !== 'LEAN_CORE_WITH_BUILD_GATES'
      || manifest.environment !== 'BASE44_GOVERNED_APP' || manifest.adapter_id !== 'base44_app_governance'
      || manifest.app_id !== binding.app_id || manifest.project_ref !== binding.project_ref
      || manifest.project_binding_id !== binding.project_binding_id) {
    fail('APP_BINDING_MISMATCH', MANIFEST, 'REFRESH_EXACT_APP_BINDING_NO_REBIND_OR_RESEED');
  }
  if (!Array.isArray(manifest.artifacts) || ![7, 8].includes(manifest.artifacts.length)) {
    fail('MANIFEST_MEMBERSHIP_INVALID', MANIFEST, 'RECONCILE_BOUND_MANIFEST');
  }
  const seen = new Set();
  const installed = { [MANIFEST]: raw };
  for (const item of manifest.artifacts) {
    if (!ROLES.has(item?.target) || seen.has(item.target) || ROLES.get(item.target) !== item.role
        || item.removable !== true || !hex(item.sha256)) {
      fail('ARTIFACT_OWNERSHIP_INVALID', MANIFEST, 'RECONCILE_BOUND_MANIFEST_NO_PERMISSION_CHANGES');
    }
    seen.add(item.target);
    installed[item.target] = await read(item.target);
    if (hash(originals.get(item.target)) !== item.sha256 || originals.get(item.target).length !== item.bytes) {
      fail('INSTALLED_ARTIFACT_DRIFT', item.target, 'RECONCILE_SOURCE_AGAINST_BOUND_PLAN_NO_AUTO_OVERWRITE');
    }
  }
  for (const path of ROLES.keys()) {
    if (path !== 'governance/SECURITY_BASELINE.md' && !seen.has(path)) fail('MANIFEST_MEMBERSHIP_INVALID', MANIFEST, 'RECONCILE_BOUND_MANIFEST');
  }
  let state;
  try { state = JSON.parse(installed[STATE]); } catch { fail('STATE_INVALID', STATE, 'RECOVER_ORIGINAL_BOUND_STATE'); }
  for (const key of ['app_id', 'project_id', 'project_ref', 'project_binding_id', 'resource_uri', 'platform_installation_id']) {
    if (state[key] !== binding[key]) fail('APP_BINDING_MISMATCH', STATE, 'REFRESH_EXACT_APP_CONNECTION');
  }
  if (state.state !== 'GOVERNED_ACTIVE' || state.runtime_dependency !== false
      || state.expected_app_revision !== manifest.expected_app_revision
      || state.authority?.source !== 'BASE44_APP_OWNER' || state.authority?.deployment !== 'OWNER_CONTROLLED') {
    fail('STATE_AUTHORITY_MISMATCH', STATE, 'RECONCILE_CURRENT_AUTHORITY');
  }
  // Detect an in-flight edit, including uncommitted bytes at unchanged Git HEAD.
  for (const [path, bytes] of originals) {
    const again = await store.readBytes(path);
    if (!(again instanceof Uint8Array) || !bytes.equals(Buffer.from(again))) fail('READBACK_CHANGED', path, 'WAIT_FOR_WRITER_THEN_REFRESH_READBACK');
  }
  if (!same(before, await store.readProviderState())) fail('PROVIDER_STATE_CHANGED', 'provider', 'REFRESH_REVISION_AND_RECONCILE_CURRENT_WORK');
  if (!['INSTALLED_PLAN_REFERENCE', 'INLINE_VERIFIED_BYTES'].includes(transport)
    || (transport === 'INSTALLED_PLAN_REFERENCE' && !hex(binding.approved_plan_hash))) {
    fail('INSTALLED_PLAN_REFERENCE_REQUIRED', 'binding.approved_plan_hash', 'REFRESH_AUTHENTICATED_CURRENT_INSTALLED_PLAN_REFERENCE');
  }
  const priorInput = transport === 'INSTALLED_PLAN_REFERENCE'
    ? { installed_plan_ref: { plan_hash: binding.approved_plan_hash } }
    : { installed_artifacts: installed, installed_manifest_content: raw };
  return {
    requested_operation: 'UPDATE',
    project_id: binding.project_id, project_ref: binding.project_ref,
    project_binding_id: binding.project_binding_id, resource_uri: binding.resource_uri,
    authority: { source: 'BASE44_APP_OWNER', deployment: 'OWNER_CONTROLLED' },
    adapter_context: { app_id: binding.app_id, expected_app_revision: before.revision,
      project_visible_remote_evidence: true, remote_evidence_provider_id: 'base44' },
    discovery_input: { project_ref: binding.project_ref, host: 'base44_build_ai', local_repository_visible: false,
      github_remote_verified: false, base44_app_identity_verified: true, project_write_capability: true,
      project_visible_remote_evidence: false, source_authority: 'BASE44_APP_OWNER', deployment_authority: 'OWNER_CONTROLLED' },
    expected_prior_sha256: Object.fromEntries([...originals].map(([path, bytes]) => [path, hash(bytes)])),
    base44_profile: { profile_id: manifest.profile, ...priorInput,
      ...structuredClone(accepted), maturation_stage: state.maturation_stage },
    response_format: 'PLAN_DOWNLOAD_V1',
  };
}
