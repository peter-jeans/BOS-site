import { createHash } from "node:crypto";

const ROOT = "CLOUD_BOS_PROJECT_VISIBLE_REMOTE_PROJECTION";
const TARGETS = Object.freeze([
  `${ROOT}/binding.json`,
  `${ROOT}/project-governance.json`,
  `${ROOT}/manifest.json`,
]);
const TARGET_SET = new Set(TARGETS);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const MAX_BYTES = 256 * 1024;

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identity(value, code) {
  if (typeof value !== "string" || !ID.test(value) || value.includes("..")) fail(code);
  return value;
}

function exactTarget(target) {
  if (!TARGET_SET.has(target)) fail("CLOUDBOS_REMOTE_TARGET_NOT_EXACTLY_ALLOWLISTED", { target });
  return target;
}

function contentValue(content, target) {
  if (content !== null && (typeof content !== "string" || Buffer.byteLength(content) > MAX_BYTES)) fail("CLOUDBOS_REMOTE_ARTIFACT_INVALID", { target });
  return content;
}

function exactChanges(changes) {
  if (!Array.isArray(changes) || changes.length !== TARGETS.length) fail("CLOUDBOS_REMOTE_EXACT_CHANGE_SET_REQUIRED");
  const seen = new Set();
  return changes.map(({ target, content }) => {
    exactTarget(target);
    if (seen.has(target)) fail("CLOUDBOS_REMOTE_DUPLICATE_TARGET", { target });
    seen.add(target);
    contentValue(content, target);
    return {
      target,
      content,
      sha256: content === null ? null : sha256(content),
      bytes: content === null ? 0 : Buffer.byteLength(content),
    };
  }).sort((left, right) => left.target.localeCompare(right.target));
}

function validateVisibilityUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail("CLOUDBOS_REMOTE_VISIBILITY_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) fail("CLOUDBOS_REMOTE_VISIBILITY_URL_INVALID");
  return url.href;
}

function validateIndex(index, expected) {
  if (index?.schema !== "BOS_CLOUDBOS_PUBLIC_PROJECT_VISIBLE_REMOTE_INDEX_V1") fail("CLOUDBOS_REMOTE_INDEX_INVALID");
  if (index.provider_id !== expected.provider_id
    || index.project_ref !== expected.project_ref
    || index.projection_revision !== expected.projection_revision
    || index.plan_hash !== expected.plan_hash
    || index.artifact_manifest_hash !== expected.artifact_manifest_hash
    || index.authority_channel_id !== expected.authority_channel_id
    || index.project_view_channel_id !== expected.project_view_channel_id
    || index.visibility_scope !== "PROJECT_CONTEXT") fail("CLOUDBOS_REMOTE_INDEX_SCOPE_MISMATCH");
  validateVisibilityUrl(index.visibility_url);
  const observedAt = new Date(index.observed_at).valueOf();
  const expiresAt = new Date(index.expires_at).valueOf();
  const now = Date.now();
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt > now + 30_000 || expiresAt <= now || expiresAt <= observedAt) {
    fail("CLOUDBOS_REMOTE_INDEX_STALE");
  }
  if (!Array.isArray(index.artifacts)) fail("CLOUDBOS_REMOTE_INDEX_INVALID");
  const artifacts = index.artifacts.map((item) => {
    exactTarget(item?.target);
    if (!HASH.test(item.sha256) || !Number.isInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_BYTES) fail("CLOUDBOS_REMOTE_INDEX_ARTIFACT_INVALID");
    return { target: item.target, sha256: item.sha256, bytes: item.bytes };
  }).sort((left, right) => left.target.localeCompare(right.target));
  const expectedArtifacts = expected.changes.filter(({ content }) => content !== null).map(({ target, sha256: digest, bytes }) => ({ target, sha256: digest, bytes }));
  if (canonicalJson(artifacts) !== canonicalJson(expectedArtifacts)) fail("CLOUDBOS_REMOTE_INDEX_ARTIFACT_MISMATCH");
  const expectedState = expectedArtifacts.length ? "GOVERNED_ACTIVE" : "DETACHED_OR_REMOVED";
  if (index.governance_state !== expectedState) fail("CLOUDBOS_REMOTE_INDEX_STATE_MISMATCH");
  const unsigned = structuredClone(index);
  delete unsigned.index_sha256;
  const digest = sha256(canonicalJson(unsigned));
  if (index.index_sha256 !== digest) fail("CLOUDBOS_REMOTE_INDEX_HASH_MISMATCH");
  return { index, artifacts, index_sha256: digest };
}

export function createRemoteProjectVisibleProjectionApi({
  provider_id,
  authority_channel_id,
  project_view_channel_id,
  authority_api,
  project_view_api,
  verify_attestation,
} = {}) {
  identity(provider_id, "CLOUDBOS_REMOTE_PROVIDER_INVALID");
  identity(authority_channel_id, "CLOUDBOS_REMOTE_AUTHORITY_CHANNEL_INVALID");
  identity(project_view_channel_id, "CLOUDBOS_REMOTE_PROJECT_VIEW_CHANNEL_INVALID");
  if (authority_channel_id === project_view_channel_id || authority_api === project_view_api) fail("CLOUDBOS_REMOTE_INDEPENDENT_CHANNEL_REQUIRED");
  if (typeof authority_api?.readArtifact !== "function" || typeof authority_api?.registerProjection !== "function") fail("CLOUDBOS_REMOTE_AUTHORITY_API_MISSING");
  if (typeof project_view_api?.readIndex !== "function" || typeof project_view_api?.readArtifact !== "function") fail("CLOUDBOS_REMOTE_PROJECT_VIEW_API_MISSING");
  if (authority_api.readArtifact === project_view_api.readArtifact) fail("CLOUDBOS_REMOTE_INDEPENDENT_CHANNEL_REQUIRED");
  if (typeof verify_attestation !== "function") fail("CLOUDBOS_REMOTE_ATTESTATION_VERIFIER_REQUIRED");
  let lastMutation = null;

  async function readProjection({ project_ref, provider_id: observedProvider, projection_revision, target }) {
    identity(project_ref, "CLOUDBOS_REMOTE_PROJECT_REF_INVALID");
    if (observedProvider !== provider_id) fail("CLOUDBOS_REMOTE_PROVIDER_SCOPE_MISMATCH");
    identity(projection_revision, "CLOUDBOS_REMOTE_REVISION_INVALID");
    exactTarget(target);
    const result = await authority_api.readArtifact({ project_ref, provider_id, projection_revision, target });
    if (result === null || result?.content === null) return null;
    return { content: contentValue(result?.content, target) };
  }

  async function registerProjection({ project_ref, provider_id: observedProvider, expected_projection_revision, plan_hash, artifact_manifest_hash, changes }) {
    identity(project_ref, "CLOUDBOS_REMOTE_PROJECT_REF_INVALID");
    if (observedProvider !== provider_id) fail("CLOUDBOS_REMOTE_PROVIDER_SCOPE_MISMATCH");
    identity(expected_projection_revision, "CLOUDBOS_REMOTE_REVISION_INVALID");
    if (!HASH.test(plan_hash) || !HASH.test(artifact_manifest_hash)) fail("CLOUDBOS_REMOTE_PLAN_BINDING_INVALID");
    const normalized = exactChanges(changes);
    const result = await authority_api.registerProjection({
      project_ref,
      provider_id,
      authority_channel_id,
      expected_projection_revision,
      plan_hash,
      artifact_manifest_hash,
      changes: normalized.map(({ target, content }) => ({ target, content })),
    });
    if (!result?.success || typeof result.version_ref !== "string") fail("CLOUDBOS_REMOTE_REGISTRATION_FAILED");
    identity(result.version_ref, "CLOUDBOS_REMOTE_REVISION_INVALID");
    lastMutation = {
      project_ref,
      provider_id,
      projection_revision: result.version_ref,
      plan_hash,
      artifact_manifest_hash,
      authority_channel_id,
      project_view_channel_id,
      changes: normalized,
    };
    return { success: true, version_ref: result.version_ref };
  }

  async function verifyProjectVisibleProjection({ project_ref, provider_id: observedProvider, projection_revision, plan_hash, artifact_manifest_hash }) {
    if (observedProvider !== provider_id
      || !lastMutation
      || lastMutation.project_ref !== project_ref
      || lastMutation.projection_revision !== projection_revision
      || lastMutation.plan_hash !== plan_hash
      || lastMutation.artifact_manifest_hash !== artifact_manifest_hash) return { verified: false, reason: "REMOTE_MUTATION_BINDING_MISMATCH" };
    try {
      const result = await project_view_api.readIndex({ project_ref, provider_id, projection_revision, project_view_channel_id });
      if (!result || typeof result !== "object" || !result.index || result.attestation === undefined) fail("CLOUDBOS_REMOTE_PROJECT_VISIBLE_INDEX_MISSING");
      const validated = validateIndex(result.index, lastMutation);
      const attestation = await verify_attestation({
        provider_id,
        project_ref,
        projection_revision,
        index_sha256: validated.index_sha256,
        index: result.index,
        attestation: result.attestation,
        authority_channel_id,
        project_view_channel_id,
      });
      if (attestation?.verified !== true
        || attestation.index_sha256 !== validated.index_sha256
        || typeof attestation.verifier_ref !== "string"
        || !ID.test(attestation.verifier_ref)) fail("CLOUDBOS_REMOTE_ATTESTATION_INVALID");
      for (const change of lastMutation.changes) {
        const visible = await project_view_api.readArtifact({ project_ref, provider_id, projection_revision, target: change.target, project_view_channel_id });
        if (change.content === null) {
          if (visible !== null && visible?.content !== null) fail("CLOUDBOS_REMOTE_REMOVAL_STILL_VISIBLE");
        } else if (!visible || typeof visible.content !== "string"
          || Buffer.byteLength(visible.content) !== change.bytes
          || sha256(visible.content) !== change.sha256) fail("CLOUDBOS_REMOTE_PROJECT_VISIBLE_CONTENT_MISMATCH");
      }
      return {
        verified: true,
        adequate_project_visible_evidence: true,
        independent_channels: true,
        attestation_verifier_ref: attestation.verifier_ref,
        index_sha256: validated.index_sha256,
        governance_state: result.index.governance_state,
      };
    } catch (error) {
      return { verified: false, reason: error?.code || "REMOTE_PROJECT_VISIBLE_READBACK_FAILED" };
    }
  }

  return Object.freeze({ readProjection, registerProjection, verifyProjectVisibleProjection });
}

export const REMOTE_PROJECT_VISIBLE_TARGETS = TARGETS;
export { canonicalJson as canonicalRemoteEvidenceJson, sha256 as remoteEvidenceSha256 };
