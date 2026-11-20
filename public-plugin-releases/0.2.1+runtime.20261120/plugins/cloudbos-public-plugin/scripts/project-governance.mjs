import { createHash } from "node:crypto";
import { isDurablePlan, planIsCurrent, validPlanWindow } from "./approval-lifecycle.mjs";

const ADAPTERS = Object.freeze({
  local_repository: {
    environment: "LOCAL_REPOSITORY",
    root: ".cloudbos/governance",
    operations: { create: "CREATE", replace: "REPLACE", remove: "DELETE" },
    permission: "WRITE_EXACT_APPROVED_GOVERNANCE_ARTIFACTS",
  },
  github_repository: {
    environment: "GITHUB_REPOSITORY",
    root: ".cloudbos/governance",
    operations: { create: "CREATE", replace: "REPLACE", remove: "DELETE" },
    permission: "COMMIT_EXACT_APPROVED_GOVERNANCE_ARTIFACTS",
  },
  base44_app_governance: {
    environment: "BASE44_GOVERNED_APP",
    root: "AICONTROL/CLOUDBOS_PROJECT_GOVERNANCE",
    operations: { create: "CREATE", replace: "REPLACE", remove: "DELETE" },
    permission: "WRITE_EXACT_APPROVED_AICONTROL_ARTIFACT",
  },
  base44_direct_app: {
    environment: "BASE44_DIRECT_APP",
    root: "AICONTROL/CLOUDBOS_PROJECT_GOVERNANCE",
    operations: { create: "CREATE", replace: "REPLACE", remove: "DELETE" },
    permission: "WRITE_EXACT_APPROVED_AICONTROL_ARTIFACT",
    compatibility_alias_for: "base44_app_governance",
  },
  remote_no_write: {
    environment: "REMOTE_NO_WRITE",
    root: "CLOUD_BOS_PROJECT_VISIBLE_REMOTE_PROJECTION",
    operations: { create: "REMOTE_REGISTER", replace: "REMOTE_REGISTER", remove: "REMOTE_DETACH" },
    permission: "REGISTER_REMOTE_PROJECTION",
  },
});

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROJECTION_SCHEMA = "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_PROJECTION_V1";
const PLAN_SCHEMA = "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_PLAN_V1";
const READBACK_SCHEMA = "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_READBACK_V1";
const EVIDENCE_REQUIREMENTS = Object.freeze({
  local_repository: "LOCAL_FILESYSTEM_EXACT_READBACK",
  github_repository: "GITHUB_COMMIT_API_READBACK",
  base44_app_governance: "BASE44_AICONTROL_API_READBACK",
  base44_direct_app: "BASE44_AICONTROL_API_READBACK",
  remote_no_write: "REMOTE_PROJECT_VISIBLE_INDEPENDENT_READBACK",
});

function isBase44Adapter(adapter) {
  return adapter === ADAPTERS.base44_app_governance || adapter === ADAPTERS.base44_direct_app;
}

export class ProjectGovernanceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectGovernanceError";
    this.code = code;
    this.details = details;
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactJson(value) {
  return `${canonicalJson(value)}\n`;
}

function assert(condition, code, message, details) {
  if (!condition) throw new ProjectGovernanceError(code, message, details);
}

function assertId(value, name) {
  assert(typeof value === "string" && ID_PATTERN.test(value), "INVALID_IDENTITY", `${name} is missing or invalid`, { field: name });
}

function assertHash(value, name, nullable = false) {
  assert((nullable && value === null) || (typeof value === "string" && HASH_PATTERN.test(value)), "INVALID_HASH", `${name} is invalid`, { field: name });
}

function projectionHash(projection) {
  const clone = structuredClone(projection);
  delete clone.projection_hash;
  return sha256(canonicalJson(clone));
}

function planHash(plan) {
  const clone = structuredClone(plan);
  delete clone.plan_hash;
  return sha256(canonicalJson(clone));
}

function artifactManifestHash(artifacts) {
  return sha256(canonicalJson(artifacts.map((item) => ({
    artifact_id: item.artifact_id,
    target: item.target,
    role: item.role,
    operation: item.operation,
    proposed_sha256: item.proposed_sha256,
    proposed_bytes: item.proposed_bytes,
    expected_prior_sha256: item.expected_prior_sha256,
  }))));
}

function readbackHash(readback) {
  const clone = structuredClone(readback);
  delete clone.readback_hash;
  return sha256(canonicalJson(clone));
}

export function validateProjectGovernanceReadback(readback) {
  assert(readback?.schema === READBACK_SCHEMA, "READBACK_INVALID", "Project governance readback schema is invalid");
  assertHash(readback.readback_hash, "readback.readback_hash");
  assert(readback.readback_hash === readbackHash(readback), "READBACK_TAMPERED", "Project governance readback no longer matches its hash");
  assertHash(readback.approved_plan_hash, "readback.approved_plan_hash");
  assertHash(readback.projection_hash, "readback.projection_hash");
  assertHash(readback.artifact_manifest_hash, "readback.artifact_manifest_hash");
  assertHash(readback.installed_manifest_sha256, "readback.installed_manifest_sha256");
  assert(Number.isInteger(readback.artifact_count) && readback.artifact_count > 0, "READBACK_INVALID", "Readback artifact count is invalid");
  assert(typeof readback.evidence?.evidence_class === "string" && readback.evidence.evidence_class.length > 0, "READBACK_EVIDENCE_INVALID", "Readback evidence class is missing");
  assert(readback.evidence.independent === true, "READBACK_EVIDENCE_NOT_INDEPENDENT", "Readback evidence was not produced by the selected adapter verifier");
  return readback;
}

export function validateProjectGovernancePlan(plan) {
  assert(validPlanWindow(plan), "INVALID_PLAN_WINDOW", "Invalid approval lifecycle or timestamps");
  assert(plan?.schema === PLAN_SCHEMA, "INVALID_PLAN", "A valid project-governance plan is required");
  assert(plan.plan_hash === planHash(plan), "PLAN_TAMPERED", "Plan content no longer matches its hash");
  assertId(plan.platform_installation_id, "plan.platform_installation_id");
  assertId(plan.project_ref, "plan.project_ref");
  assertId(plan.project_binding_id, "plan.project_binding_id");
  const adapter = ADAPTERS[plan.adapter_id];
  assert(adapter && adapter.environment === plan.environment, "ADAPTER_MISMATCH", "Plan environment does not match its adapter");
  assert(Array.isArray(plan.artifacts) && plan.artifacts.length > 0, "INVALID_PLAN", "Plan must contain exact governed artifacts");
  for (const item of plan.artifacts) {
    assertTarget(adapter, item.target);
    assertHash(item.expected_prior_sha256, `${item.target}.expected_prior_sha256`, true);
    if (item.proposed_content === null) {
      assert(item.proposed_sha256 === null && item.proposed_bytes === 0, "PLAN_CONTENT_HASH_MISMATCH", "Deletion metadata is inconsistent", { target: item.target });
    } else {
      assertPublicSafe(JSON.parse(item.proposed_content));
      assert(item.proposed_sha256 === sha256(item.proposed_content), "PLAN_CONTENT_HASH_MISMATCH", "Proposed artifact content does not match its hash", { target: item.target });
      assert(item.proposed_bytes === Buffer.byteLength(item.proposed_content), "PLAN_CONTENT_HASH_MISMATCH", "Proposed artifact byte count is incorrect", { target: item.target });
    }
  }
  assert(plan.artifact_manifest_hash === artifactManifestHash(plan.artifacts), "PLAN_MANIFEST_MISMATCH", "Plan artifact manifest no longer matches its hash");
  assertHash(plan.installed_manifest_sha256, "plan.installed_manifest_sha256", true);
  assertHash(plan.prior_manifest_sha256, "plan.prior_manifest_sha256", true);
  assert(plan.readback_evidence_requirement === EVIDENCE_REQUIREMENTS[plan.adapter_id], "PLAN_EVIDENCE_MISMATCH", "Plan evidence requirement does not match its adapter");
  if (plan.requested_operation !== "REMOVE") {
    const roles = plan.artifacts.map((item) => item.role).sort();
    assert(JSON.stringify(roles) === JSON.stringify(["GOVERNANCE_PROJECTION", "MANIFEST", isBase44Adapter(adapter) ? "AICONTROL_BINDING" : plan.adapter_id === "remote_no_write" ? "REMOTE_EVIDENCE" : "PROJECT_IDENTITY"].sort()), "PLAN_ARTIFACT_SET_INCOMPLETE", "Activation plan must contain the exact minimal three-artifact projection set");
    const manifestArtifact = plan.artifacts.find((item) => item.role === "MANIFEST");
    assert(plan.installed_manifest_sha256 === manifestArtifact.proposed_sha256, "PLAN_MANIFEST_MISMATCH", "Installed manifest hash does not match its proposed artifact");
    const manifest = JSON.parse(manifestArtifact.proposed_content);
    assert(manifest.project_binding_id === plan.project_binding_id && manifest.adapter_id === plan.adapter_id, "PLAN_MANIFEST_SCOPE_MISMATCH", "Manifest does not match the plan binding and adapter");
    const expectedManifestEntries = plan.artifacts
      .filter((item) => item.role !== "MANIFEST")
      .map((item) => ({ artifact_id: item.artifact_id, target: item.target, role: item.role, sha256: item.proposed_sha256, bytes: item.proposed_bytes, removable: true }));
    assert(canonicalJson(manifest.artifacts) === canonicalJson(expectedManifestEntries), "PLAN_MANIFEST_MISMATCH", "Installed manifest does not enumerate the exact approved artifact set");
    if (plan.requested_operation === "ACTIVATE") assert(plan.prior_manifest_sha256 === null, "PRIOR_MANIFEST_MISMATCH", "Initial activation may not claim a prior installed manifest");
    else assertHash(plan.prior_manifest_sha256, "plan.prior_manifest_sha256");
    if (plan.repair_mode !== undefined) {
      assert(plan.requested_operation === "ROLLBACK", "INVALID_REPAIR_MODE", "Exact manifest drift repair is only valid for a ROLLBACK plan");
      assert(plan.repair_mode?.type === "EXACT_BOUND_MANIFEST_DRIFT_REPAIR", "INVALID_REPAIR_MODE", "Drift repair mode is invalid");
      assert(plan.repair_mode.restores_exact_bound_manifest === true, "INVALID_REPAIR_MODE", "Drift repair must restore the exact bound manifest");
      assert(plan.repair_mode.current_state_must_match_expected_prior === true, "INVALID_REPAIR_MODE", "Drift repair must bind every write to the observed prior hash");
      assert(plan.repair_mode.canonical_installed_manifest_sha256 === plan.prior_manifest_sha256, "INVALID_REPAIR_MODE", "Drift repair canonical manifest does not match the bound prior manifest");
      assert(plan.installed_manifest_sha256 === plan.prior_manifest_sha256, "DRIFT_REPAIR_TARGET_MISMATCH", "Drift repair may not change the installed manifest");
      const driftedTargets = plan.artifacts
        .filter((item) => item.expected_prior_sha256 !== item.proposed_sha256)
        .map((item) => item.target)
        .sort();
      assert(driftedTargets.length > 0, "DRIFT_REPAIR_NOT_REQUIRED", "Drift repair requires at least one exact observed hash mismatch");
      assert(canonicalJson(plan.repair_mode.drifted_targets) === canonicalJson(driftedTargets), "INVALID_REPAIR_MODE", "Drift repair targets do not match the exact observed hash mismatches");
    }
  } else {
    assert(plan.repair_mode === undefined, "INVALID_REPAIR_MODE", "Removal plans may not carry drift repair mode");
    assert(plan.installed_manifest_sha256 === null, "PLAN_MANIFEST_MISMATCH", "Removal plan may not propose a new installed manifest");
    assertHash(plan.prior_manifest_sha256, "plan.prior_manifest_sha256");
  }
  return { adapter, plan_hash: plan.plan_hash };
}

function forbiddenContentReason(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const reason = forbiddenContentReason(value[index], `${path}[${index}]`);
      if (reason) return reason;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/^(secret|secrets|credential|credentials|customer_data|raw_project_source|private_prompt|devpack)$/i.test(key)) {
        return `${path}.${key}`;
      }
      const reason = forbiddenContentReason(child, `${path}.${key}`);
      if (reason) return reason;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  if (/LDP:FULL|MASTER BOS INTERNALS|FULL DEVPACK|PRIVATE PROMPTS?/i.test(value)) return path;
  return null;
}

function assertPublicSafe(value) {
  const reason = forbiddenContentReason(value);
  assert(!reason, "FORBIDDEN_CONTENT", "Public project governance content crossed the public-safe boundary", { path: reason });
}

function adapterFor(discovery) {
  assert(discovery?.status === "ADAPTER_DISCOVERED" || discovery?.status === "LIMITED_ADAPTER_DISCOVERED", "DISCOVERY_REQUIRED", "A successful read-only adapter discovery is required");
  const adapter = ADAPTERS[discovery.adapter_id];
  assert(adapter && adapter.environment === discovery.environment, "ADAPTER_MISMATCH", "Discovery environment does not match its adapter");
  if (adapter === ADAPTERS.remote_no_write) {
    assert(discovery.status === "LIMITED_ADAPTER_DISCOVERED", "REMOTE_EVIDENCE_REQUIRED", "Remote projection requires adequate project-visible evidence");
  }
  return adapter;
}

function targetFor(adapter, filename) {
  return `${adapter.root}/${filename}`;
}

function assertTarget(adapter, target) {
  assert(typeof target === "string" && !target.startsWith("/") && !target.split("/").includes(".."), "TARGET_NOT_ALLOWLISTED", "Governance artifact target is unsafe", { target });
  assert(target.startsWith(`${adapter.root}/`), "TARGET_NOT_ALLOWLISTED", "Governance artifact is outside the adapter projection root", { target, root: adapter.root });
  assert(!target.startsWith(".bos/") && !target.includes("/.bos/"), "PRIVATE_TARGET_FORBIDDEN", "Public governance may not write a private BOS target", { target });
}

function validateAuthority(discovery, authority) {
  assert(authority?.source === discovery.source_authority, "SOURCE_AUTHORITY_MISMATCH", "Source authority changed after discovery");
  assert(authority?.deployment === discovery.deployment_authority, "DEPLOYMENT_AUTHORITY_MISMATCH", "Deployment authority changed after discovery");
}

function requireAdapterContext(adapter, context = {}) {
  const normalized = {};
  if (adapter === ADAPTERS.github_repository) {
    assert(typeof context.repository_ref === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository_ref), "INVALID_IDENTITY", "adapter_context.repository_ref is missing or invalid");
    assert(typeof context.target_branch === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(context.target_branch) && !context.target_branch.includes(".."), "GITHUB_BRANCH_REQUIRED", "GitHub governance requires an exact safe target branch");
    assert(typeof context.expected_head_sha === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(context.expected_head_sha), "GITHUB_HEAD_REQUIRED", "GitHub governance requires an exact expected head commit");
    Object.assign(normalized, { repository_ref: context.repository_ref, target_branch: context.target_branch, expected_head_sha: context.expected_head_sha });
  }
  if (isBase44Adapter(adapter)) {
    assertId(context.app_id, "adapter_context.app_id");
    assertId(context.expected_app_revision, "adapter_context.expected_app_revision");
    Object.assign(normalized, { app_id: context.app_id, expected_app_revision: context.expected_app_revision });
  }
  if (adapter === ADAPTERS.remote_no_write) {
    assert(context.project_visible_remote_evidence === true, "REMOTE_EVIDENCE_REQUIRED", "Remote projection requires project-visible evidence");
    assertId(context.remote_evidence_provider_id, "adapter_context.remote_evidence_provider_id");
    Object.assign(normalized, { project_visible_remote_evidence: true, remote_evidence_provider_id: context.remote_evidence_provider_id });
  }
  return normalized;
}

function artifact({ id, target, role, operation, content, prior }) {
  return {
    artifact_id: id,
    target,
    role,
    operation,
    media_type: "application/json",
    proposed_sha256: content === null ? null : sha256(content),
    proposed_bytes: content === null ? 0 : Buffer.byteLength(content),
    proposed_content: content,
    expected_prior_sha256: prior ?? null,
  };
}

function artifactPermission(artifactItem, adapter) {
  const action = artifactItem.operation === "DELETE" ? "DELETE"
    : artifactItem.operation === "REMOTE_DETACH" ? "DETACH"
      : artifactItem.operation === "REMOTE_REGISTER" ? "BIND"
        : artifactItem.operation;
  return { action, resource: artifactItem.target, reason: adapter.permission };
}

function expectedPrior(target, input, required) {
  const value = input.expected_prior_sha256?.[target] ?? null;
  if (required) assertHash(value, `expected_prior_sha256.${target}`);
  else assertHash(value, `expected_prior_sha256.${target}`, true);
  return value;
}

function validateInstalledManifest(manifest, adapter, input) {
  assert(manifest?.schema === "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_MANIFEST_V1", "INSTALLED_MANIFEST_REQUIRED", "A current installed public manifest is required");
  assert(manifest.project_ref === input.project_ref && manifest.project_binding_id === input.project_binding_id, "PROJECT_SCOPE_MISMATCH", "Installed manifest belongs to a different project or binding");
  assert(manifest.adapter_id === input.discovery.adapter_id, "ADAPTER_MISMATCH", "Installed manifest belongs to a different environment adapter");
  assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length === 2, "INSTALLED_MANIFEST_INCOMPLETE", "Installed manifest must contain the exact binding and projection artifacts");
  const roles = manifest.artifacts.map((item) => item.role).sort();
  const bindingRole = isBase44Adapter(adapter) ? "AICONTROL_BINDING" : adapter === ADAPTERS.remote_no_write ? "REMOTE_EVIDENCE" : "PROJECT_IDENTITY";
  assert(JSON.stringify(roles) === JSON.stringify([bindingRole, "GOVERNANCE_PROJECTION"].sort()), "INSTALLED_MANIFEST_INCOMPLETE", "Installed manifest roles are incomplete or unexpected");
  for (const item of manifest.artifacts) {
    assertTarget(adapter, item.target);
    assertHash(item.sha256, `installed_manifest.${item.target}.sha256`);
    assert(Number.isInteger(item.bytes) && item.bytes > 0 && item.removable === true, "INSTALLED_MANIFEST_INVALID", "Installed manifest artifact metadata is invalid", { target: item.target });
  }
  assertPublicSafe(manifest);
  return manifest;
}

export function createProjectGovernancePlan(input = {}) {
  const operation = input.requested_operation ?? "ACTIVATE";
  assert(["ACTIVATE", "UPDATE", "ROLLBACK", "REMOVE"].includes(operation), "INVALID_OPERATION", "Unsupported governance operation");
  assertId(input.platform_installation_id, "platform_installation_id");
  assertId(input.project_id, "project_id");
  assertId(input.project_ref, "project_ref");
  assertId(input.project_binding_id, "project_binding_id");
  assert(input.discovery?.project_ref === input.project_ref, "PROJECT_SCOPE_MISMATCH", "Discovery belongs to a different project");
  const adapter = adapterFor(input.discovery);
  validateAuthority(input.discovery, input.authority);
  const adapterContext = requireAdapterContext(adapter, input.adapter_context);
  const createdAt = new Date(input.created_at);
  const expiresAt = new Date(input.expires_at);
  assert(validPlanWindow(input), "INVALID_PLAN_WINDOW", "Plan timestamps must form a valid approval window");

  const bindingTarget = targetFor(adapter, "binding.json");
  const projectionTarget = targetFor(adapter, "project-governance.json");
  const manifestTarget = targetFor(adapter, "manifest.json");
  for (const target of [bindingTarget, projectionTarget, manifestTarget]) assertTarget(adapter, target);

  let artifacts;
  let repairMode;
  let priorManifestSha256 = null;
  let installedManifestSha256 = null;
  if (operation === "REMOVE") {
    const manifest = validateInstalledManifest(input.installed_manifest, adapter, input);
    priorManifestSha256 = sha256(exactJson(manifest));
    const owned = [...manifest.artifacts.map((item) => ({ target: item.target, hash: input.expected_prior_sha256?.[item.target], id: item.artifact_id, role: item.role })), { target: manifestTarget, hash: input.expected_prior_sha256?.[manifestTarget], id: "manifest", role: "MANIFEST" }];
    artifacts = owned.map((item) => {
      assertTarget(adapter, item.target);
      assertHash(item.hash, `installed_manifest.${item.target}.sha256`);
      return artifact({ id: item.id, target: item.target, role: item.role, operation: adapter.operations.remove, content: null, prior: item.hash });
    });
  } else {
    const replacing = operation !== "ACTIVATE";
    const priorManifest = replacing ? validateInstalledManifest(input.installed_manifest, adapter, input) : null;
    priorManifestSha256 = priorManifest ? sha256(exactJson(priorManifest)) : null;
    const writeOperation = replacing ? adapter.operations.replace : adapter.operations.create;
    const binding = {
      schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_BINDING_V1",
      platform_installation_id: input.platform_installation_id,
      project_binding_id: input.project_binding_id,
      project_id: input.project_id,
      project_ref: input.project_ref,
      resource_uri: input.resource_uri,
      adapter_id: input.discovery.adapter_id,
    };
    assert(typeof input.resource_uri === "string" && input.resource_uri.startsWith("cloudbos://projects/"), "INVALID_RESOURCE_URI", "Project binding requires an exact Cloud BOS project resource URI");
    assertPublicSafe(binding);
    const bindingContent = exactJson(binding);
    const bindingArtifact = artifact({
      id: "binding",
      target: bindingTarget,
      role: isBase44Adapter(adapter) ? "AICONTROL_BINDING" : adapter === ADAPTERS.remote_no_write ? "REMOTE_EVIDENCE" : "PROJECT_IDENTITY",
      operation: writeOperation,
      content: bindingContent,
      prior: expectedPrior(bindingTarget, input, replacing),
    });
    const projection = {
      schema: PROJECTION_SCHEMA,
      projection_version: input.projection_version ?? "1.0.0",
      project_identity: { project_id: input.project_id, project_ref: input.project_ref, environment: adapter.environment },
      authority: { source: input.authority.source, deployment: input.authority.deployment },
      governance: { mode: "PUBLIC_PROJECT_GOVERNANCE", profile: input.governance_profile ?? "PUBLIC_MINIMAL", profile_version: input.profile_version ?? "1.0.0", state: "GOVERNED_ACTIVE" },
      permissions: [...(input.permissions ?? [])],
      capability_currentness: { ...(input.capability_currentness ?? {}) },
      cloud_binding: { platform_installation_id: input.platform_installation_id, project_binding_id: input.project_binding_id, resource_uri: input.resource_uri, status: "VERIFIED" },
      evidence_locations: [...(input.evidence_locations ?? [])],
      manifest: [{ artifact_id: bindingArtifact.artifact_id, target: bindingArtifact.target, role: bindingArtifact.role, sha256: bindingArtifact.proposed_sha256, bytes: bindingArtifact.proposed_bytes, removable: true }],
      lifecycle: {
        update: "Render and approve a new exact UPDATE plan.",
        rollback: "Render and approve an exact ROLLBACK plan from a retained verified version.",
        removal: "Render and approve an exact manifest-owned REMOVE plan.",
        drift_detection: "Read back every manifest hash; fail closed on missing, changed, or unreadable evidence.",
      },
    };
    projection.projection_hash = projectionHash(projection);
    assertPublicSafe(projection);
    const projectionContent = exactJson(projection);
    const projectionArtifact = artifact({ id: "projection", target: projectionTarget, role: "GOVERNANCE_PROJECTION", operation: writeOperation, content: projectionContent, prior: expectedPrior(projectionTarget, input, replacing) });
    const externalManifest = {
      schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_MANIFEST_V1",
      manifest_version: "1.0.0",
      project_ref: input.project_ref,
      project_binding_id: input.project_binding_id,
      adapter_id: input.discovery.adapter_id,
      artifacts: [bindingArtifact, projectionArtifact].map((item) => ({ artifact_id: item.artifact_id, target: item.target, role: item.role, sha256: item.proposed_sha256, bytes: item.proposed_bytes, removable: true })),
    };
    assertPublicSafe(externalManifest);
    const manifestContent = exactJson(externalManifest);
    const manifestArtifact = artifact({ id: "manifest", target: manifestTarget, role: "MANIFEST", operation: writeOperation, content: manifestContent, prior: expectedPrior(manifestTarget, input, replacing) });
    installedManifestSha256 = manifestArtifact.proposed_sha256;
    if (replacing) {
      const priorEntries = new Map(priorManifest.artifacts.map((item) => [item.target, item.sha256]));
      const driftRepair = operation === "ROLLBACK" && input.drift_repair === true;
      if (driftRepair) {
        assert(bindingArtifact.proposed_sha256 === priorEntries.get(bindingArtifact.target), "DRIFT_REPAIR_TARGET_MISMATCH", "Drift repair binding content must match the exact bound manifest");
        assert(projectionArtifact.proposed_sha256 === priorEntries.get(projectionArtifact.target), "DRIFT_REPAIR_TARGET_MISMATCH", "Drift repair projection content must match the exact bound manifest");
        assert(manifestArtifact.proposed_sha256 === priorManifestSha256, "DRIFT_REPAIR_TARGET_MISMATCH", "Drift repair manifest content must match the exact bound manifest");
        const driftedTargets = [bindingArtifact, projectionArtifact, manifestArtifact]
          .filter((item) => item.expected_prior_sha256 !== item.proposed_sha256)
          .map((item) => item.target)
          .sort();
        assert(driftedTargets.length > 0, "DRIFT_REPAIR_NOT_REQUIRED", "Drift repair requires at least one exact observed hash mismatch");
        repairMode = {
          type: "EXACT_BOUND_MANIFEST_DRIFT_REPAIR",
          canonical_installed_manifest_sha256: priorManifestSha256,
          drifted_targets: driftedTargets,
          restores_exact_bound_manifest: true,
          current_state_must_match_expected_prior: true,
        };
      } else {
        assert(input.drift_repair !== true, "INVALID_REPAIR_MODE", "Drift repair is only valid for an exact ROLLBACK plan");
        assert(bindingArtifact.expected_prior_sha256 === priorEntries.get(bindingArtifact.target), "PRIOR_MANIFEST_MISMATCH", "Binding prior hash does not match the installed manifest");
        assert(projectionArtifact.expected_prior_sha256 === priorEntries.get(projectionArtifact.target), "PRIOR_MANIFEST_MISMATCH", "Projection prior hash does not match the installed manifest");
        assert(manifestArtifact.expected_prior_sha256 === priorManifestSha256, "PRIOR_MANIFEST_MISMATCH", "Manifest prior hash does not match the installed manifest content");
      }
    }
    artifacts = [bindingArtifact, projectionArtifact, manifestArtifact];
  }

  const seed = canonicalJson({ platform: input.platform_installation_id, project: input.project_ref, binding: input.project_binding_id, operation, created_at: createdAt.toISOString(), artifacts: artifacts.map(({ target, proposed_sha256, expected_prior_sha256 }) => ({ target, proposed_sha256, expected_prior_sha256 })) });
  const plan = {
    schema: PLAN_SCHEMA,
    plan_id: `cbpp_${sha256(seed).slice(0, 24)}`,
    platform_installation_id: input.platform_installation_id,
    project_ref: input.project_ref,
    project_binding_id: input.project_binding_id,
    environment: adapter.environment,
    adapter_id: input.discovery.adapter_id,
    adapter_context: adapterContext,
    requested_operation: operation,
    created_at: createdAt.toISOString(),
    expires_at: isDurablePlan(input) ? input.expires_at : expiresAt.toISOString(),
    ...(isDurablePlan(input) ? { approval_lifecycle: input.approval_lifecycle } : {}),
    zero_write: true,
    requires_approval: true,
    artifacts,
    artifact_manifest_hash: artifactManifestHash(artifacts),
    installed_manifest_sha256: installedManifestSha256,
    prior_manifest_sha256: priorManifestSha256,
    readback_evidence_requirement: EVIDENCE_REQUIREMENTS[input.discovery.adapter_id],
    permissions: artifacts.map((item) => artifactPermission(item, adapter)),
    forbidden_content_check: "PASS",
    preconditions: [
      "ACTIVE_PLATFORM_INSTALLATION",
      "EXACT_PROJECT_BINDING",
      "EXPLICIT_APPROVAL_BOUND_TO_PLAN_HASH",
      "CURRENT_SOURCE_AND_DEPLOYMENT_AUTHORITY",
      "PREWRITE_EXPECTED_STATE_MATCH",
      "POSTWRITE_READBACK_VERIFICATION",
      "SERVER_ISSUED_PLAN_ANCHOR",
      "CURRENT_INSTALLED_MANIFEST_MATCH_FOR_UPDATE_ROLLBACK_OR_REMOVE",
    ],
  };
  if (repairMode) plan.repair_mode = repairMode;
  plan.plan_hash = planHash(plan);
  return plan;
}

function validateApprovedPlan(plan, approval, now, allowedOperations) {
  const { adapter } = validateProjectGovernancePlan(plan);
  assert(approval?.approved === true && approval.plan_hash === plan.plan_hash, "APPROVAL_MISMATCH", "Approval must bind to the exact plan hash");
  assert(approval.platform_installation_id === plan.platform_installation_id && approval.project_ref === plan.project_ref && approval.project_binding_id === plan.project_binding_id, "APPROVAL_SCOPE_MISMATCH", "Approval belongs to a different platform or project");
  assert(planIsCurrent(plan, now), "PLAN_EXPIRED", "The approved governance plan has expired");
  assert(allowedOperations.includes(plan.requested_operation), "INVALID_OPERATION", "Plan operation is not valid for this lifecycle action");
  return adapter;
}

function unmanagedDigest(adapter, store) {
  if (typeof store.snapshot !== "function") return null;
  const entries = Object.entries(store.snapshot()).filter(([target]) => !target.startsWith(`${adapter.root}/`)).sort(([a], [b]) => a.localeCompare(b));
  return sha256(canonicalJson(entries));
}

async function assertExpectedState(plan, store, adapter) {
  for (const item of plan.artifacts) {
    assertTarget(adapter, item.target);
    const current = await store.read(item.target);
    const currentHash = current === null ? null : sha256(current);
    assert(currentHash === item.expected_prior_sha256, "PREWRITE_STATE_MISMATCH", "An artifact changed after the plan was rendered", { target: item.target, expected: item.expected_prior_sha256, actual: currentHash });
  }
}

export async function verifyProjectGovernance({ plan, store, verified_at = new Date().toISOString() }) {
  const { adapter } = validateProjectGovernancePlan(plan);
  const projectionArtifact = plan.artifacts.find((item) => item.role === "GOVERNANCE_PROJECTION");
  const manifestArtifact = plan.artifacts.find((item) => item.role === "MANIFEST");
  assert(projectionArtifact && manifestArtifact, "READBACK_INCOMPLETE", "Projection and manifest artifacts are required for verification");
  const manifestChecks = [];
  for (const item of plan.artifacts) {
    const actual = await store.read(item.target);
    const actualHash = actual === null ? null : sha256(actual);
    manifestChecks.push({
      target: item.target,
      expected_sha256: item.proposed_sha256,
      actual_sha256: actualHash,
      status: actual === null ? "MISSING" : actualHash === item.proposed_sha256 ? "MATCH" : "DRIFTED",
    });
  }
  let projection = null;
  let forbidden = "PASS";
  try {
    projection = JSON.parse((await store.read(projectionArtifact.target)) ?? "null");
    assertPublicSafe(projection);
    if (projection?.projection_hash !== projectionHash(projection)) forbidden = "FAIL";
  } catch {
    forbidden = "FAIL";
  }
  const bindingMatches = projection?.project_identity?.project_ref === plan.project_ref
    && projection?.cloud_binding?.platform_installation_id === plan.platform_installation_id;
  const allMatch = manifestChecks.every((item) => item.status === "MATCH");
  const evidence = typeof store.readbackEvidence === "function"
    ? await store.readbackEvidence({ plan, manifest_checks: manifestChecks })
    : null;
  const evidenceVerified = evidence?.evidence_class === plan.readback_evidence_requirement
    && evidence?.independent === true
    && typeof evidence?.verifier === "string"
    && ID_PATTERN.test(evidence.verifier)
    && typeof evidence?.evidence_ref === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/.test(evidence.evidence_ref)
    && !evidence.evidence_ref.includes("..")
    && typeof evidence?.version_ref === "string"
    && evidence.version_ref.length > 0
    && evidence.version_ref.length <= 256;
  const governed = allMatch && forbidden === "PASS" && bindingMatches && evidenceVerified;
  const readback = {
    schema: READBACK_SCHEMA,
    readback_id: `cbr_${sha256(`${plan.plan_hash}:${verified_at}`).slice(0, 24)}`,
    approved_plan_hash: plan.plan_hash,
    project_ref: plan.project_ref,
    project_binding_id: projection?.cloud_binding?.project_binding_id ?? "UNVERIFIED",
    adapter_id: plan.adapter_id,
    verified_at: new Date(verified_at).toISOString(),
    projection_hash: projection?.projection_hash ?? "0".repeat(64),
    artifact_manifest_hash: plan.artifact_manifest_hash,
    installed_manifest_sha256: plan.installed_manifest_sha256,
    artifact_count: plan.artifacts.length,
    evidence: evidenceVerified ? evidence : {
      evidence_class: plan.readback_evidence_requirement,
      verifier: "UNVERIFIED",
      evidence_ref: "UNVERIFIED",
      version_ref: "UNVERIFIED",
      independent: false,
    },
    manifest_checks: manifestChecks,
    binding_check: bindingMatches ? "VERIFIED" : "MISMATCH",
    forbidden_content_check: forbidden,
    application_preservation_check: "NOT_APPLICABLE",
    governance_state: governed ? "GOVERNED_ACTIVE" : "STALE_OR_DRIFTED",
    acceptance_status: governed ? "COMPLETE_VERIFIED" : "FAILED_SYNC_VERIFICATION",
  };
  readback.readback_hash = readbackHash(readback);
  return readback;
}

export async function resumeProjectGovernanceActivation({ plan, approval, store, now = new Date().toISOString() }) {
  validateApprovedPlan(plan, approval, now, ["ACTIVATE", "UPDATE", "ROLLBACK"]);
  const readback = await verifyProjectGovernance({ plan, store, verified_at: now });
  assert(readback.governance_state === "GOVERNED_ACTIVE" && readback.acceptance_status === "COMPLETE_VERIFIED",
    "RESUME_EXACT_READBACK_REQUIRED", "Resume cannot rewrite missing or drifted governance");
  assert(typeof store.verifyApplicationPreserved === "function" && await store.verifyApplicationPreserved({ plan }) === true,
    "RESUME_APPLICATION_PRESERVATION_REQUIRED", "The adapter must verify that this resume preserved the application");
  // This action performs zero writes. Exact current artifact and adapter checks
  // allow cloud confirmation to resume; they do not assert prior app history.
  readback.application_preservation_check = "PASS";
  readback.readback_hash = readbackHash(readback);
  return readback;
}

export async function activateProjectGovernance({ plan, approval, store, now = new Date().toISOString() }) {
  const adapter = validateApprovedPlan(plan, approval, now, ["ACTIVATE", "UPDATE", "ROLLBACK"]);
  assert(store && typeof store.read === "function" && typeof store.write === "function", "ADAPTER_UNAVAILABLE", "A readable and writable governance adapter is required");
  await assertExpectedState(plan, store, adapter);
  const applicationBefore = unmanagedDigest(adapter, store);
  const rollback = [];
  try {
    for (const item of plan.artifacts) {
      assert(item.proposed_content !== null, "INVALID_PLAN", "Activation artifacts require exact proposed content");
      rollback.push([item.target, await store.read(item.target)]);
      await store.write(item.target, item.proposed_content);
    }
    if (typeof store.commit === "function") await store.commit({ plan });
  } catch (error) {
    if (typeof store.rollback === "function") {
      await store.rollback({ plan });
    } else {
      for (const [target, prior] of rollback.reverse()) {
        if (prior === null) await store.delete(target);
        else await store.write(target, prior);
      }
    }
    throw new ProjectGovernanceError("WRITE_FAILED_ROLLED_BACK", "Governance activation failed and completed writes were rolled back", { cause: error.message });
  }
  const readback = await verifyProjectGovernance({ plan, store, verified_at: now });
  const applicationAfter = unmanagedDigest(adapter, store);
  const adapterPreserved = applicationBefore === null && typeof store.verifyApplicationPreserved === "function"
    ? await store.verifyApplicationPreserved({ plan })
    : null;
  if ((applicationBefore !== null && applicationBefore !== applicationAfter) || adapterPreserved === false) {
    readback.application_preservation_check = "FAIL";
    readback.governance_state = "STALE_OR_DRIFTED";
    readback.acceptance_status = "FAILED_SYNC_VERIFICATION";
  } else {
    readback.application_preservation_check = applicationBefore === null ? (adapterPreserved === true ? "PASS" : "NOT_APPLICABLE") : "PASS";
  }
  readback.readback_hash = readbackHash(readback);
  return readback;
}

export async function removeProjectGovernance({ plan, approval, store, now = new Date().toISOString(), preserved_application_targets = [] }) {
  const adapter = validateApprovedPlan(plan, approval, now, ["REMOVE"]);
  assert(store && typeof store.read === "function" && typeof store.delete === "function", "ADAPTER_UNAVAILABLE", "A readable and removable governance adapter is required");
  await assertExpectedState(plan, store, adapter);
  const applicationBefore = unmanagedDigest(adapter, store);
  const rollback = [];
  try {
    for (const item of plan.artifacts) {
      assertTarget(adapter, item.target);
      rollback.push([item.target, await store.read(item.target)]);
      await store.delete(item.target);
    }
    if (typeof store.commit === "function") await store.commit({ plan });
  } catch (error) {
    if (typeof store.rollback === "function") {
      await store.rollback({ plan });
    } else {
      for (const [target, prior] of rollback.reverse()) if (prior !== null) await store.write(target, prior);
    }
    throw new ProjectGovernanceError("REMOVE_FAILED_ROLLED_BACK", "Governance removal failed and completed changes were rolled back", { cause: error.message });
  }
  const removed = [];
  for (const item of plan.artifacts) if ((await store.read(item.target)) === null) removed.push(item.target);
  const applicationAfter = unmanagedDigest(adapter, store);
  const adapterPreserved = applicationBefore === null && typeof store.verifyApplicationPreserved === "function"
    ? await store.verifyApplicationPreserved({ plan })
    : null;
  const preserved = applicationBefore === null ? adapterPreserved === true : applicationBefore === applicationAfter;
  assert(removed.length === plan.artifacts.length, "FAILED_SYNC_VERIFICATION", "One or more manifest-owned governance artifacts remain after removal");
  assert(preserved, "APPLICATION_PRESERVATION_FAILED", "Removal changed application-owned content");
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_GOVERNANCE_REMOVAL_V1",
    ...(isDurablePlan(plan) ? { verified_at: new Date().toISOString(), evidence: await store.readbackEvidence({ plan }) } : {}),
    removal_id: `cbrm_${sha256(`${plan.plan_hash}:${now}`).slice(0, 24)}`,
    approved_plan_hash: plan.plan_hash,
    project_ref: plan.project_ref,
    project_binding_id: approval.project_binding_id,
    adapter_id: plan.adapter_id,
    manifest_owned_targets: plan.artifacts.map((item) => item.target),
    removed_targets: removed,
    preserved_application_targets,
    binding_status: "DETACHED",
    post_removal_state: "DETACHED_OR_REMOVED",
    application_preservation_check: "PASS",
    acceptance_status: "COMPLETE_VERIFIED",
  };
}

export function createMemoryProjectStore(initial = {}, evidence = {}) {
  const files = new Map(Object.entries(initial));
  return {
    async read(target) { return files.has(target) ? files.get(target) : null; },
    async write(target, content) { files.set(target, content); },
    async delete(target) { files.delete(target); },
    snapshot() { return Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b))); },
    async readbackEvidence({ plan }) {
      return {
        evidence_class: evidence.evidence_class ?? EVIDENCE_REQUIREMENTS[plan.adapter_id],
        verifier: evidence.verifier ?? "TEST_MEMORY_ADAPTER",
        evidence_ref: evidence.evidence_ref ?? `fixture_${plan.adapter_id}`,
        version_ref: evidence.version_ref ?? "fixture-v1",
        independent: evidence.independent === true,
      };
    },
  };
}

export function installedManifestFromPlan(plan) {
  const item = plan.artifacts.find((artifactItem) => artifactItem.role === "MANIFEST");
  assert(item?.proposed_content, "INSTALLED_MANIFEST_REQUIRED", "Plan contains no install manifest");
  return JSON.parse(item.proposed_content);
}

export function expectedHashesFromPlan(plan) {
  return Object.fromEntries(plan.artifacts.map((item) => [item.target, item.proposed_sha256]));
}
