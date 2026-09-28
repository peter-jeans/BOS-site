import { createHash } from "node:crypto";
import { PUBLIC_BUILD_DISCIPLINE_V1 } from "./base44-build-discipline.mjs";
import { isDurablePlan, planIsCurrent, validPlanWindow } from "./approval-lifecycle.mjs";
import profileContract from "../contracts/base44-app-governance-profiles.json" with { type: "json" };

const PROFILE_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_APP_GOVERNANCE_PLAN_V1";
const READBACK_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_APP_GOVERNANCE_READBACK_V1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const SAFE_STAGE = /^[A-Z][A-Z0-9_]{1,63}$/;
const SECURITY_TRIGGERS = new Set(["AUTHENTICATION", "CUSTOMER_DATA", "MULTI_TENANCY", "PAYMENTS", "EXTERNAL_INTEGRATIONS"]);

// Public host instructions only. Keep this revision immutable so an approved
// stored plan reconstructs identically after later service releases.
export const PUBLIC_ROUTING_V1 = `
## Plain-language routing — PUBLIC_ROUTING_V1

Apply this route to ordinary requests, follow-ups and slash commands alike. The owner need not name BOS or a skill. At the start of each new or resumed app request, use the enabled cloudbos-governed-build workspace skill and call bos_connect with host base44_build_ai and this exact Project reference. Check platform connection and app governance separately, then call bos_capabilities for the same app. Restore the current app files and pending stage before continuing; a context reset never creates new approval.

Match the requested outcome to available public tool descriptions. For example, a request to check problems may call for a health snapshot or scan plan; checking requirements calls for a specification check; asking what to do next calls for maturity guidance. Check only relevant capability_ids before invoking the selected tool. Send compact, non-secret facts or controlled identifiers, never the full chat, private source, raw logs or credentials. Resolve entitlement and capability availability from authenticated Cloud BOS results. This file contains no private intent engine, scan library, specialist prompts or local entitlement grants. If the outcome is ambiguous, clarify the material choice before acting. A suggested scan is not an executed scan; report the tool actually used and its limitations.

## Visible guidance and decisions

After verified Cloud BOS consultation, begin EVERY substantive progress update and final response with BOS<authenticated-major.minor>> Base44> user>, replacing the version placeholder from the current bos_connect result. Include all three speakers; the app name belongs in the following header, not in place of user>. Before verified consultation use Base44> user> and say the connection is not yet verified. Never invent a BOS identity or imply that a speaker label proves governance.

After the speaker chain show App, Step and observed Status. End with the result, any gap and the next action. Before sending, check the speaker chain and decision state. At an owner decision, prominently say Your action required, name this exact app and scope, explain what the reply authorizes, give the exact reply and say Reply here in this Base44 chat; I am waiting. For a verified governance plan display the full hash and ask Approve plan <full-plan-hash>, or changes / Later. Replace every placeholder before displaying it. A review or recovery-copy permission is not installation approval. When independent review is still pending, say Review pending — no approval is requested yet, and do not silently interpret an unrelated approval as permission to install. Bind a clear existing approval to its exact reviewed proposal without making the owner repeat it. Silence, Continue, a tour choice and baseline acceptance never authorize installation.
`;

// Preserve the exact pre-loop installed control for bounded forward migration.
const PUBLIC_BUILD_DISCIPLINE_LEGACY = `
## Mandatory build checks — PUBLIC_BUILD_DISCIPLINE_V1

Before builder handoff, first material write and any transition to runtime/data tests, you MUST emit a Build Alignment Check for this exact app, current revision, accepted intention, proposed operation, effect set and actual environment. Read the app-owned Project Spec, Project State, active Build Intentions, exclusions and applicable gates, then the affected source and its dependencies. Never substitute compilation, a checksum, connection success or a post-edit check for pre-write alignment.

You MUST demonstrate knowledge of the relevant purpose/users/workflow, implementation/dependencies, direct and indirect effects, invariants/exclusions and falsifiable verification plan. Cite current exact source references. Check the explanation against freshly read evidence; a fluent answer or I understand is not proof. A material error or unknown effect stops that mutation. Reread the relevant local LDP or authorised app-owned governance projection and implementation, correct the answer and pass a fresh application question. Resolve read-only gaps without asking the owner again; after two unsuccessful retries report the unresolved gap. Never invent a missing LDP or treat the public projection as a private LDP restoration.

Use the checksum-verified base44-build-discipline helper and workspace reference build_checks workflow. It checks host evidence, not semantic truth by field presence. Keep the builder claim distinct from the source-grounded review. Only PASS_CONGRUENT permits this workflow's declared gate; missing, contradictory or stale evidence stops it. A host without the required evidence/review path reports the exact gap and continues read-only, never fabricates a pass. No baseline gate requires a paid upgrade.

Trace the WHOLE operation before its first write, including helper-triggered changes to existing records and permissions. SOURCE_ONLY never authorises runtime/data writes, fixtures, external side effects or publication. A disposable tenant, preview, branch, unpublished app or synthetic record does not establish isolation. Backend/schema edits may auto-sync: classify and authorise those effects explicitly. A changed operation, dependency, environment or revision requires reassessment; reuse unchanged valid evidence. A denied operation MUST NOT be retried through another tool to bypass it. Preserve existing approval only within its unchanged scope.

After each coherent batch, you MUST reopen the saved artifacts and report EVERY exact file path, added/modified/deleted status, final revision and observed line ranges, enclosing symbol, actual diff/excerpt, requirement addressed, and exact tests/results. Use baseline locations for deletions and both paths for renames. If a host does not expose lines, say LINES_UNAVAILABLE and give a precise symbol/resource locator; NEVER guess. Distinguish files edited from files merely read. Include entities, functions, routes and config, including non-file resources by exact ID/field path. Do not expose credentials or customer data.

Use fresh provider/export readback to compare claimed edits with saved bytes. BUILDER_CLAIM and INDEPENDENT_VALIDATOR_SIGNAL are separate: the same builder's report, generated receipt, hash or pasted transcript cannot independently verify its work. An external verifier must obtain its own current readback through an authorised route. Missing independent access means Builder reports these changes; completion not independently verified. Missing claimed saved edits means FAILED_SYNC_VERIFICATION. Source verification alone does not prove deployment or behaviour. Never emit COMPLETE_VERIFIED without the applicable independent source, behaviour and live-parity evidence.

Persist compact app-bound check/result references in the existing authorised evidence route; never rewrite checksum-owned governance files outside their update lifecycle. Keep raw source and detailed explanations in the authorised local app context, not Cloud BOS payloads. Emit check, evidence origin, observed result and remaining gap in chat. These host rules do not lock files or intercept native writes outside the workflow. No claims of universal enforcement.
`;

export const PUBLIC_GUIDANCE_ACTIVATION_V2 = "## REQUIRED BEFORE ANSWERING — PUBLIC_GUIDANCE_ACTIVATION_V2\n\nThese instructions apply to EVERY substantive app request, including read-only advice. The user does not need to mention BOS. You MUST complete the following sequence before giving recommendations, proposing implementation or editing:\n\n1. READ this app's current manifest, Project Spec, Project State, active Build Intentions and applicable gates. Identify the exact app and current request. Preserve accepted constraints.\n2. CONNECT with bos_connect for this exact app. A successful connection verifies the connection ONLY. If guidance_activation.activation_complete is false, activation is INCOMPLETE. Follow its next_tool; do not treat transport PASS or GOVERNED_ACTIVE as completed consultation.\n3. ACTIVATE cloudbos-governed-build and CALL bos_capabilities for this app and the relevant controlled intent categories. Read actual tool availability and entitlement results. Never assume a capability from its name or a previous conversation.\n4. RETRIEVE the available guidance selected for this request. A catalogue entry is not guidance; a scan plan is not an executed scan. If the response identifies deeper available guidance, retrieve it before proposing dependent work. If needed guidance is unavailable, name that specific gap and limit the proposal accordingly.\n5. APPLY the retrieved guidance to the current app evidence. State the recommendation it changes and review applicable blocking rules. Resolve readable gaps yourself. A failed applicable blocking rule stops dependent work.\n6. CHECK the PLAN evidence with the checksum-verified helper named by the authenticated host_workflow. evaluateGuidanceActivation is an exported JavaScript function in that helper, not an MCP tool name: use an available authorised script runner. If no runner is available, say HELPER_NOT_EXECUTABLE; never invent a pass. Source reading and diagnosis may continue, but do not claim the required gate passed.\n7. RECORD actually used capabilities and their actual outcomes through the selected route. Require acknowledgement; a planned call or unacknowledged report is not recorded. Run CLOSEOUT when the helper can execute.\n\nBefore final advice, emit a compact Activation Check: app/request; connection; discovery; retrieved guidance/result reference; concrete application; blocking-rule result; helper result; outcome acknowledgement; remaining gap. Each entry MUST describe observed evidence or say MISSING/UNAVAILABLE. Do not fill fields from intention or memory. Do not say Gap:none, governance complete or implementation ready when any required step is missing. Correct a skipped step before continuing; if impossible, report the exact incomplete step. Do not ask the user to repeat a BOS command.\n\nThis is a mandatory builder instruction, not a claim that the platform intercepts every native action. It adds no entitlement, mutation permission or authority. Existing exact-plan approval and artifact-readback rules continue to apply.\n";

// Immutable pre-1.42 policy, preserved from b702d794 for approved clone/update readback.
const PUBLIC_BUILD_DISCIPLINE_PRE_142 = `
## Mandatory build checks — PUBLIC_BUILD_DISCIPLINE_V1

For every relevant request, including read-only design advice, complete the selected-route connection -> capability discovery -> guidance retrieval -> applicability/blocking-rule review -> plan application loop. Connection success is not capability use. Use evaluateGuidanceActivation before a BOS-informed plan and its CLOSEOUT phase after recording actual outcomes. Missing or unavailable required guidance blocks dependent work; never invent a grant, source or acknowledgement. Preserve private/direct/local routes and use their existing equivalent mechanisms.

Before builder handoff, first material write and any transition to runtime/data tests, you MUST emit a Build Alignment Check for this exact app, current revision, accepted intention, proposed operation, effect set and actual environment. Read the app-owned Project Spec, Project State, active Build Intentions, exclusions and applicable gates, then the affected source and its dependencies. Never substitute compilation, a checksum, connection success or a post-edit check for pre-write alignment.

You MUST demonstrate knowledge of the relevant purpose/users/workflow, implementation/dependencies, direct and indirect effects, invariants/exclusions and falsifiable verification plan. Cite current exact source references. Check the explanation against freshly read evidence; a fluent answer or I understand is not proof. A material error or unknown effect stops that mutation. Reread the relevant local LDP or authorised app-owned governance projection and implementation, correct the answer and pass a fresh application question. Resolve read-only gaps without asking the owner again; after two unsuccessful retries report the unresolved gap. Never invent a missing LDP or treat the public projection as a private LDP restoration.

Use the checksum-verified base44-build-discipline helper and workspace reference build_checks workflow. It checks host evidence, not semantic truth by field presence. Keep the builder claim distinct from the source-grounded review. Only PASS_CONGRUENT permits this workflow's declared gate; missing, contradictory or stale evidence stops it. A host without the required evidence/review path reports the exact gap and continues read-only, never fabricates a pass. No baseline gate requires a paid upgrade.

Trace the WHOLE operation before its first write, including helper-triggered changes to existing records and permissions. SOURCE_ONLY never authorises runtime/data writes, fixtures, external side effects or publication. A disposable tenant, preview, branch, unpublished app or synthetic record does not establish isolation. Backend/schema edits may auto-sync: classify and authorise those effects explicitly. A changed operation, dependency, environment or revision requires reassessment; reuse unchanged valid evidence. A denied operation MUST NOT be retried through another tool to bypass it. Preserve existing approval only within its unchanged scope.

After each coherent batch, you MUST reopen the saved artifacts and report EVERY exact file path, added/modified/deleted status, final revision and observed line ranges, enclosing symbol, actual diff/excerpt, requirement addressed, and exact tests/results. Use baseline locations for deletions and both paths for renames. If a host does not expose lines, say LINES_UNAVAILABLE and give a precise symbol/resource locator; NEVER guess. Distinguish files edited from files merely read. Include entities, functions, routes and config, including non-file resources by exact ID/field path. Do not expose credentials or customer data.

Use fresh provider/export readback to compare claimed edits with saved bytes. BUILDER_CLAIM and INDEPENDENT_VALIDATOR_SIGNAL are separate: the same builder's report, generated receipt, hash or pasted transcript cannot independently verify its work. An external verifier must obtain its own current readback through an authorised route. Missing independent access means Builder reports these changes; completion not independently verified. Missing claimed saved edits means FAILED_SYNC_VERIFICATION. Source verification alone does not prove deployment or behaviour. Never emit COMPLETE_VERIFIED without the applicable independent source, behaviour and live-parity evidence.

Persist compact app-bound check/result references in the existing authorised evidence route; never rewrite checksum-owned governance files outside their update lifecycle. Keep raw source and detailed explanations in the authorised local app context, not Cloud BOS payloads. Emit check, evidence origin, observed result and remaining gap in chat. These host rules do not lock files or intercept native writes outside the workflow. No claims of universal enforcement.
`;

function controlVersions(control) {
  return [control, control + PUBLIC_BUILD_DISCIPLINE_LEGACY, control + PUBLIC_BUILD_DISCIPLINE_V1,
    (control + PUBLIC_BUILD_DISCIPLINE_V1).replace("## Activation and scope", PUBLIC_GUIDANCE_ACTIVATION_V2 + "\n## Activation and scope"),
    control + PUBLIC_BUILD_DISCIPLINE_PRE_142,
    (control + PUBLIC_BUILD_DISCIPLINE_PRE_142).replace("## Activation and scope", PUBLIC_GUIDANCE_ACTIVATION_V2 + "\n## Activation and scope")];
}

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
  contents.set("documents/AICONTROL.md", contents.get("documents/AICONTROL.md") + PUBLIC_ROUTING_V1);
  return contents;
}

// Some native MCP hosts omit generic object inputs from their tool interface.
// UPDATE already carries the exact manifest inside its typed raw-file map;
// deriving its parsed representation does not change the prior hash gate.
export function normalizeBase44UpdateInput(input) {
  const path = "governance/GOVERNANCE_MANIFEST.json";
  const raw = input.installed_artifacts?.[path];
  if (typeof raw !== "string") fail("BASE44_PROFILE_UPDATE_PRIOR_INVALID");
  contentSafe(raw, path);
  if (input.installed_manifest_content !== undefined && input.installed_manifest_content !== raw) fail("BASE44_PROFILE_INSTALLED_MANIFEST_HASH_MISMATCH");
  const manifest = JSON.parse(raw);
  if (input.installed_manifest !== undefined && canonical(input.installed_manifest) !== canonical(manifest)) fail("BASE44_PROFILE_INSTALLED_MANIFEST_HASH_MISMATCH");
  return { ...input, installed_manifest: manifest, installed_manifest_content: raw };
}

// Forward updates retain the complete prior governance projection. Only the
// reviewed specification, active intention and optional maturity may change.
// AI control changes only through the explicit, versioned public routing update;
// capability results, security rules and evidence history survive.
function forwardUpdate(input, profileId, profileVersion, legacyDiscipline = false) {
  const manifestPath = "governance/GOVERNANCE_MANIFEST.json";
  const statePath = "governance/PROJECT_STATE.json";
  const ledgerPath = "governance/EVIDENCE_LEDGER.jsonl";
  const prior = input.installed_artifacts;
  const manifest = input.installed_manifest;
  if (!prior || Array.isArray(prior) || typeof prior !== "object" || !manifest
      || prior[manifestPath] !== input.installed_manifest_content
      || manifest.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1"
      || manifest.app_id !== input.app_id || manifest.project_ref !== input.project_ref
      || manifest.project_binding_id !== input.project_binding_id || manifest.profile !== profileId
      || manifest.environment !== input.environment || manifest.adapter_id !== input.adapter_id
      || !Array.isArray(manifest.artifacts)) fail("BASE44_PROFILE_UPDATE_PRIOR_INVALID");
  contentSafe(prior[manifestPath], manifestPath);
  if (canonical(JSON.parse(prior[manifestPath])) !== canonical(manifest)) fail("BASE44_PROFILE_INSTALLED_MANIFEST_HASH_MISMATCH");
  const { definitions } = selectedArtifacts(profileId, manifest.artifacts.some(x => x.target === "governance/SECURITY_BASELINE.md") ? ["AUTHENTICATION"] : []);
  const expected = new Map(definitions.map(x => [x.path, x.role]));
  expected.set(manifestPath, "GOVERNANCE_MANIFEST");
  const owned = [...manifest.artifacts, { target: manifestPath, role: "GOVERNANCE_MANIFEST", sha256: sha256(prior[manifestPath]) }];
  if (owned.length !== expected.size || new Set(owned.map(x => x.target)).size !== expected.size
      || Object.keys(prior).length !== expected.size || Object.keys(prior).some(x => !expected.has(x))) fail("BASE44_PROFILE_UPDATE_EXACT_ARTIFACTS_REQUIRED");
  for (const item of owned) {
    if (expected.get(item.target) !== item.role || (item.target !== manifestPath && item.removable !== true)) fail("BASE44_PROFILE_UPDATE_OWNERSHIP_INVALID");
    contentSafe(prior[item.target], item.target);
    if (sha256(prior[item.target]) !== item.sha256 || item.sha256 !== input.expected_prior_sha256?.[item.target]
        || (item.target !== manifestPath && Buffer.byteLength(prior[item.target]) !== item.bytes)) fail("BASE44_PROFILE_UPDATE_PRIOR_HASH_MISMATCH");
  }
  const state = JSON.parse(prior[statePath]);
  for (const key of ["project_id", "project_ref", "project_binding_id", "platform_installation_id", "app_id", "resource_uri", "environment"]) {
    if (state[key] !== input[key]) fail("BASE44_PROFILE_UPDATE_IDENTITY_MISMATCH", key);
  }
  if (state.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_PROJECT_STATE_V1" || state.profile !== profileId
      || state.expected_app_revision !== manifest.expected_app_revision || canonical(state.authority) !== canonical(input.authority)
      || state.state !== "GOVERNED_ACTIVE" || state.runtime_dependency !== false) fail("BASE44_PROFILE_UPDATE_IDENTITY_MISMATCH");
  if (!Array.isArray(input.project_spec?.in_scope) || !Array.isArray(input.project_spec?.out_of_scope)
      || !ID.test(input.build_intentions?.active_id ?? "") || !Array.isArray(input.build_intentions?.current)
      || !Array.isArray(input.build_intentions?.excluded)) fail("BASE44_PROFILE_UPDATE_COMPLETE_BASELINE_REQUIRED");
  if ((input.security_triggers?.length ?? 0) > 0 || Object.keys(input.capability_currentness ?? {}).length > 0) fail("BASE44_PROFILE_UPDATE_SCOPE_UNSUPPORTED");
  const stage = input.maturation_stage ?? state.maturation_stage;
  const generated = buildContents({ ...input, maturation_stage: stage }, profileId, profileVersion, definitions, []);
  const next = { ...prior };
  if (input.aicontrol_revision !== undefined) {
    if (!["PUBLIC_ROUTING_V1", "PUBLIC_BUILD_DISCIPLINE_V1", "PUBLIC_GUIDANCE_ACTIVATION_V2"].includes(input.aicontrol_revision)) fail("BASE44_PROFILE_ROUTING_REVISION_UNSUPPORTED");
    const control = generated.get("documents/AICONTROL.md");
    const legacy = control.slice(0, -PUBLIC_ROUTING_V1.length);
    const versions = controlVersions(control);
    const priorIndex = versions.indexOf(prior["documents/AICONTROL.md"]);
    if (priorIndex < 0 && prior["documents/AICONTROL.md"] !== legacy) fail("BASE44_PROFILE_ROUTING_PRIOR_UNRECOGNIZED");
    const targetIndex = { PUBLIC_ROUTING_V1: 0, PUBLIC_BUILD_DISCIPLINE_V1: 2, PUBLIC_GUIDANCE_ACTIVATION_V2: 3 }[input.aicontrol_revision];
    // Compatibility variants have the same policy level as their historical slot.
    const priorLevel = [0, 1, 2, 3, 2, 3][priorIndex] ?? -1;
    if (priorLevel > targetIndex) fail("BASE44_PROFILE_CONTROL_DOWNGRADE_BLOCKED");
    next["documents/AICONTROL.md"] = versions[legacyDiscipline && targetIndex === 2 ? 1 : targetIndex];
  }
  for (const path of ["documents/PROJECT_SPEC.md", "governance/BUILD_INTENTIONS.md"]) next[path] = generated.get(path);
  if (next["documents/PROJECT_SPEC.md"] === prior["documents/PROJECT_SPEC.md"]
      && next["governance/BUILD_INTENTIONS.md"] === prior["governance/BUILD_INTENTIONS.md"]
      && next["documents/AICONTROL.md"] === prior["documents/AICONTROL.md"]
      && stage === state.maturation_stage) fail("BASE44_PROFILE_UPDATE_NOT_REQUIRED");
  next[statePath] = exactJson({ ...state, expected_app_revision: input.expected_app_revision, active_build_intention_id: input.build_intentions.active_id, maturation_stage: stage });
  // Preserve every original byte, including a missing final newline.
  next[ledgerPath] = prior[ledgerPath] + (prior[ledgerPath].endsWith("\n") ? "" : "\n") + exactJson({
    schema: "BOS_CLOUDBOS_PUBLIC_BASE44_EVIDENCE_EVENT_V1", event: "GOVERNANCE_PROFILE_UPDATE_PLANNED",
    project_binding_id: input.project_binding_id, profile: profileId, created_at: input.created_at,
    prior_manifest_sha256: sha256(prior[manifestPath]), expected_app_revision: input.expected_app_revision,
    project_spec_sha256: sha256(next["documents/PROJECT_SPEC.md"]), build_intentions_sha256: sha256(next["governance/BUILD_INTENTIONS.md"]),
    ...(input.aicontrol_revision === undefined ? {} : { aicontrol_revision: input.aicontrol_revision, aicontrol_sha256: sha256(next["documents/AICONTROL.md"]) }),
  });
  const artifacts = manifest.artifacts.map(({ target, role, artifact_id }) => ({
    ...artifact(target, role, next[target], sha256(prior[target]), "REPLACE"), artifact_id,
  }));
  const updatedManifest = { ...manifest, expected_app_revision: input.expected_app_revision,
    artifacts: artifacts.map(({ artifact_id, target, role, proposed_sha256: hash, proposed_bytes: bytes }) => ({ artifact_id, target, role, sha256: hash, bytes, removable: true })),
  };
  artifacts.push(artifact(manifestPath, "GOVERNANCE_MANIFEST", exactJson(updatedManifest), sha256(prior[manifestPath]), "REPLACE"));
  return artifacts;
}

// Clone import is explicit first activation, never an UPDATE identity exception.
// The control plane separately verifies the source binding for this platform.
function cloneRebind(input, profileId, profileVersion) {
  const manifestPath = "governance/GOVERNANCE_MANIFEST.json";
  const statePath = "governance/PROJECT_STATE.json";
  const ledgerPath = "governance/EVIDENCE_LEDGER.jsonl";
  const prior = input.installed_artifacts;
  const manifest = input.installed_manifest;
  if (!manifest || !prior || manifest.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1"
      || manifest.profile !== profileId || manifest.environment !== input.environment || manifest.adapter_id !== input.adapter_id
      || !ID.test(manifest.app_id ?? "") || manifest.project_ref !== `base44:${manifest.app_id}`
      || !ID.test(manifest.project_binding_id ?? "") || manifest.app_id === input.app_id
      || manifest.project_binding_id === input.project_binding_id || !Array.isArray(manifest.artifacts)) fail("BASE44_CLONE_SOURCE_IDENTITY_INVALID");
  const state = JSON.parse(prior[statePath]);
  if (state.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_PROJECT_STATE_V1"
      || state.app_id !== manifest.app_id || state.project_ref !== manifest.project_ref
      || state.project_binding_id !== manifest.project_binding_id || state.platform_installation_id !== input.platform_installation_id
      || state.profile !== profileId || state.environment !== input.environment
      || state.expected_app_revision !== manifest.expected_app_revision
      || canonical(state.authority) !== canonical(input.authority)
      || state.state !== "GOVERNED_ACTIVE" || state.runtime_dependency !== false) fail("BASE44_CLONE_SOURCE_IDENTITY_INVALID");
  const { definitions, triggers } = selectedArtifacts(profileId, manifest.artifacts.some(x => x.target === "governance/SECURITY_BASELINE.md") ? ["AUTHENTICATION"] : []);
  const expected = new Map(definitions.map(x => [x.path, x.role]));
  expected.set(manifestPath, "GOVERNANCE_MANIFEST");
  const owned = [...manifest.artifacts, { target: manifestPath, role: "GOVERNANCE_MANIFEST", sha256: sha256(prior[manifestPath]) }];
  if (owned.length !== expected.size || new Set(owned.map(x => x.target)).size !== expected.size
      || Object.keys(prior).length !== expected.size || Object.keys(prior).some(x => !expected.has(x))
      || Object.keys(input.expected_prior_sha256 ?? {}).length !== expected.size) fail("BASE44_CLONE_EXACT_ARTIFACTS_REQUIRED");
  for (const item of owned) {
    if (expected.get(item.target) !== item.role || (item.target !== manifestPath && item.removable !== true)) fail("BASE44_CLONE_OWNERSHIP_INVALID");
    contentSafe(prior[item.target], item.target);
    if (sha256(prior[item.target]) !== item.sha256 || item.sha256 !== input.expected_prior_sha256[item.target]
        || (item.target !== manifestPath && Buffer.byteLength(prior[item.target]) !== item.bytes)) fail("BASE44_CLONE_PRIOR_HASH_MISMATCH");
  }
  if (!Array.isArray(input.project_spec?.in_scope) || !Array.isArray(input.project_spec?.out_of_scope)
      || !ID.test(input.build_intentions?.active_id ?? "") || !Array.isArray(input.build_intentions?.current)
      || !Array.isArray(input.build_intentions?.excluded)) fail("BASE44_CLONE_COMPLETE_BASELINE_REQUIRED");
  if (input.aicontrol_revision !== undefined || (input.security_triggers?.length ?? 0) > 0
      || Object.keys(input.capability_currentness ?? {}).length > 0) fail("BASE44_CLONE_SCOPE_UNSUPPORTED");
  const generated = buildContents({ ...input, maturation_stage: input.maturation_stage ?? "DISCOVERY" }, profileId, profileVersion, definitions, triggers);
  const oldControl = buildContents({ ...input, project_ref: manifest.project_ref }, profileId, profileVersion, definitions, triggers).get("documents/AICONTROL.md");
  const sourceControlIndex = controlVersions(oldControl).indexOf(prior["documents/AICONTROL.md"]);
  if (sourceControlIndex < 0) fail("BASE44_CLONE_CANONICAL_ROUTER_REQUIRED");
  const contents = new Map(generated);
  contents.set("documents/AICONTROL.md", controlVersions(generated.get("documents/AICONTROL.md"))[sourceControlIndex]);
  // Preserve safety policy, but reset capability results and build status for the clone.
  if (expected.has("governance/SECURITY_BASELINE.md")) contents.set("governance/SECURITY_BASELINE.md", prior["governance/SECURITY_BASELINE.md"]);
  if (expected.has("governance/BUILD_GATES.json")) {
    const gates = JSON.parse(prior["governance/BUILD_GATES.json"]);
    contents.set("governance/BUILD_GATES.json", exactJson({ ...gates, last_result: "PENDING_FIRST_GOVERNED_BUILD" }));
  }
  contents.set(ledgerPath, prior[ledgerPath] + (prior[ledgerPath].endsWith("\n") ? "" : "\n") + exactJson({
    schema: "BOS_CLOUDBOS_PUBLIC_BASE44_EVIDENCE_EVENT_V1", event: "CLONE_REBIND_PLANNED",
    source_project_ref: manifest.project_ref, source_project_binding_id: manifest.project_binding_id,
    source_manifest_sha256: sha256(prior[manifestPath]), project_ref: input.project_ref,
    project_binding_id: input.project_binding_id, prior_events_are_source_provenance_only: true,
    approvals_transferred: false, created_at: input.created_at,
  }));
  const artifacts = definitions.filter(x => x.path !== manifestPath).map(({ path, role }) => artifact(path, role, contents.get(path), sha256(prior[path]), "REPLACE"));
  const nextManifest = { ...manifest, project_ref: input.project_ref, project_binding_id: input.project_binding_id,
    app_id: input.app_id, expected_app_revision: input.expected_app_revision,
    ai_controls_pointer: { included_in_projection: false, status: "PENDING_SEPARATE_ASSIST_ACTION", next_action: "verify_inherited_native_pointer_for_exact_clone" },
    artifacts: artifacts.map(({ artifact_id, target, role, proposed_sha256, proposed_bytes }) => ({ artifact_id, target, role, sha256: proposed_sha256, bytes: proposed_bytes, removable: true })),
  };
  artifacts.push(artifact(manifestPath, "GOVERNANCE_MANIFEST", exactJson(nextManifest), sha256(prior[manifestPath]), "REPLACE"));
  return artifacts;
}

export function createBase44AppGovernanceProfilePlan(input = {}) {
  for (const [field, value] of Object.entries({ platform_installation_id: input.platform_installation_id, project_id: input.project_id, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision })) if (!ID.test(value ?? "")) fail("BASE44_PROFILE_IDENTITY_INVALID", field);
  if (input.environment !== "BASE44_GOVERNED_APP" || input.adapter_id !== "base44_app_governance") fail("BASE44_PROFILE_CANONICAL_IDENTITY_REQUIRED");
  if (input.authority?.source !== "BASE44_APP_OWNER" || input.authority?.deployment !== "OWNER_CONTROLLED") fail("BASE44_PROFILE_AUTHORITY_INVALID");
  if (typeof input.resource_uri !== "string" || !input.resource_uri.startsWith("cloudbos://projects/")) fail("BASE44_PROFILE_RESOURCE_URI_INVALID");
  const operation = input.requested_operation ?? "ACTIVATE";
  if (!["ACTIVATE", "UPDATE", "REMOVE"].includes(operation)) fail("BASE44_PROFILE_OPERATION_UNSUPPORTED");
  if (input.aicontrol_revision !== undefined && operation !== "UPDATE") fail("BASE44_PROFILE_ROUTING_UPDATE_ONLY");
  if (operation === "UPDATE" || input.clone_rebind === true) input = normalizeBase44UpdateInput(input);
  if (input.clone_rebind !== undefined && (input.clone_rebind !== true || operation !== "ACTIVATE")) fail("BASE44_CLONE_ACTIVATION_ONLY");
  const contract = loadBase44AppGovernanceProfiles();
  const profileId = input.profile_id ?? contract.default_onboarding_profile ?? "LEAN_CORE_WITH_BUILD_GATES";
  const { definitions, triggers } = selectedArtifacts(profileId, input.security_triggers ?? []);
  const now = new Date(input.created_at);
  const expires = new Date(input.expires_at);
  if (!validPlanWindow(input)) fail("BASE44_PROFILE_PLAN_WINDOW_INVALID");
  let artifacts;
  if (input.clone_rebind === true) {
    artifacts = cloneRebind(input, profileId, contract.version);
  } else if (operation === "ACTIVATE") {
    const contents = buildContents(input, profileId, contract.version, definitions, triggers);
    contents.set("documents/AICONTROL.md", contents.get("documents/AICONTROL.md") + PUBLIC_BUILD_DISCIPLINE_V1);
    const nonManifest = definitions.filter(({ path }) => path !== "governance/GOVERNANCE_MANIFEST.json").map(({ path, role }) => artifact(path, role, contents.get(path), input.expected_prior_sha256?.[path] ?? null));
    const manifest = { schema: "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1", version: contract.version, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision, profile: profileId, governor_kernel: profileId === "LEAN_CORE_WITH_BUILD_GATES" ? "BASE44_LEAN_DETERMINISTIC_GOVERNOR" : "DURABLE_MEMORY_ONLY", ai_controls_pointer: { included_in_projection: false, status: "PENDING_SEPARATE_ASSIST_ACTION", next_action: "alter_base44_ai_controls_pointer_via_assist" }, connection_plug: { included_in_projection: false, next_action: "install_cloud_bos_connection_plug_indicator" }, environment: input.environment, adapter_id: input.adapter_id, artifacts: nonManifest.map(({ artifact_id, target, role, proposed_sha256: hash, proposed_bytes: bytes }) => ({ artifact_id, target, role, sha256: hash, bytes, removable: true })), lifecycle: { update: "NEW_EXACT_APPROVED_PLAN", rollback: "RETAINED_VERIFIED_PROFILE", removal: "MANIFEST_OWNED_EXACT_PLAN", drift: "EXACT_HASH_READBACK_FAIL_CLOSED", paid_upgrade: "SERVER_ENTITLEMENT_ELIGIBILITY_THEN_SEPARATE_EXACT_APPROVED_PLAN" } };
    artifacts = [...nonManifest, artifact("governance/GOVERNANCE_MANIFEST.json", "GOVERNANCE_MANIFEST", exactJson(manifest), input.expected_prior_sha256?.["governance/GOVERNANCE_MANIFEST.json"] ?? null)];
  } else if (operation === "UPDATE") {
    artifacts = forwardUpdate(input, profileId, contract.version);
  } else {
    const manifest = input.installed_manifest;
    if (manifest?.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1" || manifest.project_ref !== input.project_ref || manifest.project_binding_id !== input.project_binding_id || manifest.profile !== profileId || !Array.isArray(manifest.artifacts)) fail("BASE44_PROFILE_INSTALLED_MANIFEST_INVALID");
    const owned = [...manifest.artifacts, { artifact_id: "governance_governance_manifest_json", target: "governance/GOVERNANCE_MANIFEST.json", role: "GOVERNANCE_MANIFEST" }];
    artifacts = owned.map(({ artifact_id, target, role }) => ({ ...artifact(target, role, null, input.expected_prior_sha256?.[target], "DELETE"), artifact_id }));
  }
  const plan = { schema: PROFILE_SCHEMA, plan_id: `b44p_${sha256(`${input.project_binding_id}:${now.toISOString()}:${operation}`).slice(0, 24)}`, plan_hash: null, platform_installation_id: input.platform_installation_id, project_id: input.project_id, project_ref: input.project_ref, project_binding_id: input.project_binding_id, app_id: input.app_id, expected_app_revision: input.expected_app_revision, resource_uri: input.resource_uri, environment: input.environment, adapter_id: input.adapter_id, profile_id: profileId, requested_operation: operation, created_at: now.toISOString(), expires_at: isDurablePlan(input) ? input.expires_at : expires.toISOString(), ...(isDurablePlan(input) ? { approval_lifecycle: input.approval_lifecycle } : {}), zero_write: true, requires_approval: true, runtime_dependency: false, artifacts, artifact_manifest_hash: sha256(artifacts.map(({ target, role, proposed_sha256, expected_prior_sha256 }) => ({ target, role, proposed_sha256, expected_prior_sha256 }))), permissions: artifacts.map(({ target, operation: action }) => ({ action, target })), forbidden_content_check: "PASS" };
  if (operation === "UPDATE") plan.update_mode = {
    type: "FORWARD_SAME_PROFILE_BASELINE_UPDATE",
    prior_artifacts: structuredClone(input.installed_artifacts),
    requested_changes: { project_spec: structuredClone(input.project_spec), build_intentions: structuredClone(input.build_intentions), ...(input.maturation_stage === undefined ? {} : { maturation_stage: input.maturation_stage }), ...(input.aicontrol_revision === undefined ? {} : { aicontrol_revision: input.aicontrol_revision }) },
  };
  if (input.clone_rebind === true) plan.clone_mode = {
    type: "EXACT_SAME_PLATFORM_CLONE_REBIND_V1",
    source_project_ref: input.installed_manifest.project_ref,
    source_project_binding_id: input.installed_manifest.project_binding_id,
    source_manifest_sha256: sha256(input.installed_manifest_content),
    prior_artifacts: structuredClone(input.installed_artifacts),
    requested_changes: { project_spec: structuredClone(input.project_spec), build_intentions: structuredClone(input.build_intentions), ...(input.maturation_stage === undefined ? {} : { maturation_stage: input.maturation_stage }) },
  };
  plan.plan_hash = planHash(plan);
  return plan;
}

export function validateBase44AppGovernanceProfilePlan(plan) {
  if (!validPlanWindow(plan)) fail("BASE44_PROFILE_PLAN_WINDOW_INVALID");
  if (plan?.schema !== PROFILE_SCHEMA || plan.plan_hash !== planHash(plan) || plan.environment !== "BASE44_GOVERNED_APP" || plan.adapter_id !== "base44_app_governance" || !Array.isArray(plan.artifacts) || plan.artifacts.length < 7) fail("BASE44_PROFILE_PLAN_INVALID");
  for (const item of plan.artifacts) {
    targetSafe(item.target);
    if (item.proposed_content !== null && (sha256(item.proposed_content) !== item.proposed_sha256 || Buffer.byteLength(item.proposed_content) !== item.proposed_bytes)) fail("BASE44_PROFILE_PLAN_TAMPERED");
    if (item.expected_prior_sha256 !== null && !HASH.test(item.expected_prior_sha256)) fail("BASE44_PROFILE_PLAN_INVALID");
  }
  if (plan.requested_operation === "UPDATE") {
    if (plan.update_mode?.type !== "FORWARD_SAME_PROFILE_BASELINE_UPDATE" || plan.resume_mode || plan.repair_mode) fail("BASE44_PROFILE_UPDATE_MODE_INVALID");
    const prior = plan.update_mode.prior_artifacts;
    const manifestPath = "governance/GOVERNANCE_MANIFEST.json";
    if (typeof prior?.[manifestPath] !== "string") fail("BASE44_PROFILE_UPDATE_PRIOR_INVALID");
    const rebuildInput = { ...plan, ...plan.update_mode.requested_changes,
      installed_artifacts: prior, installed_manifest_content: prior[manifestPath], installed_manifest: JSON.parse(prior[manifestPath]),
      expected_prior_sha256: Object.fromEntries(plan.artifacts.map(x => [x.target, x.expected_prior_sha256])),
      authority: { source: "BASE44_APP_OWNER", deployment: "OWNER_CONTROLLED" },
    };
    const rebuilt = forwardUpdate(rebuildInput, plan.profile_id, loadBase44AppGovernanceProfiles().version);
    if (canonical(rebuilt) !== canonical(plan.artifacts)) {
      // Only the exact historical V1 bytes are eligible; every artifact, hash,
      // ledger event and continuity field must still reconstruct identically.
      if (plan.update_mode.requested_changes.aicontrol_revision !== "PUBLIC_BUILD_DISCIPLINE_V1"
          || canonical(forwardUpdate(rebuildInput, plan.profile_id, loadBase44AppGovernanceProfiles().version, true)) !== canonical(plan.artifacts))
        fail("BASE44_PROFILE_UPDATE_CONTINUITY_MISMATCH");
    }
  } else if (plan.update_mode !== undefined) fail("BASE44_PROFILE_UPDATE_MODE_INVALID");
  if (plan.clone_mode !== undefined) {
    const mode = plan.clone_mode;
    if (plan.requested_operation !== "ACTIVATE" || mode.type !== "EXACT_SAME_PLATFORM_CLONE_REBIND_V1"
        || plan.resume_mode || plan.repair_mode || plan.update_mode) fail("BASE44_CLONE_MODE_INVALID");
    const normalized = normalizeBase44UpdateInput({ installed_artifacts: mode.prior_artifacts });
    if (mode.source_project_ref !== normalized.installed_manifest.project_ref
        || mode.source_project_binding_id !== normalized.installed_manifest.project_binding_id
        || mode.source_manifest_sha256 !== sha256(normalized.installed_manifest_content)) fail("BASE44_CLONE_SOURCE_IDENTITY_INVALID");
    const rebuilt = cloneRebind({ ...plan, ...mode.requested_changes, ...normalized,
      expected_prior_sha256: Object.fromEntries(plan.artifacts.map(x => [x.target, x.expected_prior_sha256])),
      authority: { source: "BASE44_APP_OWNER", deployment: "OWNER_CONTROLLED" },
    }, plan.profile_id, loadBase44AppGovernanceProfiles().version);
    if (canonical(rebuilt) !== canonical(plan.artifacts)) fail("BASE44_CLONE_RECONSTRUCTION_MISMATCH");
  }
  return plan;
}

const validatePlan = validateBase44AppGovernanceProfilePlan;

function validateApproval(plan, approval, now) {
  validatePlan(plan);
  if (approval?.approved !== true || approval.plan_hash !== plan.plan_hash || approval.project_binding_id !== plan.project_binding_id || !planIsCurrent(plan, now) || (isDurablePlan(plan) && (approval.platform_installation_id !== plan.platform_installation_id || approval.project_ref !== plan.project_ref))) fail("BASE44_PROFILE_APPROVAL_INVALID");
}

export async function verifyBase44AppGovernanceProfile({ plan, store, verified_at = new Date().toISOString() }) {
  validatePlan(plan);
  const checks = [];
  for (const item of plan.artifacts) {
    const content = await store.read(item.target);
    const actual = content === null ? null : sha256(content);
    checks.push({ target: item.target, expected_sha256: item.proposed_sha256, actual_sha256: actual, status: actual === item.proposed_sha256 ? "MATCH" : content === null ? "MISSING" : "DRIFTED" });
  }
  const complete = ["ACTIVATE", "UPDATE", "ROLLBACK"].includes(plan.requested_operation) && checks.every(({ status }) => status === "MATCH");
  return { schema: READBACK_SCHEMA, plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id, profile_id: plan.profile_id, verified_at: new Date(verified_at).toISOString(), artifact_count: checks.length, checks, governance_state: complete ? "GOVERNED_ACTIVE" : "STALE_OR_DRIFTED", runtime_dependency: false, acceptance_status: complete ? "COMPLETE_VERIFIED" : "FAILED_SYNC_VERIFICATION" };
}

export async function activateBase44AppGovernanceProfile({ plan, approval, store, now = new Date().toISOString() }) {
  validateApproval(plan, approval, now);
  if (!["ACTIVATE", "UPDATE", "ROLLBACK"].includes(plan.requested_operation)) fail("BASE44_PROFILE_OPERATION_INVALID");
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
  if (!["ACTIVATE", "UPDATE", "ROLLBACK"].includes(plan.requested_operation) || !HASH.test(plan.installed_manifest_sha256 ?? "")) fail("BASE44_PROFILE_LIFECYCLE_PLAN_REQUIRED");
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

export async function verifyBase44AppGovernanceLifecycleRemoval({ plan, store, application_source_before_sha256, application_source_after_sha256, verified_at = new Date().toISOString() }) {
  validatePlan(plan);
  if (plan.requested_operation !== "REMOVE") fail("BASE44_PROFILE_OPERATION_INVALID");
  const beforeRevision = typeof store.getRevision === "function" ? await store.getRevision() : null;
  for (const item of plan.artifacts) if (await store.read(item.target) !== null) fail("BASE44_PROFILE_REMOVAL_READBACK_FAILED");
  const evidence = await lifecycleEvidence(plan, store, application_source_before_sha256, application_source_after_sha256);
  if (evidence.version_ref !== beforeRevision) fail("BASE44_PROFILE_READBACK_REVISION_CHANGED");
  return { schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_REMOVAL_V1", removal_id: `b44rm_${plan.plan_hash.slice(0, 24)}`, ...(isDurablePlan(plan) ? { verified_at, evidence } : {}), approved_plan_hash: plan.plan_hash, project_ref: plan.project_ref, project_binding_id: plan.project_binding_id, adapter_id: plan.adapter_id, manifest_owned_targets: plan.artifacts.map(({ target }) => target), removed_targets: plan.artifacts.map(({ target }) => target), preserved_application_targets: [], binding_status: "DETACHED", post_removal_state: "DETACHED_OR_REMOVED", application_preservation_check: "PASS", acceptance_status: "COMPLETE_VERIFIED" };
}
