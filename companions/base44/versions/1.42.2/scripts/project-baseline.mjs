import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const TEXT = /LDP:FULL|MASTER BOS INTERNALS|FULL DEVPACK|PRIVATE PROMPTS?|-----BEGIN|(?:token|secret|password)\s*[:=]/i;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
export const publicBaselineHash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const text = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 1000 && !TEXT.test(value) && !/[\u0000-\u001f]/.test(value);
const list = (value, allowEmpty = false) => Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 24 && value.every(text);

// This helper evaluates host readback. It does not authenticate callers, grant
// entitlement, intercept editor writes, execute scans or send source anywhere.
export function evaluatePublicProjectBaseline(input = {}) {
  const baseline = input.baseline;
  const gaps = [];
  const warnings = [];
  const result = {
    schema: "CLOUDBOS_PUBLIC_PROJECT_BASELINE_RESULT_V1",
    status: "BASELINE_EVIDENCE_REQUIRED",
    ready_for_governance_plan: false,
    enforcement: "ADVISORY_HOST_HELPER",
    server_or_host_write_interception_proven: false,
    mutation_authority: "NONE",
    current_baseline_sha256: null,
    material_gaps: gaps,
    warnings,
    feasibility: "UNKNOWN_TEST_REQUIRED",
    baseline_guidance_tier: "STANDARD_FREE",
    scan_executed: false,
    physical_device_behavior_verified: false,
    notice: { display: false, status: "NO_NOTICE", actions: [] },
  };
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    gaps.push("baseline_readback_missing");
    return result;
  }
  const allowed = new Set(["purpose", "users", "workflows", "acceptance_criteria", "maturity", "development_host", "execution", "exclusions", "active_intention"]);
  if (Object.keys(baseline).some((key) => !allowed.has(key))) gaps.push("baseline_field_not_allowlisted");
  for (const field of ["purpose", "maturity", "development_host", "active_intention"]) if (!text(baseline[field])) gaps.push(field);
  for (const field of ["users", "workflows", "acceptance_criteria"]) if (!list(baseline[field])) gaps.push(field);
  if (!list(baseline.exclusions, true)) gaps.push("exclusions");
  const execution = baseline.execution;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) gaps.push("execution");
  else {
    const executionKeys = new Set(["platform", "devices", "os_versions", "browser_versions", "offline", "background", "unresolved_constraints"]);
    if (Object.keys(execution).some((key) => !executionKeys.has(key))) gaps.push("execution_field_not_allowlisted");
    if (!text(execution.platform)) gaps.push("execution.platform");
    for (const field of ["devices", "os_versions", "browser_versions", "unresolved_constraints"]) {
      if (!list(execution[field], true)) gaps.push(`execution.${field}`);
      else if (field !== "unresolved_constraints" && execution[field].length === 0) warnings.push(`execution.${field}.test_required`);
    }
    for (const field of ["offline", "background"]) {
      if (!["REQUIRED", "NOT_REQUIRED", "UNKNOWN"].includes(execution[field])) gaps.push(`execution.${field}`);
      else if (execution[field] !== "NOT_REQUIRED") warnings.push(`execution.${field}.test_required`);
    }
    if (execution.unresolved_constraints?.length) warnings.push("execution.unresolved_constraints.test_required");
  }
  // Hash only the bounded public fields after validation; arbitrary payloads
  // never become accepted baseline evidence or appear in the result.
  if (gaps.length) return result;
  result.current_baseline_sha256 = publicBaselineHash(baseline);
  if (typeof input.project_ref !== "string" || !ID.test(input.project_ref) || input.approval_project_ref !== input.project_ref) gaps.push("exact_project_approval_required");
  if (typeof input.current_revision !== "string" || !ID.test(input.current_revision) || input.readback_revision !== input.current_revision) gaps.push("current_provider_readback_required");
  if (input.owner_accepted !== true) gaps.push("owner_baseline_acceptance_required");
  if (!HASH.test(input.accepted_baseline_sha256 ?? "")) gaps.push("accepted_baseline_hash_missing");
  else if (input.accepted_baseline_sha256 !== result.current_baseline_sha256) gaps.push("accepted_baseline_hash_drift");
  if (input.requested_intention !== undefined && input.requested_intention !== baseline.active_intention) gaps.push("active_intention_conflict");
  result.ready_for_governance_plan = gaps.length === 0;
  result.status = gaps.length ? "BASELINE_RECONCILIATION_REQUIRED" : "BASELINE_CURRENT_OWNER_ACCEPTED";
  result.feasibility = warnings.length ? "UNKNOWN_TEST_REQUIRED" : "TARGETS_RECORDED_BEHAVIOR_NOT_VERIFIED";
  if (warnings.length) {
    const key = publicBaselineHash({ project_ref: input.project_ref, baseline: result.current_baseline_sha256, warnings });
    const context = input.notice_context ?? {};
    const dismissed = Array.isArray(context.dismissed_keys) && context.dismissed_keys.includes(key);
    const cooling = context.last_notice_key === key && Number.isFinite(context.hours_since_notice) && context.hours_since_notice >= 0 && context.hours_since_notice < 24;
    result.notice = {
      key,
      display: !dismissed && !cooling,
      status: dismissed ? "SUPPRESSED_DISMISSED" : cooling ? "SUPPRESSED_COOLDOWN" : "FREE_FEASIBILITY_REVIEW_AVAILABLE",
      reason: "Recorded execution constraints need current target evidence or a bounded test; missing proof does not establish impossibility.",
      cost_class: "STANDARD_FREE_GUIDANCE_EXECUTION_SEPARATELY_SCOPED",
      actions: dismissed || cooling ? [] : ["Review bounded test", "Explain", "Later"],
      execution_authorized: false,
    };
  }
  return result;
}
