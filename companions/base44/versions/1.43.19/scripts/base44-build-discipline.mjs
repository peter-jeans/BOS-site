import { createHash } from 'node:crypto';

// Public host workflow, not a private reasoning engine or editor interceptor.
// The host owns provenance/authentication. Caller-supplied flags are not proof.
export const PUBLIC_BUILD_DISCIPLINE_V1 = `
## Proportionate build guidance — PUBLIC_BUILD_DISCIPLINE_V1

BOS helps the builder complete the user's authorized work. Ordinary capabilities provide guidance; applicable spines and named safety/authority rules constrain their defined operations. A hard stop must name the rule, the affected action and a supported resolution. Do not turn missing optional tooling, design paperwork, telemetry or independent verification into a blanket ban on building.

Use the selected route, current exact app binding and actual relevant guidance. Connection or catalogue availability is not capability use. Reuse current unchanged evidence and accepted scope; refresh affected context after app, intent, source or effect changes. Before edits read the relevant app-owned specification, intentions, exclusions and affected source/dependencies. Understand the operation and its consequences; a material contradiction or unknown effect stops that affected mutation, not unrelated safe work. Resolve readable gaps yourself.

For routine authorized work, state the intended change and relevant checks briefly, then implement using native tools. The current user request can supply authorization within existing constraints; do not ask again merely because a helper, GUI contract or prior chat receipt is missing. Preserve accepted UI intent; draft contracts and compare up to three alternatives when a material redesign or consequential ambiguity actually needs a decision. Use the smallest supported correction for routine issues. Do not manufacture three mitigations for every issue.

The checksum-verified build-discipline helper is an OPTIONAL diagnostic, not an execution prerequisite. If unavailable, continue authorized work using native source inspection and applicable rule checks; report HELPER_NOT_EXECUTABLE only as a diagnostic limitation. Never invent a helper PASS_CONGRUENT. If used, its evidence fields do not authenticate claims or create permission. A helper failure concerning a real rule still requires resolution of that rule; a missing optional packet does not create a new rule. No baseline gate requires a paid upgrade.

Execution continuity: On resume or a host/mode change, recheck only the affected app/source and tool capability. A remembered helper failure is not a current denial. Retry an optional diagnostic only when currently permitted; an explicit tool or approval denial remains binding until resolved and must never be evaded through another tool. Native authorized work does not depend on optional helper success. A hard stop identifies the actual governing source and rule, affected action, current evidence and smallest permitted recovery. Distinguish observed denial from inference or missing evidence. A host-invented rule name or diagnostic UNKNOWN is not a new authority. Verify a plausible safety or authority concern before the affected action; do not discard it merely because a rule citation is missing. Before an ordinary edit, understand a feasible verification plan; do not require post-build test results before building. Missing optional viewport or reduced-motion emulation is an explicit verification limitation, not an unknown effect or authority failure. Use supported checks, implement the bounded work and report unrun checks. Never bypass an applicable safety prerequisite or claim inaccessible tests passed. Carry a short task note in the existing authorized work context: accepted routes/pages, user-visible outcome, preserved behavior and next check. Reuse it across batches/resumes without a new mandatory file or approval. Check the actual route and observable result after editing. Do not silently narrow approved scope, substitute a different page, or elevate assistant-added pixel targets into owner requirements. For animation, observe motion over time; a screenshot or CSS declaration does not prove it runs. Report guidance delivered, work attempted, saved-source readback and observed behavior separately. Record only actual invocation/outcomes with native versus assisted attribution; a remembered or inferred failure is not an observed tool failure. Keep detailed evidence local and send only permitted status/hash fields. A recording acknowledgement proves receipt only. Finish with remaining work and up to three useful next actions.

Restore exact durable specification acceptance when available; compare its digest with current saved bytes. Receipt age or storage unavailability alone does not revoke unchanged acceptance. Keep baseline, specification and governance-plan digests distinct. Never fabricate owner acceptance, and never replace exact governance-install approval with ordinary feature authorization.

Trace the WHOLE operation before its first write, including indirect effects. SOURCE_ONLY never authorises runtime/data writes, fixtures, external effects or publication. A disposable app or synthetic records do not establish isolation. Backend/schema edits may auto-sync: classify and authorize their effects. Preserve authentication, entitlement, permission, destructive-action, secrets, publication and applicable anti-godcode boundaries. A denied operation MUST NOT be retried through another tool to bypass it. Reuse valid unchanged approval; changed scope or a separately required gate needs the corresponding decision.

After each coherent batch reopen saved artifacts and report what actually changed: exact paths/resources, revision or its availability, observed lines or precise symbols, a concise diff/description and actual test results. Use baseline locations for deletions and both paths for renames. Say LINES_UNAVAILABLE when necessary; do not guess or count files merely read as edited. Keep raw source and personal data out of Cloud BOS payloads.

Separate BUILDER_CLAIM, source readback, behavior tests and INDEPENDENT_VALIDATOR_SIGNAL. The builder's own receipt or hash is not independent proof. Use an authorized repo/export/endpoint/artifact reader when available. verifyBase44FinalChangeEvidence is optional and proves only its particular final-save claim. Missing independent access or observer means completion not independently verified; record COMPLETE_CLAIMED_NOT_SYNCED or PARTIAL_VERIFIED as warranted and continue other authorized work. Do not claim COMPLETE_VERIFIED, final-save verification, deployment or behavior without the corresponding evidence. Claimed edits absent from saved source are FAILED_SYNC_VERIFICATION and require repair.

Record actual capability outcomes through the selected route; missing acknowledgement stays NOT_RECORDED and is retried without stopping unrelated development. Keep guidance delivery, action authorization, verification and recording status separate. Give up to three useful next actions. Do not rewrite checksum-owned governance outside its update lifecycle. These instructions guide host behavior, not native editor interception; no universal enforcement is claimed.
`;

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const buildScopeHash = scope => hash(canonical(scope));
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const topics = ['purpose_workflow', 'implementation_dependencies', 'effects_environment', 'invariants_exclusions', 'verification_falsifier'];
const classes = new Set(['SOURCE_EDIT', 'RESOURCE_DEPLOY', 'RUNTIME_DATA_WRITE', 'EXTERNAL_EFFECT', 'PUBLISH']);
const baseResult = () => ({ schema: 'BOS_BASE44_BUILD_PREFLIGHT_RESULT_V1', status: 'CLARIFICATION_REQUIRED',
  ready_for_declared_gate: false, reasons: [], enforcement: 'HOST_WORKFLOW_ONLY',
  authenticates_evidence: false, intercepts_native_writes: false, grants_authority: false,
  diagnostic_only: true, execution_permission: 'NOT_EVALUATED',
  implementation_evidence_status: 'NOT_ATTESTED_BY_PREFLIGHT' });

// The host supplies issues from the original preflight, including on retries.
// References bind review evidence; this does not authenticate builder claims.
export function evaluateBuildMitigations({scope_sha256, current_context, mitigation, review, phase = 'PLAN'} = {}) {
  const fail = reason => ({ready:false, reason, grants_authority:false});
  const formal = current_context?.mitigation_review_required === true || review?.remediation_required === true || Boolean(mitigation);
  const ids = current_context?.preflight_issue_ids ?? (formal ? undefined : []);
  if (!Array.isArray(ids) || ids.length > 32 || !ids.every(token) || new Set(ids).size !== ids.length)
    return fail('PREFLIGHT_ISSUE_INVENTORY_REQUIRED');
  if (!ids.length && mitigation?.issues?.length) return fail('MITIGATION_ISSUE_COVERAGE_REQUIRED');
  if (!ids.length) return review?.remediation_required === true
    ? fail('REMEDIATION_ISSUE_MUST_BE_RETAINED') : {ready:true, status:'NO_PREFLIGHT_ISSUES', grants_authority:false};
  if (!formal) return {ready:true, status:'ADVISORY_ISSUES', issues:ids, grants_authority:false};
  if (!mitigation || mitigation.schema !== 'BOS_MITIGATION_REVIEW_V1'
      || mitigation.scope_sha256 !== scope_sha256 || !Array.isArray(mitigation.issues)
      || mitigation.issues.length !== ids.length) return fail('RANKED_MITIGATIONS_REQUIRED');
  const criteria = ['effectiveness_ref','long_term_fit_ref','feasibility_ref','reversibility_ref','burden_ref','evidence_ref'];
  let recordingPending = false;
  for (const id of ids) {
    const matches = mitigation.issues.filter(issue => issue?.issue_id === id);
    if (matches.length !== 1) return fail('MITIGATION_ISSUE_COVERAGE_REQUIRED');
    const issue = matches[0], options = issue.options;
    if (!token(issue.original_check_ref) || !token(issue.environment_readback_ref)
        || !token(issue.long_term_requirements_ref) || !token(issue.ranking_rationale_ref)
        || !Array.isArray(options) || options.length < 1 || options.length > 3)
      return fail('THREE_CREDIBLE_MITIGATIONS_OR_JUSTIFIED_SHORTLIST_REQUIRED');
    if (options.length < 3 && (!token(issue.alternatives_considered_ref) || !token(issue.shortlist_reason_ref)))
      return fail('SHORTLIST_JUSTIFICATION_REQUIRED');
    if (new Set(options.map(o => o?.option_id)).size !== options.length
        || new Set(options.map(o => o?.rank)).size !== options.length
        || options.some(o => !token(o?.option_id) || !Number.isInteger(o.rank) || o.rank < 1 || o.rank > options.length
          || criteria.some(k => !token(o[k])) || typeof o.permitted !== 'boolean'))
      return fail('MITIGATION_COMPARISON_AND_RANKING_REQUIRED');
    const best = [...options].filter(o => o.permitted).sort((a,b) => a.rank-b.rank)[0];
    if (!best) return fail('NO_PERMITTED_MITIGATION');
    if (issue.selected_option_id !== best.option_id) return fail('BEST_PERMITTED_MITIGATION_REQUIRED');
    if (best.owner_approval_required === true && !token(best.owner_approval_ref))
      return fail('MITIGATION_OWNER_APPROVAL_REQUIRED');
    const check = issue.recheck;
    if (!check || check.scope_sha256 !== scope_sha256 || check.selected_option_id !== best.option_id
        || check.original_check_ref !== issue.original_check_ref || check.result !== 'PASS'
        || !token(check.evidence_ref) || check.authorised !== true || check.resolves_original_issue !== true)
      return fail('ORIGINAL_CHECK_REASSESSMENT_REQUIRED');
    if (phase === 'CLOSEOUT' && (!token(issue.outcome_ref) || !['RECORDED','ALREADY_RECORDED'].includes(issue.recording_status)))
      recordingPending = true;
  }
  if (review?.mitigation_sha256 !== buildScopeHash(mitigation) || review.mitigation_findings !== 'SUPPORTED')
    return fail('SOURCE_GROUNDED_MITIGATION_REVIEW_REQUIRED');
  return {ready:true, status:'MITIGATIONS_RECHECKED', recording_status:recordingPending ? 'NOT_RECORDED' : phase === 'CLOSEOUT' ? 'RECORDED' : 'NOT_DUE', grants_authority:false};
}

// Evidence consistency gate shared by advice and prewrite workflows. This is
// deliberately not an authenticator: a host must verify the referenced results.
export function evaluateGuidanceActivation(input = {}) {
  const out = { schema: 'BOS_GUIDANCE_ACTIVATION_RESULT_V1', status: 'GUIDANCE_ACTIVATION_REQUIRED',
    ready_for_plan: false, grants_authority: false, authenticates_evidence: false,
    intercepts_native_writes: false, enforcement: 'HOST_WORKFLOW_ONLY', execution_permission:'NOT_EVALUATED', reasons: [], warnings: [] };
  // A consistency failure is not an authenticated policy denial. The host must
  // inspect the actual applicable rule; neither this helper nor its caller can
  // manufacture a new rule from an arbitrary rule_id or UNKNOWN finding.
  const fail = reason => ({ ...out, reasons: [reason], diagnostic_only: true,
    next_action: 'REVIEW_CURRENT_EVIDENCE_AND_APPLICABLE_RULE' });
  const { scope_sha256, activation, review, current_context } = input;
  if (!digest(scope_sha256) || !activation || activation.schema !== 'BOS_GUIDANCE_ACTIVATION_V1')
    return fail('GUIDANCE_ACTIVATION_EVIDENCE_MISSING');
  if (activation.scope_sha256 !== scope_sha256 || !token(activation.request_ref)
      || !token(activation.project_ref) || !['PUBLIC', 'PRIVATE', 'DIRECT', 'LOCAL'].includes(activation.route))
    return fail('GUIDANCE_SCOPE_OR_ROUTE_MISMATCH');
  if (!current_context || ['project_ref', 'request_ref', 'route'].some(k => current_context[k] !== activation[k]))
    return fail('CURRENT_PROJECT_REQUEST_ROUTE_REQUIRED');
  if (!token(activation.connection_ref) || !token(activation.discovery_ref)
      || !token(activation.current_readback_ref)) return fail('CONNECT_DISCOVERY_READBACK_REQUIRED');
  if (!Array.isArray(activation.required_capability_ids) || !activation.required_capability_ids.length
      || !activation.required_capability_ids.every(token)
      || new Set(activation.required_capability_ids).size !== activation.required_capability_ids.length)
    return fail('REQUIRED_CAPABILITY_SELECTION_MISSING');
  if (!Array.isArray(activation.guidance) || activation.guidance.length !== activation.required_capability_ids.length)
    return fail('GUIDANCE_RETRIEVAL_COVERAGE_MISSING');
  for (const id of activation.required_capability_ids) {
    const matches = activation.guidance.filter(x => x?.capability_id === id);
    if (matches.length !== 1) return fail('GUIDANCE_RETRIEVAL_COVERAGE_MISSING');
    const item = matches[0];
    if (item.decision !== 'AVAILABLE') return fail('REQUIRED_GUIDANCE_BLOCKED_OR_UNAVAILABLE');
    if (!token(item.result_ref) || !token(item.application_ref)) return fail('RETRIEVED_AND_APPLIED_GUIDANCE_REQUIRED');
  }
  if (!Array.isArray(activation.blocking_rules) || !activation.blocking_rules.length
      || activation.blocking_rules.some(x => !token(x?.rule_id) || !token(x?.evidence_ref)
        || !['SATISFIED', 'NOT_APPLICABLE'].includes(x?.decision)))
    return fail('BLOCKING_RULE_REVIEW_UNRESOLVED');
  if (!review || review.origin !== 'SOURCE_GROUNDED_REVIEW' || review.source_readback_verified !== true
      || review.scope_sha256 !== scope_sha256 || !token(review.evidence_ref)
      || review.guidance_sha256 !== buildScopeHash(activation) || review.guidance_findings !== 'SUPPORTED')
    return fail('GUIDANCE_APPLICABILITY_REVIEW_REQUIRED');
  const mitigation = evaluateBuildMitigations({scope_sha256, current_context, mitigation: activation.mitigation_review, review, phase: input.phase});
  if (!mitigation.ready) return fail(mitigation.reason);
  const gui = activation.gui_application;
  if (current_context.page_affecting === true && ['BLOCK','REWRITE'].includes(gui?.gate_verdict))
    return fail('APPLICABLE_GUI_RULE_UNRESOLVED');
  // A page edit alone does not make a new GUI contract or owner ceremony mandatory.
  if (current_context.page_affecting === true && current_context.gui_contract_required === true) {
    if (!gui || !token(gui.guidance_result_ref) || !token(gui.selected_template_id)
        || !token(gui.selection_evidence_ref) || !token(gui.local_contract_ref)
        || !token(gui.plan_application_ref) || !token(gui.platform_evidence_ref)
        || gui.gate_verdict !== 'RELEVANT') return fail('GUI_GUIDANCE_SELECTION_AND_LOCAL_CONTRACT_REQUIRED');
    if (current_context.existing_page === true) {
      const assessment = gui.existing_page_review;
      if (!assessment || !['inventory_ref', 'logic_ownership_ref', 'user_explanation_ref', 'decision_ref', 'rollback_ref'].every(k => token(assessment[k]))
          || !['RETAIN_AND_DOCUMENT', 'BOUNDED_REPAIR', 'OWNER_APPROVED_REDESIGN'].includes(assessment.disposition)) return fail('EXISTING_PAGE_REVIEW_AND_EXPLANATION_REQUIRED');
    }
    if (input.phase === 'CLOSEOUT' && (!token(gui.artifact_readback_ref)
        || !token(gui.behavior_verification_ref))) out.warnings.push('GUI_IMPLEMENTATION_READBACK_REQUIRED');
  }
  if (input.phase === 'CLOSEOUT' && activation.guidance.some(x => !token(x.outcome_ref)
      || !['RECORDED', 'ALREADY_RECORDED'].includes(x.recording_status)))
    out.warnings.push('GUIDANCE_OUTCOME_NOT_RECORDED');
  if (!['PLAN', 'CLOSEOUT'].includes(input.phase)) return fail('GUIDANCE_PHASE_REQUIRED');
  if (mitigation.recording_status === 'NOT_RECORDED') out.warnings.push('MITIGATION_OUTCOME_ACKNOWLEDGEMENT_REQUIRED');
  return { ...out, status: out.warnings.length ? 'GUIDANCE_APPLIED_WITH_GAPS' : 'GUIDANCE_APPLIED', ready_for_plan: true,
    recording_status: input.phase !== 'CLOSEOUT' ? 'NOT_DUE' : out.warnings.some(w => /OUTCOME/.test(w)) ? 'NOT_RECORDED' : 'RECORDED',
    implementation_evidence_status: 'NOT_ATTESTED_BY_ACTIVATION' };
}

// Facts/review MUST be populated from the host's independent reads and actual
// semantic review. This evaluator cannot authenticate an arbitrary JSON packet.
export function evaluateBase44BuildPreflight(input = {}) {
  const out = baseResult();
  const stop = (status, reason) => ({ ...out, status, reasons: [reason],
    next_action: 'REVIEW_CURRENT_EVIDENCE_AND_APPLICABLE_RULE' });
  const { scope, current, knowledge, review } = input;
  if (!scope || !current || !token(scope.app_id) || !token(scope.revision)
      || !token(scope.intention_ref) || !token(scope.operation_ref) || !token(scope.environment)
      || !digest(scope.evidence_sha256) || !['SOURCE_ONLY', 'BOUNDED_EFFECTS'].includes(scope.stage)
      || !Array.isArray(scope.effects) || !scope.effects.length || scope.effects.some(x => !classes.has(x))
      || new Set(scope.effects).size !== scope.effects.length) return stop('CLARIFICATION_REQUIRED', 'EXACT_OPERATION_AND_EVIDENCE_REQUIRED');
  out.scope_sha256 = buildScopeHash(scope);
  if (current.scope_sha256 !== out.scope_sha256 || current.app_id !== scope.app_id || current.revision !== scope.revision)
    return stop('STALE_REEVALUATION_REQUIRED', 'APP_REVISION_OR_EFFECT_SCOPE_CHANGED');
  if (scope.stage === 'SOURCE_ONLY' && scope.effects.some(x => x !== 'SOURCE_EDIT'))
    return stop('BLOCKED_INCONGRUENT', 'SOURCE_ONLY_EFFECT_VIOLATION');
  if (current.effects_resolved !== true || current.environment_verified !== true || current.authorised !== true)
    return stop('CLARIFICATION_REQUIRED', 'WHOLE_OPERATION_AUTHORITY_OR_ENVIRONMENT_UNVERIFIED');
  if (!knowledge || topics.some(t => !token(knowledge[t]?.answer_ref)
      || !Array.isArray(knowledge[t]?.evidence_refs) || !knowledge[t].evidence_refs.length
      || knowledge[t].evidence_refs.length > 16 || !knowledge[t].evidence_refs.every(token)))
    return stop('CLARIFICATION_REQUIRED', 'SOURCE_GROUNDED_KNOWLEDGE_REQUIRED');
  if (!review || !token(review.reviewer_ref) || !token(review.evidence_ref)
      || review.scope_sha256 !== out.scope_sha256 || review.knowledge_sha256 !== buildScopeHash(knowledge)
      || review.source_readback_verified !== true || review.origin !== 'SOURCE_GROUNDED_REVIEW')
    return stop('CLARIFICATION_REQUIRED', 'CURRENT_SOURCE_REVIEW_REQUIRED_NOT_SELF_ATTESTATION');
  // verification_falsifier reviews the proposed check, not its execution.
  // Post-build observations cannot be a prerequisite to the first edit.
  if (topics.some(t => review.findings?.[t] === 'CONTRADICTED'))
    return stop('BLOCKED_INCONGRUENT', 'REREAD_RELEVANT_LDP_AND_SOURCE_THEN_RETEST');
  if (topics.some(t => review.findings?.[t] !== 'SUPPORTED'))
    return stop('CLARIFICATION_REQUIRED', 'UNRESOLVED_KNOWLEDGE_GAP');
  if (review.remediation_required === true && (!token(review.retest_ref) || review.retest_result !== 'SUPPORTED'))
    return stop('CLARIFICATION_REQUIRED', 'FRESH_APPLICATION_RETEST_REQUIRED');
  const guidance = evaluateGuidanceActivation({ scope_sha256: out.scope_sha256, activation: input.guidance_activation, current_context: current.guidance_context, review, phase: 'PLAN' });
  if (!guidance.ready_for_plan) return stop('CLARIFICATION_REQUIRED', guidance.reasons[0]);
  return { ...out, status: 'PASS_CONGRUENT', ready_for_declared_gate: true, review_ref: review.evidence_ref,
    verification_status: 'PLAN_REVIEWED_EXECUTION_NOT_ATTESTED',
    next_action: 'IMPLEMENT_AUTHORIZED_SCOPE_THEN_VERIFY' };
}

const filePath = value => typeof value === 'string' && value.length < 512 && !value.startsWith('/')
  && !value.split('/').some(x => !x || x === '.' || x === '..') && /^[A-Za-z0-9_./ -]+$/.test(value);

// reader is an existing authorised host/provider adapter, not a builder-supplied
// transcript. It performs fresh reads. No network, writes or credentials here.
// This narrowly verifies source locations, NOT semantics, behaviour or live parity.
export async function verifyBase44ChangeEvidence({ app_id, revision, builder_ref, claims, reader } = {}) {
  const out = { schema: 'BOS_BASE44_CHANGE_READBACK_V1', acceptance_status: 'BLOCKED',
    source_verified: false, behaviour_verified: false, live_parity_verified: false,
    grants_authority: false, checks: [], reason: 'INDEPENDENT_READBACK_REQUIRED' };
  if (!token(app_id) || !token(revision) || !token(builder_ref) || !Array.isArray(claims)
      || !claims.length || claims.length > 128 || new Set(claims.map(c => c.path)).size !== claims.length)
    return { ...out, reason: 'EXACT_CHANGE_CLAIMS_REQUIRED' };
  if (!reader || typeof reader.readState !== 'function' || typeof reader.readFile !== 'function'
      || typeof reader.readBaselineFile !== 'function') return out;
  // Snapshot caller claims before asynchronous reads; do not echo excerpts.
  claims = structuredClone(claims);
  let start;
  try { start = await reader.readState(); } catch { return { ...out, reason: 'READBACK_UNAVAILABLE' }; }
  const bound = s => s?.app_id === app_id && s.revision === revision && s.clean === true;
  if (!bound(start) || !token(start.baseline_revision) || start.baseline_revision === revision) return { ...out, reason: 'APP_OR_REVISION_STALE' };
  const independent = start.independent === true && token(start.verifier_ref)
    && start.verifier_ref !== builder_ref && token(start.evidence_ref);
  for (const c of claims) {
    if (!filePath(c.path) || !['ADDED', 'MODIFIED', 'DELETED'].includes(c.kind)
        || !token(c.requirement_ref) || typeof c.symbol !== 'string' || !c.symbol.trim()
        || !digest(c.before_sha256) && c.before_sha256 !== null)
      return { ...out, reason: 'CHANGE_LOCATION_REQUIRED' };
    let bytes, before;
    try {
      bytes = await reader.readFile(c.path);
      before = await reader.readBaselineFile(c.path, start.baseline_revision);
    } catch { return { ...out, reason: 'READBACK_UNAVAILABLE' }; }
    if ([bytes, before].some(b => b !== null && (!(b instanceof Uint8Array) || b.byteLength > 1024 * 1024))) return { ...out, reason: 'RAW_SAVED_BYTES_REQUIRED' };
    bytes = bytes === null ? null : Buffer.from(bytes);
    before = before === null ? null : Buffer.from(before);
    const actual = bytes === null ? null : hash(bytes);
    let match = (before === null ? null : hash(before)) === c.before_sha256 && (c.kind === 'DELETED' ? bytes === null && digest(c.before_sha256)
      : bytes !== null && digest(c.after_sha256) && actual === c.after_sha256
        && (c.kind === 'ADDED' ? c.before_sha256 === null : digest(c.before_sha256) && c.before_sha256 !== actual));
    if (c.kind !== 'DELETED') {
      const content = bytes === null ? '' : new TextDecoder().decode(bytes);
      const lines = content.split('\n');
      match = match && Number.isInteger(c.start_line) && Number.isInteger(c.end_line)
        && c.start_line >= 1 && c.end_line >= c.start_line && c.end_line <= lines.length
        && typeof c.excerpt === 'string' && c.excerpt.trim().length > 0
        && lines.slice(c.start_line - 1, c.end_line).join('\n') === c.excerpt;
    }
    out.checks.push({ path: c.path, actual_sha256: actual, status: match ? 'MATCH' : 'MISMATCH' });
  }
  let end;
  try { end = await reader.readState(); } catch { return { ...out, reason: 'READBACK_UNAVAILABLE' }; }
  if (!bound(end) || canonical(start) !== canonical(end)) return { ...out, reason: 'APP_OR_REVISION_STALE' };
  if (!independent) return { ...out, reason: 'BUILDER_REPORTED_NOT_INDEPENDENTLY_VERIFIED' };
  if (out.checks.some(c => c.status !== 'MATCH')) return { ...out, acceptance_status: 'FAILED_SYNC_VERIFICATION', reason: 'CLAIMED_EDIT_OR_LINES_ABSENT' };
  // Complete change-set coverage, semantics and behaviour need separate checks.
  return { ...out, acceptance_status: 'PARTIAL_VERIFIED', source_verified: true,
    evidence_ref: start.evidence_ref, reason: 'CLAIMED_SAVED_LOCATIONS_VERIFIED_ONLY' };
}

// Completion must come from the authorised host/provider observer AFTER the
// builder's write turn and final save have finished. Repeated equal git hashes,
// a quiet timer, or the builder saying "done" are not a completion event.
// Like the reader above, this adapter is trusted host input, not authentication
// supplied by this library. Unknown provider completion remains pending.
export async function verifyBase44FinalChangeEvidence(input = {}) {
  const pending = reason => ({ schema: 'BOS_BASE44_FINAL_CHANGE_READBACK_V1',
    acceptance_status: Array.isArray(input.claims) && input.claims.length ? 'COMPLETE_CLAIMED_NOT_SYNCED' : 'BLOCKED', source_verified: false, behaviour_verified: false,
    live_parity_verified: false, final_save_verified: false, grants_authority: false, execution_permission:'NOT_EVALUATED', blocks_future_work:false, reason });
  const { reader, app_id, revision, builder_ref } = input;
  if (typeof reader?.readCompletion !== 'function') return pending('FINAL_SAVE_OBSERVER_REQUIRED');
  const valid = c => c?.app_id === app_id && c.revision === revision
    && c.status === 'COMPLETE' && c.pending_writes === false
    && c.origin === 'PROVIDER_FINAL_SAVE' && c.independent === true
    && token(c.verifier_ref) && c.verifier_ref !== builder_ref
    && token(c.completion_ref) && token(c.operation_ref);
  let first;
  try { first = structuredClone(await reader.readCompletion()); }
  catch { return pending('FINAL_SAVE_READBACK_UNAVAILABLE'); }
  if (!valid(first)) return pending('FINAL_SAVE_PENDING_OR_REVISION_CHANGED');
  // Snapshot claims once; never silently rewrite them to a newer revision/hash.
  const frozenInput = { ...input, claims: structuredClone(input.claims) };
  const one = await verifyBase44ChangeEvidence(frozenInput);
  if (!one.source_verified) return { ...one, final_save_verified: false };
  let second;
  try { second = await reader.readCompletion(); }
  catch { return pending('FINAL_SAVE_READBACK_UNAVAILABLE'); }
  if (!valid(second) || canonical(first) !== canonical(second)) return pending('FINAL_SAVE_CHANGED_DURING_READBACK');
  const two = await verifyBase44ChangeEvidence(frozenInput);
  if (!two.source_verified) return { ...two, final_save_verified: false };
  let last;
  try { last = await reader.readCompletion(); }
  catch { return pending('FINAL_SAVE_READBACK_UNAVAILABLE'); }
  if (!valid(last) || canonical(first) !== canonical(last)) return pending('FINAL_SAVE_CHANGED_DURING_READBACK');
  return { ...two, final_save_verified: true, completion_ref: first.completion_ref,
    operation_ref: first.operation_ref, reason: 'FINAL_SAVED_LOCATIONS_VERIFIED_ONLY' };
}
