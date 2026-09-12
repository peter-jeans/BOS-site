import { createHash } from "node:crypto";

const SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_SESSION_ACTIVATION_RESULT_V1";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ARTIFACTS = Object.freeze([
  "documents/AICONTROL.md",
  "documents/PROJECT_SPEC.md",
  "governance/PROJECT_STATE.json",
  "governance/BUILD_INTENTIONS.md",
  "governance/CAPABILITY_MANIFEST.json",
  "governance/EVIDENCE_LEDGER.jsonl",
  "governance/GOVERNANCE_MANIFEST.json",
]);
const TRIGGERS = new Set([
  "NEW_BUILDAI_CHAT",
  "RESUMED_BUILDAI_CHAT",
  "CONTEXT_LOSS_OR_COMPACTION_SUSPECTED",
  "APP_OR_WORKSPACE_SWITCH",
  "EXTERNAL_BUILD_OR_SOURCE_CHANGE_OBSERVED",
  "BEFORE_GOVERNED_MUTATION",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function blocked(status, reasonCodes, { projectRef = null, appId = null } = {}) {
  return {
    schema: SCHEMA,
    status,
    can_continue_governed_mutation: false,
    project_ref: projectRef,
    app_id: appId,
    reason_codes: reasonCodes,
    speaker: {
      emitted: false,
      chain: null,
      version_source: null,
      proves_entitlement: false,
      proves_project_governance: false,
    },
    chat_memory_used_as_authority: false,
    private_bos_material_required: false,
  };
}

function serviceSpeaker(version) {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?(?:[-+][A-Za-z0-9.-]+)?$/.exec(String(version || ""));
  return match ? `BOS${match[1]}.${match[2]}> Base44> user>` : null;
}

export function evaluateBase44SessionMemoryActivation({
  trigger,
  bos_connect: bosConnect = {},
  expected_identity: expectedIdentity = {},
  observed_app_revision: observedAppRevision = null,
  background_or_external_build_possible: backgroundBuildPossible = false,
  artifacts = {},
  requested_intention_id: requestedIntentionId = null,
  durable_intention_id: durableIntentionId = null,
} = {}) {
  const projectRef = expectedIdentity.project_ref || null;
  const appId = expectedIdentity.app_id || null;
  if (!TRIGGERS.has(trigger)) return blocked("BLOCKED_READBACK_UNVERIFIED", ["activation_trigger_invalid"], { projectRef, appId });
  if (![projectRef, appId, expectedIdentity.project_binding_id, expectedIdentity.expected_app_revision, expectedIdentity.projection_base_revision].every((value) => typeof value === "string" && ID.test(value))
    || !HASH.test(expectedIdentity.governance_manifest_sha256 ?? "")) {
    return blocked("BLOCKED_READBACK_UNVERIFIED", ["independently_verified_identity_revision_and_manifest_hash_required"], { projectRef, appId });
  }

  const speaker = serviceSpeaker(bosConnect.service_version);
  if (bosConnect.authenticated !== true || bosConnect.platform_identity_verified !== true || !speaker) {
    return blocked("BLOCKED_READBACK_UNVERIFIED", ["authenticated_bos_connect_currentness_required"], { projectRef, appId });
  }
  if (
    bosConnect.project_binding_verified !== true
    || bosConnect.project_ref !== projectRef
    || bosConnect.app_id !== appId
    || bosConnect.project_binding_id !== expectedIdentity.project_binding_id
  ) {
    return blocked("BLOCKED_UNBOUND", ["exact_app_binding_mismatch"], { projectRef, appId });
  }

  const missing = REQUIRED_ARTIFACTS.filter((target) => typeof artifacts[target] !== "string" || artifacts[target].length === 0);
  if (missing.length) return blocked("BLOCKED_MEMORY_INCOMPLETE", missing.map((target) => `missing.${target}`), { projectRef, appId });
  if (sha256(artifacts["governance/GOVERNANCE_MANIFEST.json"]) !== expectedIdentity.governance_manifest_sha256) {
    return blocked("BLOCKED_STALE_OR_DRIFTED", ["governance_manifest_anchor_mismatch"], { projectRef, appId });
  }

  let manifest;
  try {
    manifest = JSON.parse(artifacts["governance/GOVERNANCE_MANIFEST.json"]);
  } catch {
    return blocked("BLOCKED_READBACK_UNVERIFIED", ["governance_manifest_invalid_json"], { projectRef, appId });
  }
  if (
    manifest?.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_GOVERNANCE_MANIFEST_V1"
    || manifest.project_ref !== projectRef
    || manifest.project_binding_id !== expectedIdentity.project_binding_id
    || manifest.app_id !== appId
  ) {
    return blocked("BLOCKED_UNBOUND", ["durable_manifest_identity_mismatch"], { projectRef, appId });
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length > 32 || manifest.artifacts.some((item) => !item || typeof item.target !== "string" || !/^(?:documents|governance)\/[A-Za-z0-9._/-]+$/.test(item.target) || item.target.includes("..") || !HASH.test(item.sha256 ?? ""))) {
    return blocked("BLOCKED_READBACK_UNVERIFIED", ["governance_manifest_artifact_index_missing"], { projectRef, appId });
  }
  const manifestTargets = manifest.artifacts.map(({ target }) => target);
  const uniqueManifestTargets = new Set(manifestTargets);
  const requiredIndexedTargets = REQUIRED_ARTIFACTS.filter((target) => target !== "governance/GOVERNANCE_MANIFEST.json");
  if (uniqueManifestTargets.size !== manifestTargets.length || requiredIndexedTargets.some((target) => !uniqueManifestTargets.has(target))) {
    return blocked("BLOCKED_READBACK_UNVERIFIED", ["governance_manifest_artifact_index_incomplete_or_duplicated"], { projectRef, appId });
  }

  const currentnessReasons = [];
  if (manifest.expected_app_revision !== expectedIdentity.projection_base_revision) currentnessReasons.push("expected_revision_manifest_mismatch");
  if (!observedAppRevision) currentnessReasons.push("observed_app_revision_missing");
  else if (observedAppRevision !== expectedIdentity.expected_app_revision) currentnessReasons.push("observed_app_revision_changed");
  if (backgroundBuildPossible && observedAppRevision !== expectedIdentity.expected_app_revision) currentnessReasons.push("background_build_fresh_readback_required");
  for (const item of manifest.artifacts) {
    const content = artifacts[item.target];
    if (typeof content !== "string") currentnessReasons.push(`manifest_artifact_missing.${item.target}`);
    else if (sha256(content) !== item.sha256) currentnessReasons.push(`manifest_artifact_drifted.${item.target}`);
  }
  if (currentnessReasons.length) return blocked("BLOCKED_STALE_OR_DRIFTED", [...new Set(currentnessReasons)], { projectRef, appId });

  let projectState;
  try { projectState = JSON.parse(artifacts["governance/PROJECT_STATE.json"]); }
  catch { return blocked("BLOCKED_READBACK_UNVERIFIED", ["project_state_invalid_json"], { projectRef, appId }); }
  if (projectState?.schema !== "BOS_CLOUDBOS_PUBLIC_BASE44_PROJECT_STATE_V1" || projectState.project_ref !== projectRef || projectState.app_id !== appId || projectState.project_binding_id !== expectedIdentity.project_binding_id || projectState.expected_app_revision !== expectedIdentity.projection_base_revision || projectState.state !== "GOVERNED_ACTIVE") {
    return blocked("BLOCKED_UNBOUND", ["durable_project_state_identity_or_state_mismatch"], { projectRef, appId });
  }
  const recordedIntentionId = projectState.active_build_intention_id ?? null;
  if ((recordedIntentionId !== null && !ID.test(recordedIntentionId))
    || (durableIntentionId !== null && durableIntentionId !== recordedIntentionId)
    || (requestedIntentionId !== null && requestedIntentionId !== recordedIntentionId)
    || (trigger !== "NEW_BUILDAI_CHAT" && recordedIntentionId === null)) {
    return blocked("BLOCKED_INTENTION_CONFLICT", ["requested_intention_does_not_match_durable_intention"], { projectRef, appId });
  }

  return {
    schema: SCHEMA,
    status: trigger === "NEW_BUILDAI_CHAT" ? "ACTIVE_CURRENT_NEW_REQUEST" : "ACTIVE_CURRENT_RESUME_EXACT_INTENTION",
    can_continue_governed_mutation: true,
    project_ref: projectRef,
    app_id: appId,
    project_binding_id: expectedIdentity.project_binding_id,
    observed_app_revision: observedAppRevision,
    active_build_intention_id: recordedIntentionId,
    governance_manifest_sha256: expectedIdentity.governance_manifest_sha256,
    reason_codes: ["authenticated_service_exact_binding_manifest_and_memory_current"],
    speaker: {
      emitted: true,
      chain: speaker,
      version_source: "AUTHENTICATED_BOS_CONNECT_RESULT",
      proves_entitlement: false,
      proves_project_governance: false,
    },
    chat_memory_used_as_authority: false,
    private_bos_material_required: false,
  };
}

export const BASE44_SESSION_MEMORY_REQUIRED_ARTIFACTS = REQUIRED_ARTIFACTS;
