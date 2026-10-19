import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_ARTIFACT_BYTES = 256 * 1024;
const LOCAL_ROOT = ".cloudbos/governance";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function safeTarget(target, expectedRoot) {
  if (typeof target !== "string"
    || target.startsWith("/")
    || target.split("/").includes("..")
    || !target.startsWith(`${expectedRoot}/`)) fail("CLOUDBOS_ADAPTER_TARGET_NOT_ALLOWLISTED");
  return target;
}

function safeIdentity(value, code, pattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/) {
  if (typeof value !== "string" || !pattern.test(value) || value.includes("..")) fail(code);
  return value;
}

async function assertNoSymlinkPath(projectRoot, absoluteTarget, includeTarget = true) {
  const relative = path.relative(projectRoot, absoluteTarget);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("CLOUDBOS_LOCAL_TARGET_ESCAPES_PROJECT");
  const segments = relative.split(path.sep);
  const limit = includeTarget ? segments.length : segments.length - 1;
  let current = projectRoot;
  for (let index = 0; index < limit; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink()) fail("CLOUDBOS_LOCAL_SYMLINK_DENIED");
      if (index < segments.length - 1 && !info.isDirectory()) fail("CLOUDBOS_LOCAL_PARENT_NOT_DIRECTORY");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      break;
    }
  }
}

export async function createLocalRepositoryGovernanceStore({ project_root, project_ref, version_ref = "working-tree" } = {}) {
  const projectRoot = await fs.realpath(safeIdentity(project_root, "CLOUDBOS_LOCAL_PROJECT_ROOT_INVALID", /^\/.{1,4095}$/));
  safeIdentity(project_ref, "CLOUDBOS_LOCAL_PROJECT_REF_INVALID", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  const touched = new Set();

  function resolve(target) {
    safeTarget(target, LOCAL_ROOT);
    const absolute = path.resolve(projectRoot, target);
    if (!absolute.startsWith(`${projectRoot}${path.sep}`)) fail("CLOUDBOS_LOCAL_TARGET_ESCAPES_PROJECT");
    return absolute;
  }

  return {
    adapter_id: "local_repository",
    async read(target) {
      const absolute = resolve(target);
      await assertNoSymlinkPath(projectRoot, absolute);
      try {
        const info = await fs.lstat(absolute);
        if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) fail("CLOUDBOS_LOCAL_ARTIFACT_INVALID");
        return await fs.readFile(absolute, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(target, content) {
      if (typeof content !== "string" || Buffer.byteLength(content) > MAX_ARTIFACT_BYTES) fail("CLOUDBOS_LOCAL_ARTIFACT_INVALID");
      const absolute = resolve(target);
      const parent = path.dirname(absolute);
      await assertNoSymlinkPath(projectRoot, parent);
      await fs.mkdir(parent, { recursive: true, mode: 0o700 });
      await assertNoSymlinkPath(projectRoot, parent);
      await assertNoSymlinkPath(projectRoot, absolute);
      const temporary = path.join(parent, `.cloudbos-tmp-${randomUUID()}`);
      let handle;
      try {
        handle = await fs.open(temporary, "wx", 0o600);
        await handle.writeFile(content, "utf8");
        await handle.sync();
        await handle.close();
        handle = null;
        await assertNoSymlinkPath(projectRoot, parent);
        await fs.rename(temporary, absolute);
      } catch (error) {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(temporary).catch(() => {});
        throw error;
      }
      touched.add(target);
    },
    async delete(target) {
      const absolute = resolve(target);
      await assertNoSymlinkPath(projectRoot, absolute);
      try {
        const info = await fs.lstat(absolute);
        if (!info.isFile()) fail("CLOUDBOS_LOCAL_ARTIFACT_INVALID");
        await fs.unlink(absolute);
        touched.add(target);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    },
    async verifyApplicationPreserved() {
      return [...touched].every((target) => target.startsWith(`${LOCAL_ROOT}/`));
    },
    async readbackEvidence() {
      return {
        evidence_class: "LOCAL_FILESYSTEM_EXACT_READBACK",
        verifier: "CLOUDBOS_LOCAL_FILESYSTEM_ADAPTER",
        evidence_ref: project_ref,
        version_ref: safeIdentity(version_ref, "CLOUDBOS_LOCAL_VERSION_REF_INVALID"),
        independent: true,
      };
    },
  };
}

function createProviderStore({
  adapter_id,
  projection_root,
  evidence_class,
  verifier,
  evidence_ref,
  initial_version_ref,
  readArtifact,
  applyChanges,
  verifyEvidence,
}) {
  if (typeof readArtifact !== "function" || typeof applyChanges !== "function" || typeof verifyEvidence !== "function") {
    fail("CLOUDBOS_PROVIDER_ADAPTER_CAPABILITY_MISSING");
  }
  const staged = new Map();
  const touched = new Set();
  let versionRef = initial_version_ref;
  let lastEvidenceVerified = false;
  return {
    adapter_id,
    async read(target) {
      safeTarget(target, projection_root);
      if (staged.has(target)) return staged.get(target);
      const result = await readArtifact({ target, version_ref: versionRef });
      if (result === null || result?.content === null) return null;
      if (typeof result?.content !== "string" || Buffer.byteLength(result.content) > MAX_ARTIFACT_BYTES) fail("CLOUDBOS_PROVIDER_READBACK_INVALID");
      return result.content;
    },
    async write(target, content) {
      safeTarget(target, projection_root);
      if (typeof content !== "string" || Buffer.byteLength(content) > MAX_ARTIFACT_BYTES) fail("CLOUDBOS_PROVIDER_ARTIFACT_INVALID");
      staged.set(target, content);
      touched.add(target);
    },
    async delete(target) {
      safeTarget(target, projection_root);
      staged.set(target, null);
      touched.add(target);
    },
    async commit({ plan }) {
      const result = await applyChanges({
        plan_hash: plan.plan_hash,
        artifact_manifest_hash: plan.artifact_manifest_hash,
        expected_version_ref: versionRef,
        changes: [...staged].map(([target, content]) => ({ target, content })),
      });
      if (!result?.success || typeof result.version_ref !== "string" || !result.version_ref) fail("CLOUDBOS_PROVIDER_COMMIT_NOT_VERIFIED");
      versionRef = result.version_ref;
      staged.clear();
      lastEvidenceVerified = false;
    },
    async rollback() { staged.clear(); },
    async verifyApplicationPreserved({ plan } = {}) {
      if (![...touched].every((target) => target.startsWith(`${projection_root}/`))) return false;
      if (lastEvidenceVerified) return true;
      if (!plan) return false;
      const result = await verifyEvidence({
        plan_hash: plan.plan_hash,
        artifact_manifest_hash: plan.artifact_manifest_hash,
        version_ref: versionRef,
        manifest_checks: [],
        application_preservation_only: true,
      });
      lastEvidenceVerified = result?.verified === true;
      return lastEvidenceVerified;
    },
    async readbackEvidence({ plan, manifest_checks }) {
      const result = await verifyEvidence({ plan_hash: plan.plan_hash, artifact_manifest_hash: plan.artifact_manifest_hash, version_ref: versionRef, manifest_checks });
      lastEvidenceVerified = result?.verified === true;
      return {
        evidence_class,
        verifier,
        evidence_ref,
        version_ref: versionRef,
        independent: lastEvidenceVerified,
      };
    },
  };
}

export function createGitHubRepositoryGovernanceStore({ repository_ref, target_branch, expected_head_sha, api } = {}) {
  safeIdentity(repository_ref, "CLOUDBOS_GITHUB_REPOSITORY_INVALID", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  safeIdentity(target_branch, "CLOUDBOS_GITHUB_BRANCH_INVALID", /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/);
  safeIdentity(expected_head_sha, "CLOUDBOS_GITHUB_HEAD_INVALID", /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
  if (typeof api?.readFile !== "function" || typeof api?.applyGovernanceChanges !== "function" || typeof api?.verifyGovernanceCommit !== "function") fail("CLOUDBOS_GITHUB_API_CAPABILITY_MISSING");
  return createProviderStore({
    adapter_id: "github_repository",
    projection_root: LOCAL_ROOT,
    evidence_class: "GITHUB_COMMIT_API_READBACK",
    verifier: "GITHUB_CONTENTS_OR_GIT_DATA_API",
    evidence_ref: `${repository_ref}@${target_branch}`,
    initial_version_ref: expected_head_sha,
    readArtifact: ({ target, version_ref }) => api?.readFile?.({ repository_ref, target_branch, commit_sha: version_ref, target }),
    applyChanges: (input) => api?.applyGovernanceChanges?.({ repository_ref, target_branch, expected_head_sha: input.expected_version_ref, ...input }),
    verifyEvidence: (input) => api?.verifyGovernanceCommit?.({ repository_ref, target_branch, commit_sha: input.version_ref, ...input }),
  });
}

export function createBase44ProjectGovernanceStore({ app_id, expected_app_revision, api } = {}) {
  safeIdentity(app_id, "CLOUDBOS_BASE44_APP_ID_INVALID", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  safeIdentity(expected_app_revision, "CLOUDBOS_BASE44_REVISION_INVALID");
  if (typeof api?.readArtifact !== "function" || typeof api?.applyGovernanceChanges !== "function" || typeof api?.verifyGovernanceArtifacts !== "function") fail("CLOUDBOS_BASE44_API_CAPABILITY_MISSING");
  return createProviderStore({
    adapter_id: "base44_app_governance",
    projection_root: "AICONTROL/CLOUDBOS_PROJECT_GOVERNANCE",
    evidence_class: "BASE44_AICONTROL_API_READBACK",
    verifier: "BASE44_AICONTROL_API",
    evidence_ref: app_id,
    initial_version_ref: expected_app_revision,
    readArtifact: ({ target, version_ref }) => api?.readArtifact?.({ app_id, app_revision: version_ref, target }),
    applyChanges: (input) => api?.applyGovernanceChanges?.({ app_id, expected_app_revision: input.expected_version_ref, ...input }),
    verifyEvidence: (input) => api?.verifyGovernanceArtifacts?.({ app_id, app_revision: input.version_ref, ...input }),
  });
}

export function createRemoteProjectionGovernanceStore({ project_ref, provider_id, expected_projection_revision, api } = {}) {
  safeIdentity(project_ref, "CLOUDBOS_REMOTE_PROJECT_REF_INVALID", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  safeIdentity(provider_id, "CLOUDBOS_REMOTE_PROVIDER_INVALID", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  safeIdentity(expected_projection_revision, "CLOUDBOS_REMOTE_REVISION_INVALID");
  if (typeof api?.readProjection !== "function" || typeof api?.registerProjection !== "function" || typeof api?.verifyProjectVisibleProjection !== "function") fail("CLOUDBOS_REMOTE_API_CAPABILITY_MISSING");
  return createProviderStore({
    adapter_id: "remote_no_write",
    projection_root: "CLOUD_BOS_PROJECT_VISIBLE_REMOTE_PROJECTION",
    evidence_class: "REMOTE_PROJECT_VISIBLE_INDEPENDENT_READBACK",
    verifier: provider_id,
    evidence_ref: project_ref,
    initial_version_ref: expected_projection_revision,
    readArtifact: ({ target, version_ref }) => api?.readProjection?.({ project_ref, provider_id, projection_revision: version_ref, target }),
    applyChanges: (input) => api?.registerProjection?.({ project_ref, provider_id, expected_projection_revision: input.expected_version_ref, ...input }),
    verifyEvidence: (input) => api?.verifyProjectVisibleProjection?.({ project_ref, provider_id, projection_revision: input.version_ref, ...input }),
  });
}
