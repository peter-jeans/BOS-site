import { createHash } from 'node:crypto';

// Host helper. Preparation is read-only; submission can issue a proposal through
// an existing authenticated host bridge. Neither path approves or applies it.
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

export async function prepareBase44UpdateRequest({ store, binding, baseline, transport = 'INSTALLED_PLAN_REFERENCE', aicontrol_revision }) {
  if (aicontrol_revision !== undefined && !['PUBLIC_ROUTING_V1', 'PUBLIC_BUILD_DISCIPLINE_V1'].includes(aicontrol_revision)) fail('CONTROL_REVISION_UNSUPPORTED', 'aicontrol_revision', 'USE_ADVERTISED_VERSIONED_UPDATE');
  // Capture owner-accepted inputs before the first asynchronous provider read.
  // Caller edits during readback must not silently change the requested scope.
  binding = structuredClone(binding);
  baseline = structuredClone(baseline);
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
  // Baseline acceptance covers the original object, including its maturity
  // field. Only after verifying that hash, map this known field to the service
  // schema. Never rewrite the accepted object or silently discard other fields.
  const wireIntentions = structuredClone(accepted.build_intentions);
  const hasAcceptedStage = Object.hasOwn(wireIntentions, 'maturation_stage');
  const acceptedStage = wireIntentions.maturation_stage;
  if (hasAcceptedStage && (typeof acceptedStage !== 'string'
      || acceptedStage.length < 1 || acceptedStage.length > 64)) {
    fail('ACCEPTED_MATURATION_STAGE_INVALID', 'baseline.build_intentions.maturation_stage', 'REVIEW_INVALID_ACCEPTED_REQUIREMENTS');
  }
  delete wireIntentions.maturation_stage;
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
      ...(aicontrol_revision === undefined ? {} : { aicontrol_revision }),
      project_spec: structuredClone(accepted.project_spec), build_intentions: wireIntentions,
      maturation_stage: hasAcceptedStage ? acceptedStage : state.maturation_stage },
    response_format: 'PLAN_DOWNLOAD_V1',
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Native BuildAI does not currently provide a code-facing authenticated MCP
// callback. Its assistant obtains the upload-only ticket over MCP; native code
// sends this exact prepared object over HTTPS, then the assistant processes the
// opaque reference over MCP. No BOS account credential is needed in code.
export async function uploadBase44UpdateRequest({ ticket, serviceOrigin, fetchImpl = globalThis.fetch, ...input }) {
  ticket = structuredClone(ticket);
  let origin;
  try { origin = new URL(serviceOrigin); } catch { fail('UPLOAD_TICKET_INVALID', 'serviceOrigin', 'RESTORE_VERIFIED_SERVICE_ORIGIN'); }
  if (origin.protocol !== 'https:' || origin.origin !== serviceOrigin
      || ticket?.schema !== 'BASE44_UPDATE_UPLOAD_V1' || !hex(ticket.request_id)
      || ticket.project_ref !== input.binding?.project_ref || ticket.project_binding_id !== input.binding?.project_binding_id
      || ticket.url !== `${serviceOrigin}/mcp/request-upload` || ticket.method !== 'POST'
      || !/^BOS-Request [a-f0-9]{64}$/.test(ticket.headers?.Authorization ?? '')
      || ticket.headers?.['Content-Type'] !== 'application/json' || Object.keys(ticket.headers ?? {}).length !== 2
      || ticket.max_bytes !== 65536 || ticket.immutable_payload !== true
      || ticket.grants_approval !== false || ticket.grants_project_write !== false
      || !Number.isFinite(Date.parse(ticket.upload_expires_at)) || Date.parse(ticket.upload_expires_at) <= Date.now()
      || typeof fetchImpl !== 'function' || (input.transport && input.transport !== 'INSTALLED_PLAN_REFERENCE')) {
    fail('UPLOAD_TICKET_INVALID', 'ticket', 'REFRESH_EXACT_APP_UPLOAD_TICKET');
  }
  const request = await prepareBase44UpdateRequest({ ...input, transport: 'INSTALLED_PLAN_REFERENCE' });
  const body = JSON.stringify(request), request_sha256 = hash(body), request_bytes = Buffer.byteLength(body);
  if (request_bytes > ticket.max_bytes || Date.parse(ticket.upload_expires_at) <= Date.now()) {
    fail('UPLOAD_REQUEST_UNAVAILABLE', 'request', 'RECONCILE_SIZE_OR_REFRESH_EXPIRED_TICKET');
  }
  const scope = { project_ref: request.project_ref, project_binding_id: request.project_binding_id,
    uploaded_request: { request_id: ticket.request_id } };
  const uncertain = () => ({ status: 'UPLOAD_OUTCOME_UNKNOWN', ...scope,
    grants_approval: false, app_files_written: false, next_action: 'RECONCILE_SAME_REFERENCE_NO_NEW_TICKET_OR_HIDDEN_RETRY' });
  let response;
  try {
    response = await fetchImpl(ticket.url, { method: 'POST', headers: ticket.headers, body,
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (response.status !== 200 || response.redirected) return uncertain();
    // Bound untrusted responses too. The upload receipt is less than 2 KiB.
    const reader = response.body?.getReader();
    if (!reader) return uncertain();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return uncertain(); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const receipt = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (receipt.schema !== 'BASE44_UPDATE_UPLOADED_V1' || receipt.status !== 'UPLOADED'
      || receipt.request_id !== ticket.request_id || receipt.project_ref !== request.project_ref
      || receipt.project_binding_id !== request.project_binding_id || receipt.request_sha256 !== request_sha256
      || receipt.request_bytes !== request_bytes || receipt.grants_approval !== false || receipt.grants_project_write !== false) return uncertain();
    // Safe chat output: only the opaque reference, no bearer token or payload.
    return { status: 'UPLOAD_VERIFIED', ...scope, grants_approval: false, app_files_written: false,
      next_action: 'CALL_AUTHENTICATED_PLAN_TOOL_WITH_THIS_SCOPE_AND_UPLOADED_REQUEST_ONLY' };
  } catch { return uncertain(); }
}

// callTool is supplied by the host's supported authenticated MCP connection.
// A sandbox shell alone is not such a connection. Never extract credentials or
// replace this with an AI copying the prepared object into a separate tool call.
export async function submitBase44UpdateRequest({ callTool, ...input }) {
  if (typeof callTool !== 'function') {
    fail('HOST_CONNECTION_REQUIRED', 'callTool', 'USE_SUPPORTED_AUTHENTICATED_CODE_BRIDGE');
  }
  const request = freeze(await prepareBase44UpdateRequest(input));
  const request_sha256 = hash(JSON.stringify(request));
  const tool = 'bos_project_governance_plan';
  let response;
  try {
    response = await callTool(tool, request);
  } catch {
    // The service may have persisted a proposal before the connection failed.
    // No automatic retry, and no unsafe claim that nothing happened remotely.
    return { status: 'SUBMISSION_OUTCOME_UNKNOWN', request_sha256,
      grants_approval: false, app_files_written: false,
      next_action: 'RECOVER_EXISTING_APP_BOUND_PROPOSAL_BEFORE_RETRY' };
  }
  if (response?.isError === true) {
    let failure;
    try {
      if (response.content?.length === 1 && response.content[0].type === 'text') {
        failure = JSON.parse(response.content[0].text);
      }
    } catch { /* Unrecognised errors remain errors, never no-op success. */ }
    const unchanged = failure?.tool === tool
      && failure.error?.data?.status === 'BASE44_PROFILE_UPDATE_NOT_REQUIRED';
    return { status: unchanged ? 'UPDATE_NOT_REQUIRED' : 'SUBMISSION_REJECTED',
      request_sha256, response, grants_approval: false, app_files_written: false,
      next_action: unchanged ? 'CONTINUE_WITH_EXISTING_VERIFIED_SCOPE' : 'INSPECT_ERROR_AND_RECONCILE_NO_AUTOMATIC_RETRY' };
  }
  const output = response?.structuredContent;
  const delivery = output?.result;
  if (response?.isError !== false
      || output?.schema !== 'BOS_PUBLIC_PROJECT_GOVERNANCE_TOOL_RESULT_V1'
      || output?.tool !== tool || output?.status !== 'GOVERNANCE_PLAN_DOWNLOAD_READY'
      || output?.project_governance_state !== 'GOVERNANCE_PLAN_READY'
      || output?.project_mutation_performed !== false
      || delivery?.schema !== 'PLAN_DOWNLOAD_V1'
      || delivery.project_ref !== request.project_ref
      || delivery.project_binding_id !== request.project_binding_id
      || !hex(delivery.plan_hash) || !hex(delivery.json_sha256)
      || !Number.isSafeInteger(delivery.json_bytes) || delivery.json_bytes <= 0
      || delivery.grants_approval !== false || delivery.grants_project_write !== false) {
    return { status: 'SUBMISSION_OUTCOME_UNKNOWN', request_sha256,
      grants_approval: false, app_files_written: false,
      next_action: 'RECOVER_EXISTING_APP_BOUND_PROPOSAL_BEFORE_RETRY' };
  }
  // Keep the original response in code: it contains a short-lived download
  // credential. Do not log it. Download/verify/review and exact approval follow.
  return { status: 'PROPOSAL_DOWNLOAD_READY', request_sha256, response,
    grants_approval: false, app_files_written: false,
    next_action: 'DOWNLOAD_VERIFY_REVIEW_AND_OBTAIN_EXACT_PLAN_APPROVAL' };
}
