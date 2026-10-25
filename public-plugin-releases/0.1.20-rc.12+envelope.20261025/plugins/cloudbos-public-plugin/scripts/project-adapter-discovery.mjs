const ENVIRONMENTS = new Set(["LOCAL_REPOSITORY", "GITHUB_REPOSITORY", "BASE44_GOVERNED_APP", "REMOTE_NO_WRITE"]);
const SOURCE_AUTHORITIES = new Set(["LOCAL_OWNER", "GITHUB_OWNER", "BASE44_APP_OWNER", "READ_ONLY", "UNKNOWN"]);
const DEPLOYMENT_AUTHORITIES = new Set(["SEPARATE_APPROVAL_REQUIRED", "OWNER_CONTROLLED", "READ_ONLY", "UNKNOWN"]);

const ADAPTERS = Object.freeze({
  LOCAL_REPOSITORY: {
    adapter_id: "local_repository",
    projection_form: ".cloudbos/governance",
    required_permissions: ["READ_PROJECT_IDENTITY", "WRITE_EXACT_APPROVED_GOVERNANCE_ARTIFACTS", "READBACK_GOVERNANCE_ARTIFACTS"],
  },
  GITHUB_REPOSITORY: {
    adapter_id: "github_repository",
    projection_form: ".cloudbos/governance on exact approved repository ref",
    required_permissions: ["READ_REPOSITORY_IDENTITY", "READ_EXACT_TARGET_BRANCH", "COMMIT_EXACT_APPROVED_GOVERNANCE_ARTIFACTS", "READBACK_COMMIT_AND_ARTIFACTS"],
  },
  BASE44_GOVERNED_APP: {
    adapter_id: "base44_app_governance",
    projection_form: "AICONTROL/CLOUDBOS_PROJECT_GOVERNANCE",
    required_permissions: ["READ_APP_IDENTITY", "WRITE_EXACT_APPROVED_AICONTROL_ARTIFACT", "APP_NATIVE_READBACK"],
  },
  REMOTE_NO_WRITE: {
    adapter_id: "remote_no_write",
    projection_form: "CLOUD_BOS_PROJECT_VISIBLE_REMOTE_PROJECTION",
    required_permissions: ["READ_PROJECT_IDENTITY", "REGISTER_REMOTE_PROJECTION", "PROJECT_VISIBLE_REMOTE_READBACK"],
  },
});

function fail(status, blockers) {
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_ADAPTER_DISCOVERY_V1",
    state: "DISCOVERY_ONLY",
    status,
    adapter_id: null,
    environment: null,
    project_mutation_performed: false,
    project_governance_implied: false,
    blockers,
    next_action: "Resolve the environment or authority blocker, then rerun read-only discovery.",
  };
}

export function discoverProjectGovernanceAdapter(input = {}) {
  const allowed = new Set([
    "project_ref", "host", "local_repository_visible", "github_remote_verified",
    "base44_app_identity_verified", "project_write_capability",
    "project_visible_remote_evidence", "source_authority", "deployment_authority",
  ]);
  const unknownFields = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownFields.length) return fail("BLOCKED_INPUT_NOT_ALLOWLISTED", unknownFields.map((key) => `unknown_field.${key}`));
  if (typeof input.project_ref !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.project_ref)) {
    return fail("BLOCKED_PROJECT_IDENTITY_REQUIRED", ["project_ref.invalid_or_missing"]);
  }
  if (!SOURCE_AUTHORITIES.has(input.source_authority) || !DEPLOYMENT_AUTHORITIES.has(input.deployment_authority)) {
    return fail("BLOCKED_AUTHORITY_CLASSIFICATION_INVALID", ["source_or_deployment_authority.invalid"]);
  }

  const local = input.local_repository_visible === true;
  const github = input.github_remote_verified === true;
  const base44 = input.base44_app_identity_verified === true;
  const write = input.project_write_capability === true;
  const remoteVisible = input.project_visible_remote_evidence === true;
  if (base44 && local) return fail("BLOCKED_AMBIGUOUS_ENVIRONMENT", ["base44_and_local_repository_both_verified"]);
  if (github && !local) return fail("BLOCKED_AMBIGUOUS_ENVIRONMENT", ["github_remote_without_local_repository_visibility"]);
  if ((base44 || local) && !write) {
    if (!remoteVisible) return fail("BLOCKED_PROJECT_WRITE_UNAVAILABLE", ["project_storage_visible_but_governance_write_unavailable", "adequate_project_visible_remote_readback_required"]);
    if (input.source_authority !== "READ_ONLY" || input.deployment_authority !== "READ_ONLY") {
      return fail("BLOCKED_AUTHORITY_CLASSIFICATION_INVALID", ["no_write_environment_requires_read_only_authority"]);
    }
    const adapter = ADAPTERS.REMOTE_NO_WRITE;
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_ADAPTER_DISCOVERY_V1",
      state: "DISCOVERY_ONLY",
      status: "LIMITED_ADAPTER_DISCOVERED",
      project_ref: input.project_ref,
      host: input.host || "unknown",
      environment: "REMOTE_NO_WRITE",
      adapter_id: adapter.adapter_id,
      projection_form: adapter.projection_form,
      source_authority: input.source_authority,
      deployment_authority: input.deployment_authority,
      required_permissions: adapter.required_permissions,
      project_mutation_performed: false,
      project_governance_implied: false,
      blockers: [],
      next_action: "Render an exact remote-projection plan only through an independent project-visible evidence provider.",
    };
  }

  let environment;
  if (base44) environment = "BASE44_GOVERNED_APP";
  else if (local && github) environment = "GITHUB_REPOSITORY";
  else if (local) environment = "LOCAL_REPOSITORY";
  else if (!write) environment = "REMOTE_NO_WRITE";
  else return fail("BLOCKED_ENVIRONMENT_UNKNOWN", ["no_verified_project_storage_form"]);
  if (!ENVIRONMENTS.has(environment)) return fail("BLOCKED_ENVIRONMENT_UNKNOWN", ["environment.not_supported"]);

  if (environment === "BASE44_GOVERNED_APP" && input.source_authority !== "BASE44_APP_OWNER") {
    return fail("BLOCKED_SOURCE_AUTHORITY_MISMATCH", ["base44_owner_authority_required"]);
  }
  if (environment === "GITHUB_REPOSITORY" && input.source_authority !== "GITHUB_OWNER") {
    return fail("BLOCKED_SOURCE_AUTHORITY_MISMATCH", ["github_owner_authority_required"]);
  }
  if (environment === "LOCAL_REPOSITORY" && input.source_authority !== "LOCAL_OWNER") {
    return fail("BLOCKED_SOURCE_AUTHORITY_MISMATCH", ["local_owner_authority_required"]);
  }
  if (environment === "REMOTE_NO_WRITE" && !remoteVisible) {
    return fail("BLOCKED_PROJECT_VISIBLE_REMOTE_EVIDENCE_UNAVAILABLE", ["adequate_project_visible_readback_required"]);
  }
  if (environment === "REMOTE_NO_WRITE" && (input.source_authority !== "READ_ONLY" || input.deployment_authority !== "READ_ONLY")) {
    return fail("BLOCKED_AUTHORITY_CLASSIFICATION_INVALID", ["remote_no_write_requires_read_only_authority"]);
  }

  const adapter = ADAPTERS[environment];
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_PROJECT_ADAPTER_DISCOVERY_V1",
    state: "DISCOVERY_ONLY",
    status: environment === "REMOTE_NO_WRITE" ? "LIMITED_ADAPTER_DISCOVERED" : "ADAPTER_DISCOVERED",
    project_ref: input.project_ref,
    host: input.host || "unknown",
    environment,
    adapter_id: adapter.adapter_id,
    projection_form: adapter.projection_form,
    source_authority: input.source_authority,
    deployment_authority: input.deployment_authority,
    required_permissions: adapter.required_permissions,
    project_mutation_performed: false,
    project_governance_implied: false,
    blockers: [],
    next_action: "Render an exact zero-write project-governance plan for owner review.",
  };
}

function cli() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: node project-adapter-discovery.mjs '<compact-json-context>'");
  process.stdout.write(`${JSON.stringify(discoverProjectGovernanceAdapter(JSON.parse(raw)), null, 2)}\n`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) cli();
