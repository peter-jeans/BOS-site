import fs from "node:fs";
import { createHash } from "node:crypto";
import { evaluatePublicProjectBaseline } from "./project-baseline.mjs";

const contractUrl = new URL("../contracts/base44-governed-app-onboarding.json", import.meta.url);
const RESULT_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNED_APP_ONBOARDING_DECISION_V1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const TIERS = Object.freeze(["STANDARD", "PLUS", "PRO", "ENTERPRISE"]);
const CONNECTED_STATES = new Set(["CONNECTED", "DISCONNECTED", "DEGRADED", "BLOCKED", "UNKNOWN_VISIBLE"]);
const AI_CONTROLS_POINTER_STATES = new Set(["ABSENT", "CURRENT", "STALE", "MISDIRECTED", "UNREADABLE"]);
const GOVERNANCE_STATES = new Set(["UNBOUND", "DISCOVERY_ONLY", "GOVERNANCE_PLAN_READY", "GOVERNED_ACTIVE", "STALE_OR_DRIFTED", "DETACHED_OR_REMOVED"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function loadBase44GovernedAppOnboardingContract() {
  return JSON.parse(fs.readFileSync(contractUrl, "utf8"));
}

// Presentation only: neither a server plan nor permission to change settings.
export function renderBase44PointerCopyInstructions() {
  const pointer = loadBase44GovernedAppOnboardingContract().ai_controls_pointer.pointer_text;
  return {
    pointer_text: pointer,
    pointer_sha256: createHash("sha256").update(pointer, "utf8").digest("hex"),
    copy_block: "```markdown\n" + pointer + "\n```",
    instructions: "Copy only the text inside this block, preserving the literal heading markers and backticks. Paste into this app's Custom Instructions, save, then reopen for independent exact-text verification.",
    server_plan_issued: false,
    grants_mutation_authority: false,
  };
}

function action(input, stage, actionId, {
  mutation = false,
  requiresApproval = mutation,
  category = "governance",
  reason,
  profileId = null,
  capabilityId = null,
  executionSurface = null,
} = {}) {
  return {
    schema: RESULT_SCHEMA,
    status: mutation ? "ACTION_PLAN_REQUIRED" : "ACTION_AVAILABLE",
    app_ref: input.app_ref,
    project_binding_id: input.project_binding_id ?? null,
    stage,
    next_action: {
      action_id: actionId,
      category,
      mutation,
      requires_approval: requiresApproval,
      one_material_action_only: true,
      exact_app_readback_required: mutation,
      profile_id: profileId,
      capability_id: capabilityId,
      execution_surface: executionSurface,
      reason,
    },
    ...(actionId === "alter_base44_ai_controls_pointer_via_assist" ? { pointer_handoff: renderBase44PointerCopyInstructions() } : {}),
    bulk_mutation_allowed: false,
    private_bos_material_allowed: false,
  };
}

function tierAtLeast(actual, required) {
  return TIERS.indexOf(actual) >= TIERS.indexOf(required);
}

// This helper validates host evidence; it is not an authenticated settings API.
// The observer must obtain this evidence independently of the installing actor.
function pointerReadbackCurrent(input, contract) {
  const proof = input.ai_controls_pointer_readback;
  if (!proof) return false;
  const age = Date.parse(input.observed_at ?? new Date().toISOString()) - Date.parse(proof.observed_at);
  return proof.source === "INDEPENDENT_NATIVE_UI_READBACK"
    && proof.app_ref === input.app_ref
    && proof.project_binding_id === input.project_binding_id
    && proof.app_revision === input.baseline_evidence?.current_revision
    && /^[a-f0-9]{64}$/.test(input.governance_manifest_sha256 ?? "")
    && proof.governance_manifest_sha256 === input.governance_manifest_sha256
    && proof.saved === true && proof.reopened === true
    && proof.pointer_text === contract.ai_controls_pointer.pointer_text
    && Number.isFinite(age) && age >= 0 && age <= contract.ai_controls_pointer.readback_max_age_ms;
}

function validate(input) {
  if (!ID.test(String(input.app_ref || ""))) fail("BASE44_ONBOARDING_APP_REF_REQUIRED");
  if (!["ABSENT", "CONNECTED", "ERROR"].includes(input.account_mcp_state)) fail("BASE44_ONBOARDING_ACCOUNT_MCP_STATE_INVALID");
  if (!["ABSENT", "INSTALLED", "DRIFTED"].includes(input.workspace_skill_state)) fail("BASE44_ONBOARDING_WORKSPACE_SKILL_STATE_INVALID");
  if (!["NOT_RUN", "VERIFIED", "BLOCKED"].includes(input.app_discovery_state)) fail("BASE44_ONBOARDING_DISCOVERY_STATE_INVALID");
  if (!GOVERNANCE_STATES.has(input.project_governance_state)) fail("BASE44_ONBOARDING_GOVERNANCE_STATE_INVALID");
  if (input.profile_id !== null && input.profile_id !== undefined && !["LEAN_MEMORY_CORE", "LEAN_CORE_WITH_BUILD_GATES"].includes(input.profile_id)) fail("BASE44_ONBOARDING_PROFILE_INVALID");
  if (input.connection_indicator_status !== "ABSENT" && !CONNECTED_STATES.has(input.connection_indicator_status)) fail("BASE44_ONBOARDING_CONNECTION_INDICATOR_STATE_INVALID");
  const pointerStatus = input.ai_controls_pointer_status ?? "ABSENT";
  if (!AI_CONTROLS_POINTER_STATES.has(pointerStatus)) fail("BASE44_ONBOARDING_AI_CONTROLS_POINTER_STATE_INVALID");
  const entitlement = input.server_entitlement ?? { verified: false, tier: "STANDARD" };
  if (typeof entitlement.verified !== "boolean" || !TIERS.includes(entitlement.tier)) fail("BASE44_ONBOARDING_ENTITLEMENT_INVALID");
  const pack = input.entitled_governance_pack ?? null;
  if (pack && (!ID.test(String(pack.capability_id || "")) || !TIERS.includes(pack.minimum_tier) || typeof pack.requires_app_files !== "boolean")) fail("BASE44_ONBOARDING_CAPABILITY_PACK_INVALID");
  return { entitlement, pack, pointerStatus };
}

function selectBase44GovernedAppOnboardingAction(input = {}) {
  const contract = loadBase44GovernedAppOnboardingContract();
  const { entitlement, pack, pointerStatus: declaredPointerStatus } = validate(input);
  const pointerVerified = pointerReadbackCurrent(input, contract);
  const pointerStatus = pointerVerified ? "CURRENT" : declaredPointerStatus;

  if (input.account_mcp_state !== "CONNECTED") {
    return action(input, "ACCOUNT_MCP_CONNECTION", "install_base44_account_cloudbos_mcp", { mutation: true, category: "platform_install", reason: "The account-scoped Cloud BOS MCP connection is not verified connected." });
  }
  if (input.workspace_skill_state !== "INSTALLED") {
    return action(input, "WORKSPACE_SKILL_INSTALLATION", "install_base44_cloudbos_workspace_skill", { mutation: true, category: "platform_install", reason: "The selected workspace does not have the exact current Cloud BOS skill projection." });
  }
  if (input.app_discovery_state !== "VERIFIED") {
    return action(input, "APP_DISCOVERY_READ_ONLY", "bos_project_discover", { reason: "The exact Base44 app and workspace binding must be discovered read-only before any app plan." });
  }
  const baseline = evaluatePublicProjectBaseline({ ...input.baseline_evidence, project_ref: input.app_ref });
  const baselineAction = (stage, id, options) => ({ ...action(input, stage, id, options), baseline });
  if (!baseline.ready_for_governance_plan) {
    return {
      ...action(input, "PROJECT_BASELINE_READBACK_AND_ACCEPTANCE", "reconcile_public_project_baseline", {
        category: "project_spec",
        reason: "Read the existing project baseline and ask only the returned material gaps. Exact project-bound acceptance and current provider readback are required before governance planning or a ready claim.",
      }),
      status: "BASELINE_EVIDENCE_REQUIRED",
      baseline,
      can_continue_governed_mutation: false,
    };
  }
  if (input.project_governance_state === "UNBOUND" || input.project_governance_state === "DISCOVERY_ONLY" || input.project_governance_state === "DETACHED_OR_REMOVED") {
    return baselineAction("APP_GOVERNANCE_PLAN", "bos_project_governance_plan", { reason: "Render the exact eight-artifact deterministic-governor plan for owner review.", profileId: contract.default_app_profile });
  }
  if (input.project_governance_state === "GOVERNANCE_PLAN_READY") {
    return baselineAction("APP_GOVERNANCE_ACTIVATE_AND_READBACK", "bos_project_governance_activate", { mutation: true, reason: "Activate only the current approved app-bound plan and verify exact provider readback.", profileId: contract.default_app_profile });
  }
  if (input.project_governance_state === "STALE_OR_DRIFTED") {
    return baselineAction("APP_GOVERNANCE_PLAN", "bos_project_governance_plan", { reason: "Drift requires a fresh exact repair or update plan; it cannot be hidden as onboarding.", profileId: contract.default_app_profile });
  }
  if (input.project_binding_verified !== true) {
    return baselineAction("APP_GOVERNANCE_ACTIVATE_AND_READBACK", "bos_project_governance_verify", { reason: "GOVERNED_ACTIVE requires exact app binding and artifact readback." });
  }
  if (input.profile_id !== contract.default_app_profile || input.build_gates_verified !== true) {
    return baselineAction("DETERMINISTIC_GOVERNOR_CURRENTNESS", "upgrade_base44_deterministic_governor_kernel", { mutation: true, reason: "This app predates or lacks the current public-safe alignment, early-warning and build-verification kernel.", profileId: contract.default_app_profile });
  }
  if (!pointerVerified && (pointerStatus === "CURRENT" || input.ai_controls_pointer_readback)) {
    return {
      ...baselineAction("AI_CONTROLS_POINTER_PLAN_INSTALL_AND_READBACK", "verify_base44_native_ai_controls_pointer", {
        category: "platform_control",
        executionSurface: "INDEPENDENT_NATIVE_UI_READBACK",
        reason: "A current setting claim or historical manifest marker cannot replace fresh exact app-bound saved and reopened UI text. Read the native setting independently before deciding whether it needs a change.",
      }),
      status: "NATIVE_AI_CONTROLS_READBACK_REQUIRED",
      can_continue_governed_mutation: false,
    };
  }
  if (!pointerVerified) {
    const customer = input.execution_host === "BASE44_CUSTOMER";
    return baselineAction("AI_CONTROLS_POINTER_PLAN_INSTALL_AND_READBACK", contract.ai_controls_pointer.action_id, {
      mutation: true,
      category: "platform_control",
      executionSurface: customer ? contract.ai_controls_pointer.customer_route.execution_surface : contract.ai_controls_pointer.execution_surface,
      reason: customer
        ? "Guide the customer through the exact approved pointer in Models -> AI Controls -> Custom Instructions after AICONTROL and manifest readback; save, reload and reopen. An independent observer must verify exact saved text. Customer assertion alone cannot establish readiness; no hidden external installation counts as customer acceptance."
        : "After Assist selects the bounded action, use Codex or Claude Code computer control to alter only the native AI Controls pointer after exact documents/AICONTROL.md and Governance Manifest readback; save, reopen the UI, and verify the pointer verbatim. Assist is not an app slash command and does not itself grant mutation authority.",
    });
  }
  if (!CONNECTED_STATES.has(input.connection_indicator_status)) {
    return baselineAction("CONNECTION_PLUG_PLAN_INSTALL_AND_READBACK", contract.connection_plug.action_id, { mutation: true, category: "app_surface", reason: "Install or verify the owner/admin connection indicator as a separate app-surface action after governance activation." });
  }

  if (pack) {
    if (!entitlement.verified || !tierAtLeast(entitlement.tier, pack.minimum_tier)) {
      return {
        ...baselineAction("ENTITLED_GOVERNANCE_CAPABILITY_UPGRADES", "show_contextual_upgrade_offer", { category: "commercial", reason: "The requested governance capability is not covered by verified server entitlement.", capabilityId: pack.capability_id }),
        status: "CURRENT_CAPABILITIES_REMAIN_AVAILABLE",
        entitlement_granted_by_client: false,
      };
    }
    if (pack.requires_app_files) {
      return baselineAction("ENTITLED_GOVERNANCE_CAPABILITY_UPGRADES", "install_entitled_governance_capability_pack", { mutation: true, category: "governance", reason: "Verified server entitlement makes this app-local projection eligible; a separate exact per-app plan is still required.", capabilityId: pack.capability_id });
    }
  }

  return {
    schema: RESULT_SCHEMA,
    status: pack && entitlement.verified ? "GOVERNED_APP_READY_ENTITLED_SERVER_CAPABILITY" : "GOVERNED_APP_READY",
    app_ref: input.app_ref,
    project_binding_id: input.project_binding_id ?? null,
    stage: "GOVERNED_APP_READY",
    next_action: null,
    profile_id: contract.default_app_profile,
    connection_indicator_status: input.connection_indicator_status,
    ai_controls_pointer_status: pointerStatus,
    server_entitlement_verified: entitlement.verified,
    baseline,
    tier: entitlement.tier,
    app_file_mutation_required: false,
    bulk_mutation_allowed: false,
    private_bos_material_allowed: false,
    governance_equivalence_claim_allowed: false,
    governance_equivalence_blocker: contract.deferred_acceptance.matched_lane_trial,
  };
}

// Advisory host projection. Persistence is owned by the host's existing approved
// evidence writer; this helper neither writes the app nor authenticates claims.
export function planBase44GovernedAppOnboarding(input = {}) {
  const contract = loadBase44GovernedAppOnboardingContract();
  const copy = renderBase44PointerCopyInstructions();
  const prior = input.onboarding_progress;
  const bound = (record) => record?.app_ref === input.app_ref
    && record?.project_binding_id === input.project_binding_id
    && ID.test(String(input.project_binding_id || ""))
    && /^[a-f0-9]{64}$/.test(input.governance_manifest_sha256 || "")
    && record?.governance_manifest_sha256 === input.governance_manifest_sha256
    && record?.pointer_sha256 === copy.pointer_sha256;
  const priorUsable = prior?.schema === "BOS_BASE44_POINTER_PROGRESS_V1" && bound(prior);
  const confirmation = input.ai_controls_user_confirmation;
  const userConfirmed = (bound(confirmation) && confirmation.saved === true)
    || (priorUsable && prior.user_confirmation === "REPORTED_SAVED");
  const self = input.ai_controls_buildai_self_check;
  // Source attribution here is a host claim, not platform attestation. In
  // particular, repeating the expected text from chat cannot verify settings.
  const selfCheck = !bound(self) || self.source !== "CURRENT_TURN_AI_CONTROLS"
    ? "NOT_OBSERVED"
    : typeof self.pointer_text !== "string" ? "UNAVAILABLE"
      : self.pointer_text === contract.ai_controls_pointer.pointer_text ? "MATCH_REPORTED"
        : self.pointer_text === "" ? "MISSING_REPORTED" : "DIFFERENT_REPORTED";
  const conflictingSelfCheck = ["MISSING_REPORTED", "DIFFERENT_REPORTED"].includes(selfCheck);
  const effective = conflictingSelfCheck
    ? { ...input, ai_controls_pointer_status: "CURRENT", ai_controls_pointer_readback: undefined }
    : userConfirmed || selfCheck === "MATCH_REPORTED"
      ? { ...input, ai_controls_pointer_status: "CURRENT" } : input;
  const result = selectBase44GovernedAppOnboardingAction(effective);
  const verified = !conflictingSelfCheck && pointerReadbackCurrent(input, contract);
  const pointerStage = result.stage === "AI_CONTROLS_POINTER_PLAN_INSTALL_AND_READBACK";
  const passedPointerStage = ["CONNECTION_PLUG_PLAN_INSTALL_AND_READBACK", "GOVERNED_APP_READY", "ENTITLED_GOVERNANCE_CAPABILITY_UPGRADES"].includes(result.stage);
  const beforeInstall = !pointerStage && !passedPointerStage;
  const state = beforeInstall ? "WAITING_FOR_GOVERNANCE_PREREQUISITES"
    : verified ? "VERIFIED"
      : userConfirmed ? "SAVED_REPORTED_VERIFICATION_PENDING"
        : selfCheck === "MATCH_REPORTED" ? "BUILDAI_MATCH_VERIFICATION_PENDING"
          : result.next_action?.action_id === "verify_base44_native_ai_controls_pointer" ? "VERIFICATION_PENDING"
            : "PASTE_OR_REPAIR_PENDING";
  const progress = {
    schema: "BOS_BASE44_POINTER_PROGRESS_V1",
    app_ref: input.app_ref,
    project_binding_id: input.project_binding_id ?? null,
    governance_manifest_sha256: input.governance_manifest_sha256 ?? null,
    pointer_sha256: copy.pointer_sha256,
    state,
    user_confirmation: userConfirmed ? "REPORTED_SAVED" : "NOT_RECORDED",
    buildai_self_check: selfCheck,
    saved_setting_verification: verified ? "INDEPENDENT_NATIVE_UI_READBACK" : "NOT_VERIFIED",
    previous_verification: priorUsable && prior.saved_setting_verification === "INDEPENDENT_NATIVE_UI_READBACK"
      ? "HISTORICAL_ONLY" : "NONE",
    current_stage_source: "CURRENT_APP_BOUND_ONBOARDING_EVIDENCE",
    storage_written: false,
    grants_mutation_authority: false,
  };
  const output = { ...result, onboarding_progress: progress };
  if (pointerStage) {
    output.can_continue_governed_mutation = false;
    output.pointer_handoff = {
      ...copy,
      app_ref: input.app_ref,
      app_name: typeof input.app_name === "string" ? input.app_name : input.app_ref,
      navigation: contract.ai_controls_pointer.customer_route.navigation,
      visible_label: "Your action required",
      state,
      display_in_current_chat: true,
      repeat_on_resume_while_pending: true,
      primary_action: result.next_action.mutation ? "COPY_PASTE_SAVE" : "CHECK_SAVED_SETTING",
      message: result.next_action.mutation
        ? "Governance files are installed and verified. Copy the block below into this app's AI Controls Custom Instructions and Save. Reply Saved when done. Waiting for your action."
        : "The saved setting is not yet verified. Check AI Controls for this app; the full expected text is repeated below for comparison or correction. Do not reinstall or repeat plan approval. Waiting for verification.",
      independent_verification_required: true,
      customer_confirmation_is_verification: false,
      buildai_self_check_is_independent_verification: false,
    };
  }
  if (beforeInstall && (input.ai_controls_pointer_status === "CURRENT" || input.ai_controls_pointer_status === "STALE"
    || input.ai_controls_pointer_readback || userConfirmed || selfCheck === "MATCH_REPORTED")) {
    output.early_pointer_recovery = {
      status: "SETUP_PREREQUISITES_REQUIRED",
      app_ref: input.app_ref,
      next_stage: result.stage,
      copy_block_presented: false,
      product_work_allowed: false,
      grants_mutation_authority: false,
      message: "AI Controls may have been pasted before setup was ready. Resume the displayed prerequisite for this exact app. Read-only discovery and setup guidance are allowed; governance writes still require the complete current server plan and its exact owner approval. Do not remove instructions, replace existing governance, restart approvals or build product features automatically.",
    };
  }
  return output;
}

export const BASE44_ONBOARDING_TIERS = TIERS;
