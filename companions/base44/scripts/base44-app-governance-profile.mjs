import { createHash } from "node:crypto";
import profileContract from "../contracts/base44-app-governance-profiles.json" with { type: "json" };

const PROFILE_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_APP_GOVERNANCE_PLAN_V1";
const READBACK_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_APP_GOVERNANCE_READBACK_V1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const SAFE_STAGE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SECURITY_TRIGGERS = new Set(["AUTHENTICATION", "CUSTOMER_DATA", "MULTI_TENANCY", "PAYMENTS", "EXTERNAL_INTEGRATIONS"]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function exactJson(value) {
  return `${canonical(value)}\n`;
}

function safeText(value, field, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) fail("BASE44_PROFILE_INPUT_INVALID", field);
  if (/LDP:FULL|MASTER BOS INTERNALS|FULL DEVPACK|PRIVATE PROMPTS?|-----BEGIN|(?:token|secret|password)\s*[:=]/i.test(value)) fail("BASE44_PROFILE_FORBIDDEN_CONTENT", field);
  return value.trim();
}

function safeList(value, field, maxItems = 32) {
  if (!Array.isArray(value) || value.length > maxItems) fail("BASE44_PROFILE_INPUT_INVALID", field);
  return value.map((item, index) => safeText(item, `${field}[${index}]`, 500));
}

function targetSafe(target) {
  if (typeof target !== "string" || target.startsWith("/") || target.includes("..") || target.startsWith(".bos/") || !/^(?:documents|governance)\/[A-Za-z0-9._/-]+$/.test(target)) fail("BASE44_PROFILE_TARGET_NOT_ALLOWLISTED", target);
  return target;
}

function contentSafe(content, target) {
  if (typeof content !== "string" || Buffer.byteLength(content) > 128 * 1024) fail("BASE44_PROFILE_CONTENT_INVALID", target);
  safeText(content, target, 128 * 1024);
}

function artifact(path, role, content, prior = null, operation = "CREATE") {
  targetSafe(path);
  if (content !== null) contentSafe(content, path);
  if (prior !== null && !HASH.test(prior)) fail("BASE44_PROFILE_PRIOR_HASH_INVALID", path);
  return {
    artifact_id: path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase(),
    target: path,
    role,
    operation,
    media_type: path.endsWith(".md") ? "text/markdown" : path.endsWith(".jsonl") ? "application/x-ndjson" : "application/json",
    proposed_content: content,
    proposed_sha256: content === null ? null : sha256(content),
    proposed_bytes: content === null ? 0 : Buffer.byteLength(content),
    expected_prior_sha256: prior,
  };
}

function planHash(plan) {
  const copy = structuredClone(plan);
  delete copy.plan_hash;
  return sha256(copy);
}

export function loadBase44AppGovernanceProfiles() {
  return structuredClone(profileContract);
}

function selectedArtifacts(profileId, securityTriggers) {
  const contract = loadBase44AppGovernanceProfiles();
  const profile = contract.profiles[profileId];
  if (!profile || !profile.governed_active_allowed) fail("BASE44_PROFILE_NOT_GOVERNABLE", profileId);
  const base = profile.extends ? [...contract.profiles[profile.extends].artifacts, ...profile.additional_artifacts] : [...profile.artifacts];
  const triggers = [...new Set(securityTriggers)];
  if (triggers.some((item) => !SECURITY_TRIGGERS.has(item))) fail("BASE44_PROFILE_SECURITY_TRIGGER_INVALID");
  if (triggers.length) base.push({ path: contract.conditional_artifact.path, role: "SECURITY_BASELINE" });
  return { contract, profile, definitions: base, triggers };
}

function buildContents(input, profileId, profileVersion, definitions, triggers) {
  const title = safeText(input.project_spec?.title, "project_spec.title", 120);
  const purpose = safeText(input.project_spec?.purpose, "project_spec.purpose", 1000);
  const inScope = safeList(input.project_spec?.in_scope ?? [], "project_spec.in_scope");
  const outOfScope = safeList(input.project_spec?.out_of_scope ?? [], "project_spec.out_of_scope");
  const current = safeList(input.build_intentions?.current ?? [], "build_intentions.current");
  const excluded = safeList(input.build_intentions?.excluded ?? [], "build_intentions.excluded");
  const activeIntentionId = input.build_intentions?.active_id ?? null;
  if (activeIntentionId !== null && (typeof activeIntentionId !== "string" || !ID.test(activeIntentionId))) fail("BASE44_PROFILE_INPUT_INVALID", "build_intentions.active_id");
  const stage = safeText(input.maturation_stage ?? "DISCOVERY", "maturation_stage", 64);
  if (!SAFE_STAGE.test(stage)) fail("BASE44_PROFILE_INPUT_INVALID", "maturation_stage");
  const capabilities = input.capability_currentness ?? {};
  if (!capabilities || Array.isArray(capabilities) || typeof capabilities !== "object" || Object.keys(capabilities).length > 32) fail("BASE44_PROFILE_INPUT_INVALID", "capability_currentness");
  for (const [key, value] of Object.entries(capabilities)) {
    if (!ID.test(key) || !["AVAILABLE", "NOT_ENTITLED", "STALE", "UNAVAILABLE", "UNKNOWN"].includes(value)) fail("BASE44_PROFILE_INPUT_INVALID", `capability_currentness.${key}`);
  }
  const common = { project_id: input.project_id, project_ref: input.project_ref, project_binding_id: input.project_binding_id, platform_installation_id: input.platform_installation_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision, resource_uri: input.resource_uri, profile: profileId, profile_version: profileVersion };
  const contents = new Map();
  contents.set("documents/AICONTROL.md", `# AICONTROL — Cloud BOS governed app\n\nProfile: ${profileId}\nProject: ${input.project_ref}\n\n## Activation and scope\n\nBefore any substantive app analysis, advice, scan, specification, prompt generation, plan, build, addition, change, fix, improvement, generation, refactor, configuration, code/UI/feature work, data/entity/schema/storage work, auth/RBAC/permission work, backend/integration work, billing/payment/entitlement work, test, verification, onboarding, update, upgrade, publication, launch, deployment or governance action:\n\n1. Verify this file and governance/GOVERNANCE_MANIFEST.json are readable, current and bound to this exact app.\n2. Read the Project Spec, Project State, active Build Intentions, Capability Manifest, applicable Build Gates and only the latest bounded Evidence Ledger references.\n3. Reconcile the current owner request against that evidence before planning or mutation.\n\nThe phrase \`governed work\` never narrows this scope. If authority is missing, empty, stale, ambiguous, conflicting or unbound, stop with OWNER_AICONTROL_REQUIRED. Do not infer authority from chat memory, summaries, the native AI Controls pointer, MCP availability or workspace-skill availability.\n\n## Execution boundaries\n\nUse Cloud BOS only through the account MCP connection. Require one exact app-bound approved plan and exact provider readback for every governance mutation. Do not create parallel authority or fall back to generic behaviour; if a rule is missing, do less, not more. This file grants no application runtime, deployment, payment, entitlement or cross-project authority.\n`);
  contents.set("documents/PROJECT_SPEC.md", `# Project Spec\n\nTitle: ${title}\n\nPurpose: ${purpose}\n\n## In scope\n${inScope.map((item) => `- ${item}`).join("\n") || "- None recorded"}\n\n## Out of scope\n${outOfScope.map((item) => `- ${item}`).join("\n") || "- None recorded"}\n`);
  contents.set("governance/PROJECT_STATE.json", exactJson({ schema: "BOS_CLOUDBOS_PUBLIC_BASE44_PROJECT_STATE_V1", ...common, environment: "BASE44_GOVERNED_APP", authority: input.authority, maturation_stage: stage, active_build_intention_id: activeIntentionId, state: "GOVERNED_ACTIVE", runtime_dependency: false }));
  contents.set("governance/BUILD_INTENTIONS.md", `# Build Intentions\n\nActive intention: ${activeIntentionId ?? "None recorded"}\n\n## Current\n${current.map((item) => `- ${item}`).join("\n") || "- None recorded"}\n\n## Excluded\n${excluded.map((item) => `- ${item}`).join("\n") || "- None recorded"}\n`);
  contents.set("governance/CAPABILITY_MANIFEST.json", exactJson({ schema: "BOS_CLOUDBOS_PUBLIC_BASE44_CAPABILITY_MANIFEST_V1", profile: profileId, governance_kernel: profileId === "LEAN_CORE_WITH_BUILD_GATES" ? "BASE44_LEAN_DETERMINISTIC_GOVERNOR" : "DURABLE_MEMORY_ONLY", entitlement_authority: "CLOUD_BOS_D1_SERVER_RESOLVED", local_manifest_grants_entitlement: false, connection_plug: { action_id: "install_cloud_bos_connection_plug_indicator", status: "PENDING_SEPARATE_APP_SURFACE_ACTION" }, capabilities }));
  contents.set("governance/BUILD_GATES.json", exactJson({ schema: "BOS_CLOUDBOS_PUBLIC_BASE44_BUILD_GATES_V1", governor_kernel: "BASE44_LEAN_DETERMINISTIC_GOVERNOR", kernel_version: "1.0.0", deterministic: true, alignment: "REQUIRED", early_warning: "REQUIRED", build_verification: "REQUIRED", last_result: "PENDING_FIRST_GOVERNED_BUILD" }));
  contents.set("governance/EVIDENCE_LEDGER.jsonl", `${canonical({ schema: "BOS_CLOUDBOS_PUBLIC_BASE44_EVIDENCE_EVENT_V1", event: "GOVERNANCE_PROFILE_ACTIVATION_PLANNED", project_binding_id: input.project_binding_id, profile: profileId })}\n`);
  contents.set("governance/SECURITY_BASELINE.md", `# Security Baseline\n\nApplicable triggers: ${triggers.join(", ")}\n\nAuthentication, authorization, tenant isolation, sensitive data, payment and integration changes require explicit review and exact readback. No credentials or customer data belong in this file.\n`);
  return contents;
}

export function createBase44AppGovernanceProfilePlan(input = {}) {
  for (const [field, value] of Object.entries({ platform_installation_id: input.platform_installation_id, project_id: input.project_id, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision })) if (!ID.test(value ?? "")) fail("BASE44_PROFILE_IDENTITY_INVALID", field);
  if (input.environment !== "BASE44_GOVERNED_APP" || input.adapter_id !== "base44_app_governance") fail("BASE44_PROFILE_CANONICAL_IDENTITY_REQUIRED");
  if (input.authority?.source !== "BASE44_APP_OWNER" || input.authority?.deployment !== "OWNER_CONTROLLED") fail("BASE44_PROFILE_AUTHORITY_INVALID");
  if (typeof input.resource_uri !== "string" || !input.resource_uri.startsWith("cloudbos://projects/")) fail("BASE44_PROFILE_RESOURCE_URI_INVALID");
  const operation = input.requested_operation ?? "ACTIVATE";
  if (!["ACTIVATE", "REMOVE"].includes(operation)) fail("BASE44_PROFILE_OPERATION_UNSUPPORTED");
  const contract = loadBase44AppGovernanceProfiles();
  const profileId = input.profile_id ?? contract.default_onboarding_profile ?? "LEAN_CORE_WITH_BUILD_GATES";
  const { definitions, triggers } = selectedArtifacts(profileId, input.security_triggers ?? []);
  const now = new Date(input.created_at);
  const expires = new Date(input.expires_at);
  if (!Number.isFinite(now.valueOf()) || !Number.isFinite(expires.valueOf()) || expires <= now) fail("BASE44_PROFILE_PLAN_WINDOW_INVALID");
  let artifacts;
  if (operation === "ACTIVATE") {
    const contents = buildContents(input, profileId, contract.version, definitions, triggers);
    const nonManifest = definitions.filter(({ path }) => path !== "governance/GOVERNANCE_MANIFEST.json").map(({ path, role }) => artifact(path, role, contents.get(path), input.expected_prior_sha256?.[path] ?? null));
    const manifest = { schema: "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1", version: contract.version, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision, profile: profileId, governor_kernel: profileId === "LEAN_CORE_WITH_BUILD_GATES" ? "BASE44_LEAN_DETERMINISTIC_GOVERNOR" : "DURABLE_MEMORY_ONLY", ai_controls_pointer: { included_in_projection: false, status: "PENDING_SEPARATE_ASSIST_ACTION", next_action: "alter_base44_ai_controls_pointer_via_assist" }, connection_plug: { included_in_projection: false, next_action: "install_cloud_bos_connection_plug_indicator" }, environment: input.environment, adapter_id: input.adapter_id, artifacts: nonManifest.map(({ artifact_id, target, role, proposed_sha256: hash, proposed_bytes: bytes }) => ({ artifact_id, target, role, sha256: hash, bytes, removable: true })), lifecycle: { update: "NEW_EXACT_APPROVED_PLAN", rollback: "RETAINED_VERIFIED_PROFILE", removal: "MANIFEST_OWNED_EXACT_PLAN", drift: "EXACT_HASH_READBACK_FAIL_CLOSED", paid_upgrade: "SERVER_ENTITLEMENT_ELIGIBILITY_THEN_SEPARATE_EXACT_APPROVED_PLAN" } };
    artifacts = [...nonManifest, artifact("governance/GOVERNANCE_MANIFEST.json", "GOVERNANCE_MANIFEST", exactJson(manifest), input.expected_prior_sha256?.["governance/GOVERNANCE_MANIFEST.json"] ?? null)];
  } else {
    const manifest = input.installed_manifest;
    if (manifest?.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1" || manifest.project_ref !== input.project_ref || manifest.project_binding_id !== input.project_binding_id || manifest.profile !== profileId || !Array.isArray(manifest.artifacts)) fail("BASE44_PROFILE_INSTALLED_MANIFEST_INVALID");
    const owned = [...manifest.artifacts, { artifact_id: "governance_governance_manifest_json", target: "governance/GOVERNANCE_MANIFEST.json", role: "GOVERNANCE_MANIFEST" }];
    artifacts = owned.map(({ artifact_id, target, role }) => ({ ...artifact(target, role, null, input.expected_prior_sha256?.[target], "DELETE"), artifact_id }));
  }
  const plan = { schema: PROFILE_SCHEMA, plan_id: `b44p_${sha256(`${input.project_binding_id}:${now.toISOString()}:${operation}`).slice(0, 24)}`, plan_hash: null, platform_installation_id: input.platform_installation_id, project_id: input.project_id, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision, resource_uri: input.resource_uri, environment: input.environment, adapter_id: input.adapter_id, profile_id: profileId, requested_operation: operation, created_at: now.toISOString(), expires_at: expires.toISOString(), zero_write: true, requires_approval: true, runtime_dependency: false, artifacts, artifact_manifest_hash: sha256(artifacts.map(({ target, role, proposed_sha256, expected_prior_sha256 }) => ({ target, role, proposed_sha256, expected_prior_sha256 }))), permissions: artifacts.map(({ target, operation: action }) => ({ action, target })), forbidden_content_check: "PASS" };
  plan.plan_hash = planHash(plan);
  return plan;
}

export function validateBase44AppGovernanceProfilePlan(plan) {
  if (plan?.schema !== PROFILE_SCHEMA || plan.plan_hash !== planHash(plan) || plan.environment !== "BASE44_GOVERNED_APP" || plan.adapter_id !== "base44_app_governance" || !Array.isArray(plan.artifacts) || plan.artifacts.length < 7) fail("BASE44_PROFILE_PLAN_INVALID");
  for (const item of plan.artifacts) {
    targetSafe(item.target);
    if (item.proposed_content !== null && (sha256(item.proposed_content) !== item.proposed_sha256 || Buffer.byteLength(item.proposed_content) !== item.proposed_bytes)) fail("BASE44_PROFILE_PLAN_TAMPERED");
    if (item.expected_prior_sha256 !== null && !HASH.test(item.expected_prior_sha256)) fail("BASE44_PROFILE_PLAN_INVALID");
  }
  return plan;
}

const validatePlan = validateBase44AppGovernanceProfilePlan;

function validateApproval(plan, approval, now) {
  validatePlan(plan);
  if (approval?.approved !== true || approval.plan_hash !== plan.plan_hash || approval.project_binding_id !== plan.project_binding_id || new Date(now) > new Date(plan.expires_at)) fail("BASE44_PROFILE_APPROVAL_INVALID");
}

export async function verifyBase44AppGovernanceProfile({ plan, store, verified_at = new Date().toISOString() }) {
  validatePlan(plan);
  const checks = [];
  for (const item of plan.artifacts) {
    const content = await store.read(item.target);
    const actual = content === null ? null : sha256(content);
    checks.push({ target: item.target, expected_sha256: item.proposed_sha256, actual_sha256: actual, status: actual === item.proposed_sha256 ? "MATCH" : content === null ? "MISSING" : "DRIFTED" });
  }
  const complete = ["ACTIVATE", "ROLLBACK"].includes(plan.requested_operation) && checks.every(({ status }) => status === "MATCH");
  return { schema: READBACK_SCHEMA, plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id, profile_id: plan.profile_id, verified_at: new Date(verified_at).toISOString(), artifact_count: checks.length, checks, governance_state: complete ? "GOVERNED_ACTIVE" : "STALE_OR_DRIFTED", runtime_dependency: false, acceptance_status: complete ? "COMPLETE_VERIFIED" : "FAILED_SYNC_VERIFICATION" };
}

export async function activateBase44AppGovernanceProfile({ plan, approval, store, now = new Date().toISOString() }) {
  validateApproval(plan, approval, now);
  if (!["ACTIVATE", "ROLLBACK"].includes(plan.requested_operation)) fail("BASE44_PROFILE_OPERATION_INVALID");
  if (plan.resume_mode) {
    if (plan.resume_mode.type !== "BIND_EXISTING_EXACT_ARTIFACTS" || plan.resume_mode.app_writes !== false
      || plan.artifacts.some((item) => item.operation !== "READ" || item.expected_prior_sha256 !== item.proposed_sha256)) fail("BASE44_PROFILE_RESUME_INVALID");
    if (typeof store.getRevision !== "function" || await store.getRevision() !== plan.expected_app_revision) fail("BASE44_PROFILE_PREWRITE_DRIFT");
    const result = await verifyBase44AppGovernanceProfile({ plan, store, verified_at: now });
    if (result.acceptance_status !== "COMPLETE_VERIFIED") fail("BASE44_PROFILE_PREWRITE_DRIFT");
    return result;
  }
  await requireLifecycleRevision(plan, store);
  const priorValues = [];
  for (const item of plan.artifacts) {
    const prior = await store.read(item.target);
    priorValues.push([item.target, prior]);
    const priorHash = prior === null ? null : sha256(prior);
    if (priorHash !== item.expected_prior_sha256) fail("BASE44_PROFILE_PREWRITE_DRIFT");
  }
  try {
    for (const item of plan.artifacts) await store.write(item.target, item.proposed_content);
    if (typeof store.commit === "function") await store.commit({ plan });
  } catch (error) {
    if (typeof store.rollback === "function") await store.rollback({ plan });
    else for (const [target, prior] of priorValues.reverse()) prior === null ? await store.delete(target) : await store.write(target, prior);
    fail("BASE44_PROFILE_WRITE_FAILED_ROLLED_BACK", error.message);
  }
  return verifyBase44AppGovernanceProfile({ plan, store, verified_at: now });
}

export async function removeBase44AppGovernanceProfile({ plan, approval, store, now = new Date().toISOString() }) {
  validateApproval(plan, approval, now);
  if (plan.requested_operation !== "REMOVE") fail("BASE44_PROFILE_OPERATION_INVALID");
  await requireLifecycleRevision(plan, store);
  const priorValues = [];
  for (const item of plan.artifacts) {
    const prior = await store.read(item.target);
    priorValues.push([item.target, prior]);
    if (prior === null || sha256(prior) !== item.expected_prior_sha256) fail("BASE44_PROFILE_PREWRITE_DRIFT");
  }
  try {
    for (const item of plan.artifacts) await store.delete(item.target);
    if (typeof store.commit === "function") await store.commit({ plan });
  } catch (error) {
    if (typeof store.rollback === "function") await store.rollback({ plan });
    else for (const [target, prior] of priorValues.reverse()) await store.write(target, prior);
    fail("BASE44_PROFILE_REMOVE_FAILED_ROLLED_BACK", error.message);
  }
  for (const item of plan.artifacts) if ((await store.read(item.target)) !== null) fail("BASE44_PROFILE_REMOVAL_READBACK_FAILED");
  return { schema: "BOS_CLOUDBOS_PUBLIC_BASE44_APP_GOVERNANCE_REMOVAL_V1", plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id, profile_id: plan.profile_id, removed_targets: plan.artifacts.map(({ target }) => target), binding_status: "DETACHED", post_removal_state: "DETACHED_OR_REMOVED", application_preservation_check: "PASS", runtime_dependency: false, acceptance_status: "COMPLETE_VERIFIED" };
}

async function requireLifecycleRevision(plan, store) {
  if (!plan.readback_evidence_requirement) return;
  if (typeof store.getRevision !== "function" || await store.getRevision() !== plan.expected_app_revision) fail("BASE44_PROFILE_PREWRITE_REVISION_MISMATCH");
}

async function lifecycleEvidence(plan, store, sourceBefore, sourceAfter) {
  if (!HASH.test(sourceBefore ?? "") || sourceBefore !== sourceAfter) fail("BASE44_PROFILE_APPLICATION_SOURCE_CHANGED");
  if (typeof store.getApplicationSourceDigest !== "function" || await store.getApplicationSourceDigest() !== sourceAfter) fail("BASE44_PROFILE_CURRENT_APPLICATION_DIGEST_REQUIRED");
  const observed = typeof store.readbackEvidence === "function" ? await store.readbackEvidence({ plan }) : null;
  if (observed?.evidence_class !== "BASE44_AICONTROL_API_READBACK" || observed.independent !== true || observed.app_id !== plan.app_id || typeof observed.verifier !== "string" || !ID.test(observed.verifier) || typeof observed.version_ref !== "string" || !ID.test(observed.version_ref) || typeof observed.evidence_ref !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/.test(observed.evidence_ref) || observed.evidence_ref.includes("..")) fail("BASE44_PROFILE_INDEPENDENT_PROVIDER_READBACK_REQUIRED");
  if (typeof store.getRevision !== "function" || await store.getRevision() !== observed.version_ref) fail("BASE44_PROFILE_READBACK_REVISION_CHANGED");
  return { evidence_class: observed.evidence_class, verifier: observed.verifier, evidence_ref: observed.evidence_ref, version_ref: observed.version_ref, independent: true };
}

// Convert host-side exact provider readback to the existing five-tool lifecycle
// envelope. Only metadata and hashes leave the host, never project source.
export async function verifyBase44AppGovernanceLifecycle({ plan, store, application_source_before_sha256, application_source_after_sha256, verified_at = new Date().toISOString() }) {
  validatePlan(plan);
  if (!["ACTIVATE", "ROLLBACK"].includes(plan.requested_operation) || !HASH.test(plan.installed_manifest_sha256 ?? "")) fail("BASE44_PROFILE_LIFECYCLE_PLAN_REQUIRED");
  const beforeRevision = typeof store.getRevision === "function" ? await store.getRevision() : null;
  const local = await verifyBase44AppGovernanceProfile({ plan, store, verified_at });
  const evidence = await lifecycleEvidence(plan, store, application_source_before_sha256, application_source_after_sha256);
  if (evidence.version_ref !== beforeRevision) fail("BASE44_PROFILE_READBACK_REVISION_CHANGED");
  const state = plan.artifacts.find(({ target }) => target === "governance/PROJECT_STATE.json");
  const complete = local.acceptance_status === "COMPLETE_VERIFIED";
  const result = {
    schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_READBACK_V1", readback_id: `b44r_${sha256(`${plan.plan_hash}:${verified_at}`).slice(0, 24)}`,
    approved_plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id,
    adapter_id: plan.adapter_id, verified_at: new Date(verified_at).toISOString(), projection_hash: state.proposed_sha256,
    artifact_manifest_hash: plan.artifact_manifest_hash, installed_manifest_sha256: plan.installed_manifest_sha256,
    artifact_count: plan.artifacts.length, evidence, manifest_checks: local.checks,
    binding_check: complete ? "VERIFIED" : "MISMATCH", forbidden_content_check: "PASS", application_preservation_check: "PASS",
    governance_state: complete ? "GOVERNED_ACTIVE" : "STALE_OR_DRIFTED", acceptance_status: complete ? "COMPLETE_VERIFIED" : "FAILED_SYNC_VERIFICATION",
  };
  result.readback_hash = sha256(result);
  return result;
}

export async function verifyBase44AppGovernanceLifecycleRemoval({ plan, store, application_source_before_sha256, application_source_after_sha256 }) {
  validatePlan(plan);
  if (plan.requested_operation !== "REMOVE") fail("BASE44_PROFILE_OPERATION_INVALID");
  const beforeRevision = typeof store.getRevision === "function" ? await store.getRevision() : null;
  for (const item of plan.artifacts) if (await store.read(item.target) !== null) fail("BASE44_PROFILE_REMOVAL_READBACK_FAILED");
  const evidence = await lifecycleEvidence(plan, store, application_source_before_sha256, application_source_after_sha256);
  if (evidence.version_ref !== beforeRevision) fail("BASE44_PROFILE_READBACK_REVISION_CHANGED");
  return { schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_REMOVAL_V1", removal_id: `b44rm_${plan.plan_hash.slice(0, 24)}`, approved_plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id, adapter_id: plan.adapter_id, manifest_owned_targets: plan.artifacts.map(({ target }) => target), removed_targets: plan.artifacts.map(({ target }) => target), preserved_application_targets: [], binding_status: "DETACHED", post_removal_state: "DETACHED_OR_REMOVED", application_preservation_check: "PASS", acceptance_status: "COMPLETE_VERIFIED" };
}
