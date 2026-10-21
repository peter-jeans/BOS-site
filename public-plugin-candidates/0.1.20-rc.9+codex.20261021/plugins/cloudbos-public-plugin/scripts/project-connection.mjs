import { isDurablePlan, planIsCurrent } from "./approval-lifecycle.mjs";
import { activateProjectGovernance, resumeProjectGovernanceActivation, validateProjectGovernancePlan, verifyProjectGovernance, installedManifestFromPlan } from "./project-governance.mjs";
import { evaluatePublicProjectBaseline } from "./project-baseline.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOSTS = new Set(["codex", "claude_code", "base44_build_ai"]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }

// Host-owned orchestration, not an OAuth implementation or an authority server.
// callTool must call the selected host's live authenticated MCP connection.
// No tokens, private project files, transcripts or app data are accepted here.
export async function runPublicProjectConnection({
  route, host, project_ref, intent = "rebind", callTool, store,
  discovery_input, plan_request, baseline_evidence,
  current_plan, pending_plan, approval, approvePlan,
  assistance_preference, owner_requested = false,
  engine = { validate: validateProjectGovernancePlan, apply: activateProjectGovernance, verify: verifyProjectGovernance, resume: resumeProjectGovernanceActivation },
} = {}) {
  const result = {
    schema: "CLOUDBOS_PUBLIC_PROJECT_CONNECTION_V1",
    status: "BLOCKED", project_ref: ID.test(project_ref ?? "") ? project_ref : null,
    platform_connection: "NOT_CHECKED", project_binding: "NOT_CHECKED",
    project_grounding: "NOT_CHECKED", project_ready: false,
    framework_restoration: { status: "NOT_RESTORED", scope: "PUBLIC_ADVISORY_PROJECTION", private_ldp_restored: false },
    application_mutation_authorized: false, local_governance_applied: false,
    calls: [], acceptance_status: "BLOCKED", next_action: null,
  };
  const stop = (status, next_action) => Object.assign(result, { status, next_action });
  if (route !== "public") return stop("PUBLIC_ROUTE_NOT_SELECTED", "Preserve and activate the existing project route.");
  if (!owner_requested && assistance_preference?.cloud_enabled === false) return stop("ASSISTANCE_PAUSED", "Preserve the saved choice; no automatic service calls or capture.");
  if (!HOSTS.has(host)) return stop("HOST_NOT_SUPPORTED", "Select a supported, verified host adapter.");
  if (!ID.test(project_ref ?? "")) return stop("EXACT_PROJECT_REQUIRED", "Bind a stable non-secret project reference; never infer it from another task.");
  if (!["connect", "onboard", "rebind"].includes(intent)) return stop("INVALID_INTENT", "Use connect, onboard or rebind.");
  if (typeof callTool !== "function") return stop("HOST_CONNECTION_REQUIRED", "Install the public host connection and complete its supported OAuth flow, then rerun this same lifecycle.");
  const invoke = async (name, args) => {
    result.calls.push(name);
    const wire = await callTool(name, args);
    if (wire?.isError || wire?.error) fail("AUTHENTICATED_TOOL_CALL_FAILED");
    const value = wire?.structuredContent ?? wire;
    if (!value || value.tool !== name || !value.result) fail("LIVE_TOOL_READBACK_INVALID");
    return value;
  };
  const connect = async () => {
    const evidence = await invoke("bos_connect", { host, project_ref });
    if (evidence.status !== "READY" || evidence.result.platform_connection_state !== "CONNECTED"
      || evidence.result.transport_status !== "PASS" || evidence.result.thin_client_status !== "PASS"
      || evidence.entitlement?.source !== "CLOUD_BOS_D1_SERVER_RESOLVED"
      || evidence.entitlement?.client_claims_accepted !== false) fail("CURRENT_AUTHENTICATED_CONNECTION_REQUIRED");
    result.platform_connection = "CONNECTED";
    result.service_version = evidence.result.service_version;
    // This is the server's last observation. Fresh artifact readback follows.
    result.project_binding = evidence.result.project_governance_state;
    return evidence.result;
  };
  const boundPlan = (plan) => {
    engine.validate(plan);
    if (plan.project_ref !== project_ref) fail("PLAN_PROJECT_MISMATCH");
    if (store?.adapter_id !== plan.adapter_id) fail("PROJECT_ADAPTER_MISMATCH");
    return plan;
  };
  const verify = async (plan) => {
    boundPlan(plan);
    const readback = await engine.verify({ plan, store });
    const remote = await invoke("bos_project_governance_verify", { project_ref, readback });
    if (readback.governance_state !== "GOVERNED_ACTIVE" || readback.acceptance_status !== "COMPLETE_VERIFIED"
      || remote.project_governance_state !== "GOVERNED_ACTIVE") {
      result.project_binding = "STALE_OR_DRIFTED";
      result.repair_readback = readback;
      return stop("PROJECT_REPAIR_REQUIRED", "Obtain a fresh exact repair plan from observed hashes; preserve the installed project and its memory.");
    }
    const final = await connect();
    if (final.project_governance_state !== "GOVERNED_ACTIVE" || final.project_binding_verified !== true) fail("CURRENT_PROJECT_BINDING_NOT_VERIFIED");
    result.project_binding = "GOVERNED_ACTIVE";
    result.acceptance_status = "COMPLETE_VERIFIED";
    const baseline = evaluatePublicProjectBaseline({ ...baseline_evidence, project_ref });
    result.project_grounding = baseline.status;
    result.project_ready = result.project_grounding === "BASELINE_CURRENT_OWNER_ACCEPTED";
    result.framework_restoration = {
      status: result.project_ready ? "RESTORED" : "RESTORED_WITH_GAPS",
      scope: "PUBLIC_ADVISORY_PROJECTION", private_ldp_restored: false,
      project_ref, host, plan_hash: plan.plan_hash,
      baseline_sha256: baseline.current_baseline_sha256,
      material_gaps: baseline.material_gaps,
      // Only previously validated, accepted public fields enter restored context.
      working_context: result.project_ready ? structuredClone(baseline_evidence.baseline) : null,
      mutation_authority: "NONE",
    };
    return stop("PUBLIC_PROJECT_CONNECTION_READY", result.project_ready
      ? "Connection and public governance verified; apply the project-specific gates to the requested work."
      : "Connection and governance readback complete. Read the accepted baseline and reconcile only missing project requirements before governed work.");
  };
  try {
    const connected = await connect();
    await invoke("bos_capabilities", { host, project_ref, include_unavailable: true });
    if (intent === "connect") return stop("PLATFORM_CONNECTED", "Continue project onboarding or rebind; platform availability is not project readiness.");
    if (!store) return stop("PROJECT_ADAPTER_REQUIRED", "Connect the exact project filesystem or provider adapter for independent readback.");
    let repairing = false;
    if (["GOVERNED_ACTIVE", "STALE_OR_DRIFTED"].includes(connected.project_governance_state)) {
      const plan = current_plan ?? pending_plan;
      if (!plan) return stop("CURRENT_MANIFEST_READBACK_REQUIRED", "Load the exact previously issued project plan and current manifest through this project's adapter; do not create a replacement identity.");
      const verified = await verify(plan);
      if (verified.status !== "PROJECT_REPAIR_REQUIRED") return verified;
      repairing = true;
      if (!pending_plan && (!discovery_input || !plan_request)) return verified;
    }
    if (intent === "rebind" && !pending_plan && !repairing) return stop("PROJECT_ONBOARDING_REQUIRED", "Run onboarding for this exact project; a working platform connection did not install its governance.");
    const baseline = evaluatePublicProjectBaseline({ ...baseline_evidence, project_ref });
    result.project_grounding = baseline.status;
    if (!baseline.ready_for_governance_plan) {
      result.baseline = baseline;
      return stop("PROJECT_BASELINE_REQUIRED", "Platform connection is verified. Read existing public requirements and resolve only the reported gaps before governance planning.");
    }
    let plan = pending_plan;
    if (!plan) {
      if (discovery_input?.project_ref !== project_ref || discovery_input?.host !== host
        || plan_request?.project_ref !== project_ref) fail("EXACT_PROJECT_DISCOVERY_REQUIRED");
      const discovery = await invoke("bos_project_discover", discovery_input);
      if (discovery.result.status !== "ADAPTER_DISCOVERED") return stop("PROJECT_ADAPTER_BLOCKED", "Resolve the exact project's discovery blocker.");
      const requested = repairing ? { ...plan_request,
        requested_operation: "ROLLBACK", drift_repair: true,
        installed_manifest: installedManifestFromPlan(current_plan),
        expected_prior_sha256: Object.fromEntries(result.repair_readback.manifest_checks.map(row => [row.target, row.actual_sha256])),
      } : plan_request;
      const planned = await invoke("bos_project_governance_plan", { ...requested, discovery_input });
      if (planned.project_governance_state !== "GOVERNANCE_PLAN_READY") fail("SERVER_PLAN_NOT_READY");
      plan = planned.result;
    }
    boundPlan(plan);
    if (repairing) {
      if (plan.requested_operation !== "ROLLBACK" || plan.repair_mode?.type !== "EXACT_BOUND_MANIFEST_DRIFT_REPAIR") fail("REBIND_REQUIRES_EXACT_BOUND_REPAIR_PLAN");
    } else if (plan.requested_operation !== "ACTIVATE") fail("ONBOARDING_REQUIRES_INITIAL_ACTIVATION_PLAN");
    result.plan = plan; // Exact server-issued bytes/fields remain reviewable.
    const durable = isDurablePlan(plan);
    const decisionArgs = { project_ref, project_binding_id: plan.project_binding_id, plan_hash: plan.plan_hash };
    const priorDecision = durable ? await invoke("bos_project_governance_decision", { ...decisionArgs, decision: "READ" }) : null;
    const accepted = priorDecision?.result?.approval ?? approval ?? (typeof approvePlan === "function" ? await approvePlan(plan) : null);
    if (!accepted) return stop("GOVERNANCE_PLAN_READY", "Review and approve this exact plan hash; resume with pending_plan and that approval.");
    if (accepted.approved !== true || accepted.plan_hash !== plan.plan_hash
      || accepted.project_ref !== project_ref || accepted.project_binding_id !== plan.project_binding_id
      || accepted.platform_installation_id !== plan.platform_installation_id) fail("EXACT_PLAN_APPROVAL_REQUIRED");
    if (!planIsCurrent(plan)) fail("PLAN_EXPIRED");
    if (durable && !priorDecision?.result?.approval) await invoke("bos_project_governance_decision", { ...decisionArgs, decision: "APPROVE" });
    // Approval may take time. Recheck live access before any local write.
    await connect();
    if (durable) {
      const current = await invoke("bos_project_governance_decision", { ...decisionArgs, decision: "READ" });
      if (current.status !== "PLAN_APPROVED") fail("DURABLE_APPROVAL_REQUIRED");
    }
    const observed = await engine.verify({ plan, store });
    // Resume an interrupted local apply without overwriting installed artifacts.
    const applied = observed.governance_state === "GOVERNED_ACTIVE" && observed.acceptance_status === "COMPLETE_VERIFIED"
      ? await engine.resume({ plan, approval: accepted, store }) : await engine.apply({ plan, approval: accepted, store });
    result.local_governance_applied = true;
    if (applied.governance_state !== "GOVERNED_ACTIVE" || applied.acceptance_status !== "COMPLETE_VERIFIED") fail("LOCAL_GOVERNANCE_READBACK_FAILED");
    await invoke("bos_project_governance_activate", { project_ref, plan, approval: accepted, readback: applied });
    return await verify(plan);
  } catch (error) {
    result.project_ready = false;
    result.acceptance_status = result.local_governance_applied ? "PARTIAL_VERIFIED" : "BLOCKED";
    // No arbitrary transport error or exception text is echoed: it may contain
    // credentials. Retain only known local codes; the host handles OAuth errors.
    result.failure = /^[A-Z][A-Z0-9_]{0,95}$/.test(error?.code ?? "") ? error.code : "LIVE_CONNECTION_OR_READBACK_FAILED";
    return stop("BLOCKED", result.local_governance_applied
      ? "Local governance exists but cloud confirmation failed. Preserve the exact pending plan and approval, then retry; do not report the project active."
      : "Resolve the named host, access, target or readback failure and rerun; do not switch to another connection.");
  }
}
