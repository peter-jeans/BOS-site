import fs from "node:fs";
import { createHash } from "node:crypto";

const manifestUrl = new URL("../contracts/host-adapters.json", import.meta.url);
const base44WorkspaceSkillUrl = new URL("../contracts/base44-workspace-skill.json", import.meta.url);
const HOST_PLAN_SCHEMA = "BOS_CLOUDBOS_PUBLIC_PLATFORM_INSTALLATION_PLAN_V1";
const HOST_ADAPTER_CATALOG_SCHEMA = "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_CATALOG_V1";
const BASE44_WORKSPACE_DISCOVERY_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_WORKSPACE_DISCOVERY_EVIDENCE_V1";
const BASE44_HOST_PREFLIGHT_SCHEMA = "BOS_CLOUDBOS_PUBLIC_BASE44_HOST_PREFLIGHT_EVIDENCE_V1";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const BASE44_WORKSPACE_REF_PATTERN = /^base44-workspace:[a-f0-9]{64}$/;
const BASE44_APP_REF_PATTERN = /^base44-app:[a-f0-9]{64}$/;
const BASE44_WORKSPACE_ROLES = new Set(["owner", "admin", "editor", "viewer", "member", "unknown"]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function hostPlanHash(plan) {
  const clone = structuredClone(plan);
  delete clone.plan_hash;
  return digest(clone);
}

function hostAdapterCatalogHash(catalog) {
  const clone = structuredClone(catalog);
  delete clone.catalog_hash;
  return digest(clone);
}

function base44OpaqueRef(kind, value) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`CLOUDBOS_BASE44_${kind.toUpperCase()}_ID_REQUIRED`);
  return `base44-${kind}:${digest(`cloudbos-public-base44-${kind}-ref-v1\u0000${normalized}`)}`;
}

function base44WorkspaceDiscoveryHash(evidence) {
  const clone = structuredClone(evidence);
  delete clone.evidence_hash;
  return digest(clone);
}

function base44HostPreflightHash(evidence) {
  const clone = structuredClone(evidence);
  delete clone.evidence_hash;
  return digest(clone);
}

function normalizedBase44WorkspaceRole(value) {
  const role = String(value || "unknown").trim().toLowerCase();
  return BASE44_WORKSPACE_ROLES.has(role) ? role : "unknown";
}

export function createBase44WorkspaceDiscoveryEvidence({
  app,
  workspaces,
  selected_workspace_ids,
  observed_at = new Date().toISOString(),
} = {}) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_LIST_REQUIRED");
  }
  const observedAt = new Date(observed_at);
  if (!Number.isFinite(observedAt.valueOf())) throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_TIME_INVALID");
  const appId = String(app?.id || "").trim();
  const appWorkspaceId = String(app?.organization_id ?? app?.organizationId ?? "").trim();
  if (!appId) throw new Error("CLOUDBOS_BASE44_APP_ID_REQUIRED");
  if (!appWorkspaceId) throw new Error("CLOUDBOS_BASE44_APP_WORKSPACE_ID_REQUIRED");

  const normalizedWorkspaces = workspaces.map((workspace) => ({
    id: String(workspace?.id || "").trim(),
    user_role: normalizedBase44WorkspaceRole(workspace?.userRole ?? workspace?.user_role),
  }));
  if (normalizedWorkspaces.some((workspace) => !workspace.id)) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_ID_REQUIRED");
  }
  if (new Set(normalizedWorkspaces.map((workspace) => workspace.id)).size !== normalizedWorkspaces.length) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_LIST_DUPLICATED");
  }
  const workspaceById = new Map(normalizedWorkspaces.map((workspace) => [workspace.id, workspace]));
  if (!workspaceById.has(appWorkspaceId)) {
    throw new Error("CLOUDBOS_BASE44_APP_WORKSPACE_NOT_IN_AUTHENTICATED_LIST");
  }

  const selectedIds = selected_workspace_ids === undefined
    ? [appWorkspaceId]
    : selected_workspace_ids.map((value) => String(value || "").trim());
  if (!selectedIds.length || selectedIds.some((value) => !value)) {
    throw new Error("CLOUDBOS_BASE44_SELECTED_WORKSPACE_IDS_REQUIRED");
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("CLOUDBOS_BASE44_SELECTED_WORKSPACE_IDS_DUPLICATED");
  }
  if (selectedIds.some((value) => !workspaceById.has(value))) {
    throw new Error("CLOUDBOS_BASE44_SELECTED_WORKSPACE_NOT_IN_AUTHENTICATED_LIST");
  }

  const selectedWorkspaceRoles = selectedIds.map((id) => ({
    workspace_ref: base44OpaqueRef("workspace", id),
    user_role: workspaceById.get(id).user_role,
  })).sort((a, b) => a.workspace_ref.localeCompare(b.workspace_ref));
  const selectedWorkspaceRefs = selectedWorkspaceRoles.map((item) => item.workspace_ref);
  const appWorkspaceRef = base44OpaqueRef("workspace", appWorkspaceId);
  const evidence = {
    schema: BASE44_WORKSPACE_DISCOVERY_SCHEMA,
    status: "COMPLETE_VERIFIED_READ_ONLY",
    observed_at: observedAt.toISOString(),
    source_surfaces: ["BASE44_CLI_WORKSPACE_LIST", "BASE44_APP_METADATA_READ"],
    app_ref: base44OpaqueRef("app", appId),
    account_workspace_count: normalizedWorkspaces.length,
    app_workspace_ref: appWorkspaceRef,
    app_workspace_membership_status: "MATCHED_AUTHENTICATED_ACCOUNT_WORKSPACE_LIST",
    app_workspace_selected: selectedWorkspaceRefs.includes(appWorkspaceRef),
    selected_workspace_refs: selectedWorkspaceRefs,
    selected_workspace_roles: selectedWorkspaceRoles,
    raw_identifiers_emitted: false,
    raw_workspace_names_emitted: false,
    project_write_observed: false,
    provider_write_observed: false,
  };
  evidence.evidence_hash = base44WorkspaceDiscoveryHash(evidence);
  return validateBase44WorkspaceDiscoveryEvidence(evidence);
}

export function validateBase44WorkspaceDiscoveryEvidence(evidence) {
  const allowedKeys = [
    "schema", "status", "observed_at", "source_surfaces", "app_ref", "account_workspace_count",
    "app_workspace_ref", "app_workspace_membership_status", "app_workspace_selected",
    "selected_workspace_refs", "selected_workspace_roles", "raw_identifiers_emitted",
    "raw_workspace_names_emitted", "project_write_observed", "provider_write_observed", "evidence_hash",
  ];
  if (!evidence || Object.keys(evidence).some((key) => !allowedKeys.includes(key))
    || evidence.schema !== BASE44_WORKSPACE_DISCOVERY_SCHEMA
    || evidence.status !== "COMPLETE_VERIFIED_READ_ONLY"
    || !Number.isFinite(new Date(evidence.observed_at).valueOf())
    || JSON.stringify(evidence.source_surfaces) !== JSON.stringify(["BASE44_CLI_WORKSPACE_LIST", "BASE44_APP_METADATA_READ"])
    || !BASE44_APP_REF_PATTERN.test(evidence.app_ref || "")
    || !Number.isInteger(evidence.account_workspace_count)
    || evidence.account_workspace_count < 1
    || !BASE44_WORKSPACE_REF_PATTERN.test(evidence.app_workspace_ref || "")
    || evidence.app_workspace_membership_status !== "MATCHED_AUTHENTICATED_ACCOUNT_WORKSPACE_LIST"
    || evidence.app_workspace_selected !== true
    || !Array.isArray(evidence.selected_workspace_refs)
    || evidence.selected_workspace_refs.length < 1
    || evidence.selected_workspace_refs.length > evidence.account_workspace_count
    || evidence.selected_workspace_refs.some((ref) => !BASE44_WORKSPACE_REF_PATTERN.test(ref))
    || new Set(evidence.selected_workspace_refs).size !== evidence.selected_workspace_refs.length
    || JSON.stringify([...evidence.selected_workspace_refs].sort()) !== JSON.stringify(evidence.selected_workspace_refs)
    || !evidence.selected_workspace_refs.includes(evidence.app_workspace_ref)
    || !Array.isArray(evidence.selected_workspace_roles)
    || evidence.selected_workspace_roles.length !== evidence.selected_workspace_refs.length
    || evidence.selected_workspace_roles.some((item, index) => item?.workspace_ref !== evidence.selected_workspace_refs[index]
      || !BASE44_WORKSPACE_ROLES.has(item?.user_role))
    || evidence.raw_identifiers_emitted !== false
    || evidence.raw_workspace_names_emitted !== false
    || evidence.project_write_observed !== false
    || evidence.provider_write_observed !== false
    || !HASH_PATTERN.test(evidence.evidence_hash || "")
    || evidence.evidence_hash !== base44WorkspaceDiscoveryHash(evidence)) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_EVIDENCE_INVALID");
  }
  return evidence;
}

export function createBase44HostPreflightEvidence({
  account_mcp_connection_count,
  selected_workspace_skill_counts,
  minimum_plan_observed = "BUILDER_OR_HIGHER",
  plan_eligible = true,
  observed_at = new Date().toISOString(),
} = {}) {
  const observedAt = new Date(observed_at);
  if (!Number.isFinite(observedAt.valueOf())) throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_TIME_INVALID");
  if (!Array.isArray(selected_workspace_skill_counts) || selected_workspace_skill_counts.length === 0) {
    throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_WORKSPACE_COUNTS_REQUIRED");
  }
  const counts = selected_workspace_skill_counts.map((item) => ({
    workspace_ref: String(item?.workspace_ref || ""),
    skill_count: item?.skill_count,
    capacity: 100,
  })).sort((a, b) => a.workspace_ref.localeCompare(b.workspace_ref));
  const evidence = {
    schema: BASE44_HOST_PREFLIGHT_SCHEMA,
    status: "COMPLETE_VERIFIED_READ_ONLY",
    observed_at: observedAt.toISOString(),
    source_surfaces: ["BASE44_ACCOUNT_MCP_SETTINGS", "BASE44_WORKSPACE_SKILLS_SETTINGS"],
    minimum_plan_observed,
    plan_eligible,
    account_mcp_connection_count,
    account_mcp_capacity: 20,
    selected_workspace_skill_counts: counts,
    raw_account_or_workspace_identifiers_emitted: false,
    raw_workspace_names_emitted: false,
    provider_write_observed: false,
  };
  evidence.evidence_hash = base44HostPreflightHash(evidence);
  return validateBase44HostPreflightEvidence(evidence);
}

export function validateBase44HostPreflightEvidence(evidence) {
  const allowedKeys = [
    "schema", "status", "observed_at", "source_surfaces", "minimum_plan_observed",
    "plan_eligible", "account_mcp_connection_count", "account_mcp_capacity",
    "selected_workspace_skill_counts", "raw_account_or_workspace_identifiers_emitted",
    "raw_workspace_names_emitted", "provider_write_observed", "evidence_hash",
  ];
  const counts = evidence?.selected_workspace_skill_counts;
  if (!evidence
    || Object.keys(evidence).some((key) => !allowedKeys.includes(key))
    || evidence.schema !== BASE44_HOST_PREFLIGHT_SCHEMA
    || evidence.status !== "COMPLETE_VERIFIED_READ_ONLY"
    || !Number.isFinite(new Date(evidence.observed_at).valueOf())
    || JSON.stringify(evidence.source_surfaces) !== JSON.stringify(["BASE44_ACCOUNT_MCP_SETTINGS", "BASE44_WORKSPACE_SKILLS_SETTINGS"])
    || evidence.minimum_plan_observed !== "BUILDER_OR_HIGHER"
    || evidence.plan_eligible !== true
    || !Number.isInteger(evidence.account_mcp_connection_count)
    || evidence.account_mcp_connection_count < 0
    || evidence.account_mcp_connection_count >= 20
    || evidence.account_mcp_capacity !== 20
    || !Array.isArray(counts)
    || counts.length < 1
    || counts.some((item) => Object.keys(item || {}).sort().join(",") !== "capacity,skill_count,workspace_ref"
      || !BASE44_WORKSPACE_REF_PATTERN.test(item.workspace_ref || "")
      || !Number.isInteger(item.skill_count)
      || item.skill_count < 0
      || item.skill_count >= 100
      || item.capacity !== 100)
    || new Set(counts.map(({ workspace_ref }) => workspace_ref)).size !== counts.length
    || JSON.stringify([...counts].sort((a, b) => a.workspace_ref.localeCompare(b.workspace_ref))) !== JSON.stringify(counts)
    || evidence.raw_account_or_workspace_identifiers_emitted !== false
    || evidence.raw_workspace_names_emitted !== false
    || evidence.provider_write_observed !== false
    || !HASH_PATTERN.test(evidence.evidence_hash || "")
    || evidence.evidence_hash !== base44HostPreflightHash(evidence)) {
    throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_EVIDENCE_INVALID");
  }
  return evidence;
}

function normalizeWorkspaceRefs(hostId, workspaceRefs) {
  if (!Array.isArray(workspaceRefs)) throw new Error("CLOUDBOS_WORKSPACE_REFS_MUST_BE_ARRAY");
  if (hostId !== "base44_build_ai" && workspaceRefs.length) throw new Error("CLOUDBOS_WORKSPACE_REFS_ONLY_BASE44");
  const refs = workspaceRefs.map((ref) => String(ref));
  if (refs.some((ref) => !BASE44_WORKSPACE_REF_PATTERN.test(ref))) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_REF_MUST_BE_PRIVACY_SAFE_HASHED_REF");
  }
  if (new Set(refs).size !== refs.length) throw new Error("CLOUDBOS_BASE44_WORKSPACE_REFS_DUPLICATED");
  return refs.sort();
}

function base44WorkspaceReadbacksMatch(plan, readback, allowedStatuses) {
  if (JSON.stringify(readback.selected_workspace_refs) !== JSON.stringify(plan.selected_workspace_refs)
    || !Array.isArray(readback.workspace_skill_readbacks)
    || readback.workspace_skill_readbacks.length !== plan.selected_workspace_refs.length) return false;
  const byRef = new Map(readback.workspace_skill_readbacks.map((item) => [item.workspace_ref, item]));
  if (byRef.size !== plan.selected_workspace_refs.length) return false;
  return plan.selected_workspace_refs.every((workspaceRef) => {
    const item = byRef.get(workspaceRef);
    return item
      && allowedStatuses.includes(item.status)
      && item.name === plan.adapter.workspace_skill.name
      && item.sha256 === plan.adapter.workspace_skill.sha256;
  });
}

export function loadHostAdapterManifest() {
  return JSON.parse(fs.readFileSync(manifestUrl, "utf8"));
}

export function loadBase44WorkspaceSkill() {
  return JSON.parse(fs.readFileSync(base44WorkspaceSkillUrl, "utf8"));
}

export function validatePublicMcpEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(String(value || ""));
  } catch {
    throw new Error("CLOUDBOS_MCP_ENDPOINT_INVALID");
  }
  if (endpoint.protocol !== "https:"
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || endpoint.pathname !== "/mcp") {
    throw new Error("CLOUDBOS_MCP_ENDPOINT_MUST_BE_HTTPS_EXACT_MCP_RESOURCE");
  }
  return endpoint.toString();
}

function connectionForShape(shape, endpoint, tools) {
  if (shape === "TYPE_HTTP_URL") return { type: "http", url: endpoint };
  if (shape === "HTTP_URL_FIELD") return { httpUrl: endpoint };
  if (shape === "SERVER_URL_FIELD") return { serverUrl: endpoint };
  if (shape === "TYPE_HTTP_URL_WITH_TOOL_ALLOWLIST") {
    return { type: "http", url: endpoint, tools: [...tools] };
  }
  return null;
}

function replitInstallLink(host, endpoint) {
  const payload = {
    displayName: host.display_name,
    baseUrl: endpoint,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return {
    payload,
    url: `${host.install_link_base}${encodeURIComponent(encoded)}`,
  };
}

export function renderHostAdapter(hostId, endpointValue) {
  const manifest = loadHostAdapterManifest();
  const host = manifest.hosts[hostId];
  if (!host) throw new Error("CLOUDBOS_HOST_UNKNOWN");
  if (!manifest.release_scope.required_host_ids.includes(hostId)) {
    if (manifest.release_scope.deferred_post_v1_host_ids.includes(hostId)) {
      throw new Error("CLOUDBOS_HOST_DEFERRED_POST_V1");
    }
    throw new Error("CLOUDBOS_HOST_NOT_IN_V1_SCOPE");
  }
  const endpoint = validatePublicMcpEndpoint(endpointValue);

  if (host.support_status === "RESEARCH_ONLY_NO_PACKAGE_CLAIM") {
    throw new Error("CLOUDBOS_HOST_NOT_PACKAGED_PENDING_OFFICIAL_PROBE");
  }

  if (host.install_mode === "USER_SCOPE_CLI_INSTRUCTION") {
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_OUTPUT_V1",
      host_id: hostId,
      support_status: host.support_status,
      mode: "PLATFORM_USER_SCOPE_CLI_INSTRUCTION",
      installation_scope: host.installation_scope,
      target: host.config_target,
      command: host.install_command_template.replace("<endpoint>", endpoint),
      project_adapter_discovery: "READ_ONLY_AFTER_PLATFORM_INSTALL",
      verification: "CONNECT_AUTHENTICATE_LIST_EIGHT_LEVEL1_PLUS_FIVE_GOVERNANCE_TOOLS_CALL_BOS_CONNECT",
      uninstall: "REMOVE_ONLY_THE_USER_SCOPE_CLOUDBOS_MCP_REGISTRATION",
      live_verified: host.live_verified === true,
    };
  }

  if (host.install_mode === "CLAUDE_PLUGIN_USER_SCOPE") {
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_OUTPUT_V1",
      host_id: hostId,
      support_status: host.support_status,
      mode: "PLATFORM_USER_SCOPE_PLUGIN",
      installation_scope: host.installation_scope,
      target: host.config_target,
      plugin_id: host.plugin_id,
      plugin_manifest: host.plugin_manifest,
      marketplace_install_command: host.install_command_template,
      development_command: host.development_command_template,
      staged_mcp_companion: {
        mcpServers: {
          cloudbos: connectionForShape(host.connection_shape, endpoint, manifest.tools),
        },
      },
      fallback_mcp_command: host.mcp_fallback_command_template.replace("<endpoint>", endpoint),
      project_adapter_discovery: "READ_ONLY_AFTER_PLATFORM_INSTALL",
      verification: "PLUGIN_SKILL_DISCOVERY_CONNECT_AUTHENTICATE_LIST_EIGHT_LEVEL1_PLUS_FIVE_GOVERNANCE_TOOLS_CALL_BOS_CONNECT",
      uninstall: "REMOVE_ONLY_THE_USER_SCOPE_CLOUDBOS_PLUGIN_AND_ITS_PLUGIN_OWNED_MCP_REGISTRATION",
      live_verified: host.live_verified === true,
    };
  }

  if (host.install_mode === "BASE44_ACCOUNT_MCP_WORKSPACE_SKILL_UI") {
    const workspaceSkill = loadBase44WorkspaceSkill();
    const skillProjection = {
      name: workspaceSkill.name,
      description: workspaceSkill.description,
      instructions: workspaceSkill.instructions.join("\n\n"),
    };
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_OUTPUT_V1",
      host_id: hostId,
      support_status: host.support_status,
      mode: "BASE44_ACCOUNT_MCP_AND_WORKSPACE_SKILL_UI",
      installation_scope: host.installation_scope,
      target: host.config_target,
      endpoint,
      display_name: host.display_name,
      authentication_mode: host.authentication_mode,
      custom_static_headers: host.custom_static_headers,
      host_preflight: structuredClone(host.host_preflight),
      provider_compatibility: host.provider_compatibility,
      account_mcp: {
        scope: "BASE44_ACCOUNT",
        maximum_connections_per_account: host.host_preflight.account_mcp_max_connections,
        editor_ai_chat_only: host.host_preflight.editor_ai_chat_only,
        application_runtime_available: host.host_preflight.application_runtime_available,
        name: host.display_name,
        url: endpoint,
        authentication: "OAUTH",
        custom_headers: [],
      },
      workspace_skill: {
        scope: "ONE_SELECTED_BASE44_WORKSPACE",
        maximum_skills_per_workspace: host.host_preflight.workspace_skill_max_per_workspace,
        editor_ai_chat_only: true,
        live_data_source: false,
        ...skillProjection,
        sha256: digest(skillProjection),
        static_guidance_only: true,
        coverage: workspaceSkill.coverage_model,
      },
      project_availability: host.project_availability,
      install: [
        "Verify Builder-or-higher plan eligibility and fewer than twenty current account MCP connections",
        "Verify fewer than one hundred skills in every exact selected workspace",
        "Add and authenticate the exact Cloud BOS MCP once in Base44 account settings",
        "Add the exact Cloud BOS governed-build skill once in each selected workspace",
        "Test the account connection and verify all fourteen core Cloud BOS tools, plus only the conditional routes actually advertised",
        "Call bos_connect and keep the current app UNBOUND until its separate governance plan is approved and verified",
      ],
      verification: "ACCOUNT_MCP_CONNECTED_OAUTH_AUTHENTICATED_FOURTEEN_CORE_TOOLS_PLUS_ADVERTISED_CONDITIONAL_ROUTES_WORKSPACE_SKILL_EXACT_HASH_BOS_CONNECT_AND_ZERO_PROJECT_WRITE_READBACK",
      uninstall: "REMOVE_ONLY_THE_BASE44_ACCOUNT_CLOUDBOS_MCP_AND_SELECTED_WORKSPACE_SKILL; DO_NOT_REMOVE_PROJECT_GOVERNANCE_OR_APPLICATION_SOURCE_DATA_OR_RUNTIME",
      project_adapter_discovery: "READ_ONLY_AFTER_ACCOUNT_MCP_AND_WORKSPACE_SKILL_INSTALL",
      live_verified: host.live_verified === true,
    };
  }

  const connection = connectionForShape(host.connection_shape, endpoint, manifest.tools);
  if (connection && host.wrapper_key) {
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_OUTPUT_V1",
      host_id: hostId,
      support_status: host.support_status,
      mode: "MERGE_FRAGMENT_ONLY",
      installation_scope: host.installation_scope,
      target: host.config_target,
      fragment: { [host.wrapper_key]: { [manifest.server_name]: connection } },
      native_plugin_alternative: host.native_plugin_alternative ?? null,
      provider_compatibility: host.provider_compatibility ?? { status: "NOT_DECLARED" },
      install_command: host.install_command_template?.replace("<endpoint>", endpoint) ?? null,
      remove_command: host.remove_command_template ?? null,
      list_command: host.list_command ?? null,
      auth_command: host.auth_command ?? null,
      authentication_mode: host.authentication_mode ?? null,
      custom_static_headers: host.custom_static_headers ?? null,
      cloudbos_oauth_mode: host.cloudbos_oauth_mode ?? null,
      verification: "CONNECT_AUTHENTICATE_LIST_EIGHT_LEVEL1_PLUS_FIVE_GOVERNANCE_TOOLS_CALL_BOS_CONNECT",
      uninstall: "REMOVE_ONLY_EXACT_GENERATED_CLOUDBOS_ENTRY",
      project_adapter_discovery: "READ_ONLY_AFTER_PLATFORM_INSTALL",
      live_verified: host.live_verified === true,
    };
  }

  const replit = hostId === "replit_agent" ? replitInstallLink(host, endpoint) : null;
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_HOST_ADAPTER_OUTPUT_V1",
    host_id: hostId,
    support_status: host.support_status,
    mode: hostId === "replit_agent" ? "MANUAL_TRUSTED_URL_UI" : "CLIENT_DEFINED",
    installation_scope: host.installation_scope,
    endpoint,
    display_name: replit?.payload.displayName ?? null,
    install_link: replit?.url ?? null,
    install_payload: replit?.payload ?? null,
    authentication_mode: host.authentication_mode ?? "CLIENT_DEFINED",
    custom_static_headers: host.custom_static_headers ?? "CLIENT_DEFINED",
    host_security_scanner: host.host_security_scanner ?? "CLIENT_DEFINED",
    provider_compatibility: host.provider_compatibility ?? { status: "CLIENT_DEFINED" },
    project_availability: hostId === "replit_agent" ? "ALL_PROJECTS_AFTER_PLATFORM_CONNECTION" : "CLIENT_DEFINED",
    install: hostId === "replit_agent"
      ? ["Open Replit Integrations", "Add a custom trusted MCP server", "Confirm display name and HTTPS endpoint", "Test, complete OAuth and save"]
      : ["Add the HTTPS Streamable HTTP endpoint", "Complete OAuth discovery", "Confirm eight Level-1 plus six project-governance tools"],
    verification: "CONNECT_AUTHENTICATE_LIST_EIGHT_LEVEL1_PLUS_SIX_GOVERNANCE_TOOLS_CALL_BOS_CONNECT",
    uninstall: hostId === "replit_agent" ? "REMOVE_ONLY_THE_CLOUDBOS_MCP_CONNECTION_IN_REPLIT_AND_VERIFY_APPLICATION_CONTINUITY" : "REMOVE_ONLY_THE_CLOUDBOS_SERVER_ENTRY",
    project_adapter_discovery: "READ_ONLY_AFTER_PLATFORM_INSTALL",
    live_verified: false,
  };
}

export function renderHostAdapterCatalog(endpointValue) {
  const manifest = loadHostAdapterManifest();
  const endpoint = validatePublicMcpEndpoint(endpointValue);
  const adapters = {};
  const supportedHostIds = [...manifest.release_scope.required_host_ids].sort();
  const withheldHostIds = [...manifest.release_scope.deferred_post_v1_host_ids].sort();

  for (const hostId of supportedHostIds) {
    adapters[hostId] = renderHostAdapter(hostId, endpoint);
  }

  const catalog = {
    schema: HOST_ADAPTER_CATALOG_SCHEMA,
    manifest_version: manifest.version,
    server_name: manifest.server_name,
    transport: manifest.transport,
    endpoint,
    installation_lifecycle: manifest.installation_lifecycle,
    project_governance_lifecycle: manifest.project_governance_lifecycle,
    platform_install_never_implies_project_governance: true,
    tool_names: [...manifest.tools],
    v1_release_host_ids: [...manifest.release_scope.required_host_ids],
    deferred_post_v1_host_ids: [...manifest.release_scope.deferred_post_v1_host_ids],
    supported_host_ids: supportedHostIds,
    withheld_host_ids: withheldHostIds,
    adapters,
  };
  catalog.catalog_hash = hostAdapterCatalogHash(catalog);
  return validateHostAdapterCatalog(catalog);
}

export function validateHostAdapterCatalog(catalog) {
  const allowedKeys = [
    "schema", "manifest_version", "server_name", "transport", "endpoint",
    "installation_lifecycle", "project_governance_lifecycle",
    "platform_install_never_implies_project_governance", "tool_names",
    "v1_release_host_ids", "deferred_post_v1_host_ids",
    "supported_host_ids", "withheld_host_ids", "adapters", "catalog_hash",
  ];
  const manifest = loadHostAdapterManifest();
  const v1ReleaseHostIds = manifest.release_scope?.required_host_ids || [];
  const deferredPostV1HostIds = manifest.release_scope?.deferred_post_v1_host_ids || [];
  const supportedHostIds = [...v1ReleaseHostIds].sort();
  const withheldHostIds = [...deferredPostV1HostIds].sort();
  const completeScopedInventory = [...v1ReleaseHostIds, ...deferredPostV1HostIds].sort();

  if (!catalog
    || Object.keys(catalog).some((key) => !allowedKeys.includes(key))
    || allowedKeys.some((key) => !Object.hasOwn(catalog, key))
    || catalog.schema !== HOST_ADAPTER_CATALOG_SCHEMA
    || catalog.manifest_version !== manifest.version
    || catalog.server_name !== manifest.server_name
    || catalog.transport !== manifest.transport
    || catalog.endpoint !== validatePublicMcpEndpoint(catalog.endpoint)
    || catalog.installation_lifecycle !== manifest.installation_lifecycle
    || catalog.project_governance_lifecycle !== manifest.project_governance_lifecycle
    || catalog.platform_install_never_implies_project_governance !== true
    || JSON.stringify(catalog.tool_names) !== JSON.stringify(manifest.tools)
    || JSON.stringify(catalog.v1_release_host_ids) !== JSON.stringify(v1ReleaseHostIds)
    || JSON.stringify(catalog.deferred_post_v1_host_ids) !== JSON.stringify(deferredPostV1HostIds)
    || JSON.stringify(completeScopedInventory) !== JSON.stringify(Object.keys(manifest.hosts).sort())
    || new Set(completeScopedInventory).size !== completeScopedInventory.length
    || JSON.stringify(catalog.supported_host_ids) !== JSON.stringify(supportedHostIds)
    || JSON.stringify(catalog.withheld_host_ids) !== JSON.stringify(withheldHostIds)
    || !catalog.adapters
    || Array.isArray(catalog.adapters)
    || JSON.stringify(Object.keys(catalog.adapters)) !== JSON.stringify(supportedHostIds)
    || !HASH_PATTERN.test(catalog.catalog_hash || "")
    || catalog.catalog_hash !== hostAdapterCatalogHash(catalog)) {
    throw new Error("CLOUDBOS_HOST_ADAPTER_CATALOG_INVALID");
  }

  for (const hostId of supportedHostIds) {
    if (canonicalJson(catalog.adapters[hostId]) !== canonicalJson(renderHostAdapter(hostId, catalog.endpoint))) {
      throw new Error("CLOUDBOS_HOST_ADAPTER_CATALOG_INVALID");
    }
  }
  return catalog;
}

function exactGeneratedConnection(adapter) {
  const wrapper = adapter.fragment?.mcpServers || adapter.fragment?.servers;
  return wrapper?.cloudbos || null;
}

export function applyHostAdapter(existingConfig, adapter) {
  if (adapter.mode !== "MERGE_FRAGMENT_ONLY") throw new Error("CLOUDBOS_MANUAL_ADAPTER_CANNOT_MUTATE_CONFIG");
  const config = structuredClone(existingConfig || {});
  const wrapperKey = adapter.fragment.mcpServers ? "mcpServers" : "servers";
  const generated = exactGeneratedConnection(adapter);
  const current = config[wrapperKey]?.cloudbos;
  if (current && JSON.stringify(current) !== JSON.stringify(generated)) {
    throw new Error("CLOUDBOS_EXISTING_ENTRY_CONFLICT_REVIEW_REQUIRED");
  }
  config[wrapperKey] = { ...(config[wrapperKey] || {}), cloudbos: generated };
  return config;
}

export function removeHostAdapter(existingConfig, adapter) {
  if (adapter.mode !== "MERGE_FRAGMENT_ONLY") throw new Error("CLOUDBOS_MANUAL_ADAPTER_CANNOT_MUTATE_CONFIG");
  const config = structuredClone(existingConfig || {});
  const wrapperKey = adapter.fragment.mcpServers ? "mcpServers" : "servers";
  const generated = exactGeneratedConnection(adapter);
  const current = config[wrapperKey]?.cloudbos;
  if (!current) return config;
  if (JSON.stringify(current) !== JSON.stringify(generated)) {
    throw new Error("CLOUDBOS_CHANGED_ENTRY_UNINSTALL_REVIEW_REQUIRED");
  }
  const nextWrapper = { ...(config[wrapperKey] || {}) };
  delete nextWrapper.cloudbos;
  config[wrapperKey] = nextWrapper;
  return config;
}

export function createPlatformInstallationPlan({
  host_id,
  endpoint,
  existing_config = {},
  workspace_refs = [],
  workspace_discovery_evidence = null,
  base44_host_preflight_evidence = null,
  requested_operation = "INSTALL",
  created_at = new Date().toISOString(),
  expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(),
} = {}) {
  if (!["INSTALL", "REMOVE"].includes(requested_operation)) throw new Error("CLOUDBOS_PLATFORM_OPERATION_INVALID");
  const adapter = renderHostAdapter(host_id, endpoint);
  if (host_id !== "base44_build_ai" && workspace_discovery_evidence !== null) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_ONLY_BASE44");
  }
  if (host_id !== "base44_build_ai" && base44_host_preflight_evidence !== null) {
    throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_ONLY_BASE44");
  }
  if (requested_operation !== "INSTALL" && base44_host_preflight_evidence !== null) {
    throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_ONLY_INSTALL");
  }
  const workspaceDiscovery = workspace_discovery_evidence === null
    ? null
    : validateBase44WorkspaceDiscoveryEvidence(workspace_discovery_evidence);
  const evidenceWorkspaceRefs = workspaceDiscovery?.selected_workspace_refs || [];
  const suppliedWorkspaceRefs = normalizeWorkspaceRefs(host_id, workspace_refs);
  if (suppliedWorkspaceRefs.length && evidenceWorkspaceRefs.length
    && JSON.stringify(suppliedWorkspaceRefs) !== JSON.stringify(evidenceWorkspaceRefs)) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_PLAN_SCOPE_MISMATCH");
  }
  const selectedWorkspaceRefs = suppliedWorkspaceRefs.length ? suppliedWorkspaceRefs : evidenceWorkspaceRefs;
  const createdAt = new Date(created_at);
  const expiresAt = new Date(expires_at);
  if (!Number.isFinite(createdAt.valueOf()) || !Number.isFinite(expiresAt.valueOf()) || expiresAt <= createdAt) {
    throw new Error("CLOUDBOS_PLATFORM_PLAN_WINDOW_INVALID");
  }
  const base44HostPreflight = base44_host_preflight_evidence === null
    ? null
    : validateBase44HostPreflightEvidence(base44_host_preflight_evidence);
  if (base44HostPreflight) {
    const preflightRefs = base44HostPreflight.selected_workspace_skill_counts.map(({ workspace_ref }) => workspace_ref);
    if (JSON.stringify(preflightRefs) !== JSON.stringify(selectedWorkspaceRefs)) {
      throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_PLAN_SCOPE_MISMATCH");
    }
    const preflightAgeMs = createdAt.valueOf() - new Date(base44HostPreflight.observed_at).valueOf();
    if (preflightAgeMs < 0 || preflightAgeMs > adapter.host_preflight.maximum_age_seconds * 1000) {
      throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_EVIDENCE_STALE");
    }
  }
  const providerCompatibilityBlocked = adapter.provider_compatibility
    && !["COMPLETE_VERIFIED", "NOT_DECLARED", "CLIENT_DEFINED"].includes(adapter.provider_compatibility.status);
  const base44HostPreflightBlocked = host_id === "base44_build_ai"
    && requested_operation === "INSTALL"
    && base44HostPreflight === null;
  const base44WorkspaceRefsMissing = host_id === "base44_build_ai" && selectedWorkspaceRefs.length === 0;
  const base44WorkspaceDiscoveryMissing = host_id === "base44_build_ai"
    && requested_operation === "INSTALL"
    && workspaceDiscovery === null;
  const executionReady = !base44WorkspaceRefsMissing
    && !base44WorkspaceDiscoveryMissing
    && !base44HostPreflightBlocked
    && (requested_operation === "REMOVE" || !providerCompatibilityBlocked);
  const blockers = [];
  if (providerCompatibilityBlocked && requested_operation === "INSTALL") {
    blockers.push(adapter.provider_compatibility.install_blocker || "CLOUDBOS_HOST_OAUTH_PROVIDER_COMPATIBILITY_REQUIRED");
  }
  if (base44WorkspaceRefsMissing) blockers.push("CLOUDBOS_BASE44_SELECTED_WORKSPACE_REFS_REQUIRED");
  if (base44WorkspaceDiscoveryMissing) blockers.push("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_EVIDENCE_REQUIRED");
  if (base44HostPreflightBlocked) {
    blockers.push(adapter.host_preflight.install_blocker || "CLOUDBOS_BASE44_HOST_PLAN_AND_CAPACITY_PREFLIGHT_REQUIRED");
  }
  const base44WorkspacePermissions = selectedWorkspaceRefs.flatMap((workspaceRef) => requested_operation === "INSTALL"
    ? [
      { action: "OPEN_EXACT_BASE44_WORKSPACE_SKILLS", resource: workspaceRef },
      { action: "ADD_EXACT_WORKSPACE_SKILL", resource: `${workspaceRef}#${adapter.workspace_skill.sha256}` },
      { action: "ENABLE_EXACT_WORKSPACE_SKILL", resource: `${workspaceRef}#${adapter.workspace_skill.name}` },
    ]
    : [{ action: "REMOVE_OR_DISABLE_EXACT_WORKSPACE_SKILL", resource: `${workspaceRef}#${adapter.workspace_skill.sha256}` }]);
  const plan = {
    schema: HOST_PLAN_SCHEMA,
    host_id,
    installation_scope: adapter.installation_scope,
    requested_operation,
    endpoint: validatePublicMcpEndpoint(endpoint),
    target: adapter.target ?? "CLIENT_DEFINED",
    selected_workspace_refs: selectedWorkspaceRefs,
    workspace_discovery_evidence: workspaceDiscovery ? structuredClone(workspaceDiscovery) : null,
    ...(host_id === "base44_build_ai" ? { base44_host_preflight_evidence: base44HostPreflight ? structuredClone(base44HostPreflight) : null } : {}),
    mode: adapter.mode,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    zero_project_write: true,
    project_governance_implied: false,
    requires_approval: true,
    approval_ready: executionReady,
    execution_ready: executionReady,
    blockers,
    permissions: adapter.mode === "MERGE_FRAGMENT_ONLY"
      ? [{ action: requested_operation === "INSTALL" ? "MERGE_EXACT_ENTRY" : "REMOVE_EXACT_ENTRY", resource: adapter.target }]
      : adapter.host_id === "base44_build_ai"
        ? requested_operation === "INSTALL"
          ? [
            { action: "OPEN_BASE44_ACCOUNT_MCP_SETTINGS", resource: "BASE44_ACCOUNT_MCP_CONNECTIONS" },
            { action: "VERIFY_BASE44_PLAN_AND_ACCOUNT_MCP_CAPACITY", resource: "BUILDER_OR_HIGHER#MAX_20" },
            { action: "ADD_EXACT_OAUTH_MCP_WITHOUT_STATIC_HEADERS", resource: adapter.endpoint },
            { action: "TEST_AND_ADD_EXACT_ACCOUNT_CONNECTION", resource: adapter.display_name },
            ...base44WorkspacePermissions,
            { action: "VERIFY_EXACT_SELECTED_WORKSPACE_SKILL_CAPACITY", resource: "MAX_100_PER_SELECTED_WORKSPACE" },
            { action: "VERIFY_CONNECTION_SKILL_TOOLS_AND_ZERO_PROJECT_WRITE", resource: adapter.target },
          ]
          : [
            { action: "REMOVE_EXACT_BASE44_ACCOUNT_MCP_CONNECTION", resource: adapter.display_name },
            ...base44WorkspacePermissions,
            { action: "VERIFY_APPLICATION_AND_PROJECT_GOVERNANCE_PRESERVATION", resource: adapter.target },
          ]
        : adapter.host_id === "replit_agent"
        ? requested_operation === "INSTALL"
          ? [
            { action: "OPEN_REPLIT_INTEGRATIONS", resource: adapter.target },
            { action: "ADD_EXACT_CUSTOM_MCP_CONNECTION", resource: adapter.endpoint },
            { action: "COMPLETE_CLOUDBOS_OAUTH", resource: "CLOUDBOS_PUBLIC_OAUTH" },
            { action: "TEST_AND_SAVE_EXACT_CONNECTION", resource: adapter.display_name },
          ]
          : [{ action: "REMOVE_EXACT_CLOUDBOS_MCP_CONNECTION", resource: adapter.target }]
        : [{ action: "USER_OR_HOST_UI_ACTION", resource: adapter.target ?? "CLIENT_DEFINED" }],
    before_config_sha256: adapter.mode === "MERGE_FRAGMENT_ONLY" ? digest(existing_config) : null,
    after_config_sha256: null,
    generated_entry_sha256: adapter.mode === "MERGE_FRAGMENT_ONLY" ? digest(exactGeneratedConnection(adapter)) : null,
    adapter,
  };
  if (adapter.mode === "MERGE_FRAGMENT_ONLY") {
    const after = requested_operation === "INSTALL"
      ? applyHostAdapter(existing_config, adapter)
      : removeHostAdapter(existing_config, adapter);
    plan.after_config_sha256 = digest(after);
  }
  plan.plan_hash = hostPlanHash(plan);
  return plan;
}

export function validatePlatformInstallationPlan(plan) {
  if (plan?.schema !== HOST_PLAN_SCHEMA || plan.plan_hash !== hostPlanHash(plan)) {
    throw new Error("CLOUDBOS_PLATFORM_PLAN_TAMPERED");
  }
  if (!["INSTALL", "REMOVE"].includes(plan.requested_operation)
    || plan.zero_project_write !== true
    || plan.project_governance_implied !== false
    || typeof plan.approval_ready !== "boolean"
    || typeof plan.execution_ready !== "boolean"
    || !Array.isArray(plan.blockers)
    || !Array.isArray(plan.permissions)
    || !plan.permissions.length) {
    throw new Error("CLOUDBOS_PLATFORM_PLAN_INVALID");
  }
  validatePublicMcpEndpoint(plan.endpoint);
  const normalizedWorkspaceRefs = normalizeWorkspaceRefs(plan.host_id, plan.selected_workspace_refs || []);
  if (JSON.stringify(normalizedWorkspaceRefs) !== JSON.stringify(plan.selected_workspace_refs || [])) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_REFS_NOT_CANONICAL");
  }
  if (plan.host_id === "base44_build_ai") {
    if (!Object.hasOwn(plan, "base44_host_preflight_evidence")) {
      throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_EVIDENCE_FIELD_REQUIRED");
    }
    const missingRefs = plan.selected_workspace_refs.length === 0;
    const missingDiscovery = plan.requested_operation === "INSTALL" && plan.workspace_discovery_evidence === null;
    const hostPreflightBlocked = plan.requested_operation === "INSTALL"
      && plan.base44_host_preflight_evidence === null;
    if (plan.workspace_discovery_evidence !== null) {
      const discovery = validateBase44WorkspaceDiscoveryEvidence(plan.workspace_discovery_evidence);
      if (JSON.stringify(discovery.selected_workspace_refs) !== JSON.stringify(plan.selected_workspace_refs)) {
        throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_PLAN_SCOPE_MISMATCH");
      }
    }
    if (plan.base44_host_preflight_evidence !== null) {
      const preflight = validateBase44HostPreflightEvidence(plan.base44_host_preflight_evidence);
      const preflightRefs = preflight.selected_workspace_skill_counts.map(({ workspace_ref }) => workspace_ref);
      if (JSON.stringify(preflightRefs) !== JSON.stringify(plan.selected_workspace_refs)) {
        throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_PLAN_SCOPE_MISMATCH");
      }
      const preflightAgeMs = new Date(plan.created_at).valueOf() - new Date(preflight.observed_at).valueOf();
      if (preflightAgeMs < 0 || preflightAgeMs > plan.adapter.host_preflight.maximum_age_seconds * 1000) {
        throw new Error("CLOUDBOS_BASE44_HOST_PREFLIGHT_EVIDENCE_STALE");
      }
    }
    if (missingRefs !== plan.blockers.includes("CLOUDBOS_BASE44_SELECTED_WORKSPACE_REFS_REQUIRED")
      || missingDiscovery !== plan.blockers.includes("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_EVIDENCE_REQUIRED")
      || hostPreflightBlocked !== plan.blockers.includes("CLOUDBOS_BASE44_HOST_PLAN_AND_CAPACITY_PREFLIGHT_REQUIRED")
      || ((missingRefs || missingDiscovery || hostPreflightBlocked) && (plan.approval_ready || plan.execution_ready))) {
      throw new Error("CLOUDBOS_BASE44_WORKSPACE_SCOPE_GATE_INVALID");
    }
  } else if (plan.workspace_discovery_evidence !== null || Object.hasOwn(plan, "base44_host_preflight_evidence")) {
    throw new Error("CLOUDBOS_BASE44_WORKSPACE_DISCOVERY_ONLY_BASE44");
  }
  if (plan.mode === "MERGE_FRAGMENT_ONLY"
    && (!HASH_PATTERN.test(plan.before_config_sha256 || "")
      || !HASH_PATTERN.test(plan.after_config_sha256 || "")
      || !HASH_PATTERN.test(plan.generated_entry_sha256 || ""))) {
    throw new Error("CLOUDBOS_PLATFORM_PLAN_HASH_INVALID");
  }
  return plan;
}

export function applyPlatformInstallationPlan(existingConfig, plan, approval, now = new Date().toISOString()) {
  validatePlatformInstallationPlan(plan);
  if (plan.mode !== "MERGE_FRAGMENT_ONLY") throw new Error("CLOUDBOS_PLATFORM_PLAN_REQUIRES_HOST_UI");
  if (plan.execution_ready !== true) throw new Error("CLOUDBOS_PLATFORM_PLAN_NOT_EXECUTION_READY");
  if (approval?.approved !== true || approval.plan_hash !== plan.plan_hash) throw new Error("CLOUDBOS_PLATFORM_APPROVAL_MISMATCH");
  if (new Date(now).valueOf() > new Date(plan.expires_at).valueOf()) throw new Error("CLOUDBOS_PLATFORM_PLAN_EXPIRED");
  if (digest(existingConfig || {}) !== plan.before_config_sha256) throw new Error("CLOUDBOS_PLATFORM_PREWRITE_STATE_MISMATCH");
  const after = plan.requested_operation === "INSTALL"
    ? applyHostAdapter(existingConfig, plan.adapter)
    : removeHostAdapter(existingConfig, plan.adapter);
  if (digest(after) !== plan.after_config_sha256) throw new Error("CLOUDBOS_PLATFORM_POSTWRITE_STATE_MISMATCH");
  return after;
}

export function verifyPlatformInstallationPlan(config, plan) {
  validatePlatformInstallationPlan(plan);
  if (plan.mode !== "MERGE_FRAGMENT_ONLY") {
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_PLATFORM_INSTALLATION_READBACK_V1",
      status: "HOST_UI_READBACK_REQUIRED",
      host_id: plan.host_id,
      platform_installation_verified: false,
      project_governance_implied: false,
    };
  }
  const actualHash = digest(config || {});
  const verified = plan.execution_ready === true && actualHash === plan.after_config_sha256;
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_PLATFORM_INSTALLATION_READBACK_V1",
    status: verified ? "PLATFORM_INSTALLATION_CONFIG_VERIFIED" : "PLATFORM_INSTALLATION_CONFIG_DRIFTED",
    host_id: plan.host_id,
    requested_operation: plan.requested_operation,
    plan_hash: plan.plan_hash,
    expected_config_sha256: plan.after_config_sha256,
    actual_config_sha256: actualHash,
    platform_installation_verified: verified,
    project_governance_implied: false,
  };
}

export function verifyManualHostInstallationReadback(plan, readback) {
  validatePlatformInstallationPlan(plan);
  if (plan.mode === "MERGE_FRAGMENT_ONLY") throw new Error("CLOUDBOS_FILE_ADAPTER_REQUIRES_CONFIG_READBACK");
  if (readback?.schema !== "BOS_CLOUDBOS_PUBLIC_MANUAL_HOST_READBACK_V1"
    || readback.host_id !== plan.host_id
    || readback.plan_hash !== plan.plan_hash
    || readback.requested_operation !== plan.requested_operation
    || readback.project_governance_implied !== false
    || readback.project_write_observed !== false) {
    throw new Error("CLOUDBOS_MANUAL_HOST_READBACK_INVALID");
  }

  if (plan.requested_operation === "INSTALL") {
    const expectedTools = ["replit_agent", "base44_build_ai"].includes(plan.adapter.host_id)
      ? loadHostAdapterManifest().tools
      : null;
    const base44WorkspaceSkillVerified = plan.adapter.host_id !== "base44_build_ai"
      || (base44WorkspaceReadbacksMatch(plan, readback, ["ENABLED"])
        && readback.custom_static_headers_present === false
        && readback.runtime_dependency_observed === false);
    const verified = plan.execution_ready === true
      && readback.endpoint === plan.endpoint
      && readback.display_name === plan.adapter.display_name
      && readback.host_connection_status === "CONNECTED"
      && readback.oauth_status === "AUTHENTICATED"
      && Array.isArray(readback.tool_names)
      && expectedTools !== null
      && JSON.stringify([...readback.tool_names].sort()) === JSON.stringify([...expectedTools].sort())
      && readback.bos_connect?.platform_connection_state === "CONNECTED"
      && typeof readback.bos_connect?.project_governance_state === "string"
      && base44WorkspaceSkillVerified;
    return {
      schema: "BOS_CLOUDBOS_PUBLIC_PLATFORM_INSTALLATION_READBACK_V1",
      status: verified ? "PLATFORM_INSTALLATION_HOST_UI_VERIFIED" : "PLATFORM_INSTALLATION_HOST_UI_DRIFTED",
      host_id: plan.host_id,
      requested_operation: plan.requested_operation,
      plan_hash: plan.plan_hash,
      platform_installation_verified: verified,
      execution_was_ready: plan.execution_ready,
      project_governance_implied: false,
    };
  }

  const base44WorkspaceSkillRemoved = plan.host_id !== "base44_build_ai"
    || base44WorkspaceReadbacksMatch(plan, readback, ["REMOVED", "DISABLED"]);
  const verified = readback.host_connection_status === "REMOVED"
    && readback.oauth_status === "REMOVED_OR_REVOKED"
    && Array.isArray(readback.tool_names)
    && readback.tool_names.length === 0
    && readback.application_continuity === "COMPLETE_VERIFIED"
    && readback.project_governance_mutated === false
    && base44WorkspaceSkillRemoved;
  return {
    schema: "BOS_CLOUDBOS_PUBLIC_PLATFORM_INSTALLATION_READBACK_V1",
    status: verified ? "PLATFORM_REMOVAL_HOST_UI_VERIFIED" : "PLATFORM_REMOVAL_HOST_UI_DRIFTED",
    host_id: plan.host_id,
    requested_operation: plan.requested_operation,
    plan_hash: plan.plan_hash,
    platform_installation_verified: verified,
    application_continuity_verified: readback.application_continuity === "COMPLETE_VERIFIED",
    project_governance_implied: false,
  };
}

function cli() {
  const [hostId, endpoint] = process.argv.slice(2);
  if (!hostId || !endpoint) {
    throw new Error("Usage: node host-adapter.mjs <host_id|--catalog> <https://cloud-bos.example/mcp>");
  }
  const output = hostId === "--catalog"
    ? renderHostAdapterCatalog(endpoint)
    : renderHostAdapter(hostId, endpoint);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) cli();
