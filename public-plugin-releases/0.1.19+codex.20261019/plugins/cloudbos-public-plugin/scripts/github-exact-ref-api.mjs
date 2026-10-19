import { createHash } from "node:crypto";

const MAX_ARTIFACT_BYTES = 256 * 1024;
const GOVERNANCE_ROOT = ".cloudbos/governance";
const GOVERNANCE_TARGETS = Object.freeze([
  `${GOVERNANCE_ROOT}/binding.json`,
  `${GOVERNANCE_ROOT}/project-governance.json`,
  `${GOVERNANCE_ROOT}/manifest.json`,
]);
const GOVERNANCE_TARGET_SET = new Set(GOVERNANCE_TARGETS);
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertHash(value, code, pattern = HASH_PATTERN) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function repositoryParts(repositoryRef) {
  if (typeof repositoryRef !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryRef)) {
    fail("CLOUDBOS_GITHUB_REPOSITORY_INVALID");
  }
  return repositoryRef.split("/").map(encodeURIComponent);
}

function branchPath(branch) {
  if (typeof branch !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch)
    || branch.includes("..")
    || branch.endsWith("/")
    || branch.includes("//")) fail("CLOUDBOS_GITHUB_BRANCH_INVALID");
  return branch.split("/").map(encodeURIComponent).join("/");
}

function exactTarget(target) {
  if (!GOVERNANCE_TARGET_SET.has(target)) fail("CLOUDBOS_GITHUB_TARGET_NOT_EXACTLY_ALLOWLISTED", { target });
  return target;
}

function encodedTarget(target) {
  return exactTarget(target).split("/").map(encodeURIComponent).join("/");
}

function isGovernanceTreePath(target) {
  return target === ".cloudbos"
    || target === GOVERNANCE_ROOT
    || target.startsWith(`${GOVERNANCE_ROOT}/`);
}

function validateTree(tree, code) {
  if (!tree || tree.truncated !== false || !Array.isArray(tree.tree)) fail(code);
  const entries = new Map();
  for (const entry of tree.tree) {
    if (!entry || typeof entry.path !== "string" || entry.path.startsWith("/") || entry.path.split("/").includes("..")) fail(code);
    if (!/^(?:100644|100755|120000|040000|160000)$/.test(String(entry.mode))
      || !["blob", "tree", "commit"].includes(entry.type)
      || !SHA_PATTERN.test(entry.sha)) fail(code);
    if (entries.has(entry.path)) fail(code);
    entries.set(entry.path, { mode: String(entry.mode), type: entry.type, sha: entry.sha });
  }
  for (const [target, entry] of entries) {
    if (!isGovernanceTreePath(target)) continue;
    if (target === ".cloudbos" || target === GOVERNANCE_ROOT) {
      if (entry.type !== "tree" || entry.mode !== "040000") fail("CLOUDBOS_GITHUB_GOVERNANCE_TREE_INVALID");
      continue;
    }
    if (!GOVERNANCE_TARGET_SET.has(target) || entry.type !== "blob" || entry.mode !== "100644") {
      fail("CLOUDBOS_GITHUB_GOVERNANCE_TREE_UNEXPECTED_PATH", { target });
    }
  }
  return entries;
}

function applicationTreeDigest(entries) {
  const value = [...entries]
    .filter(([target]) => !isGovernanceTreePath(target))
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify(value));
}

function validateChanges(changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > GOVERNANCE_TARGETS.length) {
    fail("CLOUDBOS_GITHUB_CHANGE_SET_INVALID");
  }
  const targets = new Set();
  return changes.map(({ target, content }) => {
    exactTarget(target);
    if (targets.has(target)) fail("CLOUDBOS_GITHUB_CHANGE_SET_DUPLICATE_TARGET", { target });
    targets.add(target);
    if (content !== null && (typeof content !== "string" || Buffer.byteLength(content) > MAX_ARTIFACT_BYTES)) {
      fail("CLOUDBOS_GITHUB_ARTIFACT_INVALID", { target });
    }
    return { target, content, sha256: content === null ? null : sha256(content) };
  }).sort((left, right) => left.target.localeCompare(right.target));
}

function bodyOf(result, expectedStatuses, code) {
  if (!result || !Number.isInteger(result.status) || !expectedStatuses.includes(result.status)) {
    fail(code, { status: result?.status ?? null });
  }
  return result.body;
}

export function createGitHubExactRefRestApi({ request, commit_message_prefix = "Cloud BOS project governance" } = {}) {
  if (typeof request !== "function") fail("CLOUDBOS_GITHUB_REQUEST_CAPABILITY_MISSING");
  if (typeof commit_message_prefix !== "string" || commit_message_prefix.length < 1 || commit_message_prefix.length > 120 || /[\r\n]/.test(commit_message_prefix)) {
    fail("CLOUDBOS_GITHUB_COMMIT_MESSAGE_INVALID");
  }
  let lastMutation = null;

  async function call(method, endpoint, body) {
    const result = await request({ method, path: endpoint, body });
    if (!result || !Number.isInteger(result.status)) fail("CLOUDBOS_GITHUB_RESPONSE_INVALID");
    return result;
  }

  async function readRef(repositoryRef, targetBranch) {
    const [owner, repository] = repositoryParts(repositoryRef);
    const result = await call("GET", `/repos/${owner}/${repository}/git/ref/heads/${branchPath(targetBranch)}`);
    const body = bodyOf(result, [200], "CLOUDBOS_GITHUB_REF_READ_FAILED");
    assertHash(body?.object?.sha, "CLOUDBOS_GITHUB_REF_READBACK_INVALID", SHA_PATTERN);
    return body.object.sha;
  }

  async function readCommit(repositoryRef, commitSha) {
    const [owner, repository] = repositoryParts(repositoryRef);
    assertHash(commitSha, "CLOUDBOS_GITHUB_COMMIT_INVALID", SHA_PATTERN);
    const result = await call("GET", `/repos/${owner}/${repository}/git/commits/${commitSha}`);
    const body = bodyOf(result, [200], "CLOUDBOS_GITHUB_COMMIT_READ_FAILED");
    assertHash(body?.sha, "CLOUDBOS_GITHUB_COMMIT_READBACK_INVALID", SHA_PATTERN);
    assertHash(body?.tree?.sha, "CLOUDBOS_GITHUB_TREE_REF_INVALID", SHA_PATTERN);
    if (!Array.isArray(body.parents)) fail("CLOUDBOS_GITHUB_COMMIT_READBACK_INVALID");
    return body;
  }

  async function readTree(repositoryRef, treeSha) {
    const [owner, repository] = repositoryParts(repositoryRef);
    assertHash(treeSha, "CLOUDBOS_GITHUB_TREE_REF_INVALID", SHA_PATTERN);
    const result = await call("GET", `/repos/${owner}/${repository}/git/trees/${treeSha}?recursive=1`);
    const body = bodyOf(result, [200], "CLOUDBOS_GITHUB_TREE_READ_FAILED");
    return validateTree(body, "CLOUDBOS_GITHUB_TREE_READBACK_INCOMPLETE");
  }

  async function readFile({ repository_ref, target_branch, commit_sha, target }) {
    const [owner, repository] = repositoryParts(repository_ref);
    branchPath(target_branch);
    assertHash(commit_sha, "CLOUDBOS_GITHUB_COMMIT_INVALID", SHA_PATTERN);
    const result = await call("GET", `/repos/${owner}/${repository}/contents/${encodedTarget(target)}?ref=${encodeURIComponent(commit_sha)}`);
    if (result.status === 404) return null;
    const body = bodyOf(result, [200], "CLOUDBOS_GITHUB_CONTENT_READ_FAILED");
    if (body?.type !== "file" || body.encoding !== "base64" || typeof body.content !== "string") {
      fail("CLOUDBOS_GITHUB_CONTENT_TYPE_DENIED", { target, type: body?.type ?? null });
    }
    const normalized = body.content.replace(/\s+/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
      fail("CLOUDBOS_GITHUB_CONTENT_READBACK_INVALID", { target });
    }
    const content = Buffer.from(normalized, "base64");
    if (content.length > MAX_ARTIFACT_BYTES || (Number.isInteger(body.size) && body.size !== content.length)) {
      fail("CLOUDBOS_GITHUB_CONTENT_READBACK_INVALID", { target });
    }
    return { content: content.toString("utf8") };
  }

  async function applyGovernanceChanges({ repository_ref, target_branch, expected_head_sha, plan_hash, artifact_manifest_hash, changes }) {
    assertHash(expected_head_sha, "CLOUDBOS_GITHUB_HEAD_INVALID", SHA_PATTERN);
    assertHash(plan_hash, "CLOUDBOS_GITHUB_PLAN_HASH_INVALID");
    assertHash(artifact_manifest_hash, "CLOUDBOS_GITHUB_MANIFEST_HASH_INVALID");
    const normalized = validateChanges(changes);
    const [owner, repository] = repositoryParts(repository_ref);
    const currentHead = await readRef(repository_ref, target_branch);
    if (currentHead !== expected_head_sha) {
      fail("CLOUDBOS_GITHUB_HEAD_RACE", { expected_head_sha, actual_head_sha: currentHead });
    }
    const baseCommit = await readCommit(repository_ref, expected_head_sha);
    if (baseCommit.sha !== expected_head_sha) fail("CLOUDBOS_GITHUB_COMMIT_READBACK_INVALID");
    const baseEntries = await readTree(repository_ref, baseCommit.tree.sha);
    const baseApplicationDigest = applicationTreeDigest(baseEntries);

    const treeChanges = [];
    for (const change of normalized) {
      if (change.content === null) {
        treeChanges.push({ path: change.target, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blobResult = await call("POST", `/repos/${owner}/${repository}/git/blobs`, { content: change.content, encoding: "utf-8" });
      const blob = bodyOf(blobResult, [201], "CLOUDBOS_GITHUB_BLOB_CREATE_FAILED");
      assertHash(blob?.sha, "CLOUDBOS_GITHUB_BLOB_READBACK_INVALID", SHA_PATTERN);
      treeChanges.push({ path: change.target, mode: "100644", type: "blob", sha: blob.sha });
    }

    const treeResult = await call("POST", `/repos/${owner}/${repository}/git/trees`, {
      base_tree: baseCommit.tree.sha,
      tree: treeChanges,
    });
    const createdTree = bodyOf(treeResult, [201], "CLOUDBOS_GITHUB_TREE_CREATE_FAILED");
    assertHash(createdTree?.sha, "CLOUDBOS_GITHUB_TREE_CREATE_READBACK_INVALID", SHA_PATTERN);

    const commitResult = await call("POST", `/repos/${owner}/${repository}/git/commits`, {
      message: `${commit_message_prefix}: ${plan_hash.slice(0, 12)}`,
      tree: createdTree.sha,
      parents: [expected_head_sha],
    });
    const createdCommit = bodyOf(commitResult, [201], "CLOUDBOS_GITHUB_COMMIT_CREATE_FAILED");
    assertHash(createdCommit?.sha, "CLOUDBOS_GITHUB_COMMIT_CREATE_READBACK_INVALID", SHA_PATTERN);

    const refResult = await call("PATCH", `/repos/${owner}/${repository}/git/refs/heads/${branchPath(target_branch)}`, {
      sha: createdCommit.sha,
      force: false,
    });
    const ref = bodyOf(refResult, [200], "CLOUDBOS_GITHUB_REF_UPDATE_FAILED");
    if (ref?.object?.sha !== createdCommit.sha) fail("CLOUDBOS_GITHUB_REF_UPDATE_READBACK_INVALID");

    lastMutation = {
      repository_ref,
      target_branch,
      base_commit_sha: expected_head_sha,
      base_application_digest: baseApplicationDigest,
      commit_sha: createdCommit.sha,
      plan_hash,
      artifact_manifest_hash,
      changes: normalized,
    };
    return { success: true, version_ref: createdCommit.sha };
  }

  async function verifyGovernanceCommit({ repository_ref, target_branch, commit_sha, plan_hash, artifact_manifest_hash }) {
    if (!lastMutation
      || lastMutation.repository_ref !== repository_ref
      || lastMutation.target_branch !== target_branch
      || lastMutation.commit_sha !== commit_sha
      || lastMutation.plan_hash !== plan_hash
      || lastMutation.artifact_manifest_hash !== artifact_manifest_hash) return { verified: false, reason: "MUTATION_BINDING_MISMATCH" };
    try {
      const currentHead = await readRef(repository_ref, target_branch);
      if (currentHead !== commit_sha) return { verified: false, reason: "HEAD_READBACK_MISMATCH" };
      const commit = await readCommit(repository_ref, commit_sha);
      if (commit.sha !== commit_sha
        || commit.parents.length !== 1
        || commit.parents[0]?.sha !== lastMutation.base_commit_sha) return { verified: false, reason: "COMMIT_PARENT_MISMATCH" };
      const currentEntries = await readTree(repository_ref, commit.tree.sha);
      if (applicationTreeDigest(currentEntries) !== lastMutation.base_application_digest) {
        return { verified: false, reason: "APPLICATION_TREE_CHANGED" };
      }
      for (const change of lastMutation.changes) {
        const readback = await readFile({ repository_ref, target_branch, commit_sha, target: change.target });
        if (change.content === null ? readback !== null : readback === null || sha256(readback.content) !== change.sha256) {
          return { verified: false, reason: "GOVERNANCE_CONTENT_MISMATCH", target: change.target };
        }
      }
      return {
        verified: true,
        application_tree_unchanged: true,
        exact_governance_targets_verified: lastMutation.changes.map(({ target }) => target),
        base_commit_sha: lastMutation.base_commit_sha,
        commit_sha,
      };
    } catch (error) {
      return { verified: false, reason: error?.code || "READBACK_FAILED" };
    }
  }

  return Object.freeze({ readFile, applyGovernanceChanges, verifyGovernanceCommit });
}

export const GITHUB_GOVERNANCE_TARGETS = GOVERNANCE_TARGETS;
