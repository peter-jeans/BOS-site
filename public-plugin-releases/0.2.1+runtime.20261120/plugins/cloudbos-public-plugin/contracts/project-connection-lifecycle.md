# Public host onboarding and rebind

`scripts/project-connection.mjs` exports `runPublicProjectConnection(options)`.
It is a host coordinator; MCP results must come from the host's current supported
authenticated connection. Do not replace a missing MCP bridge with saved responses.
The helper does not register accounts, authorize OAuth, or grant entitlements.

Supply `route: "public"`, `host: "codex"` or `"claude_code"`, an exact non-secret
`project_ref`, and `callTool(name, args)` returning live MCP CallToolResult or its
structuredContent. Supply the actual bounded filesystem store from
`createLocalRepositoryGovernanceStore`. `intent` is `connect`, `onboard` or `rebind`.
Connection checks run without product grounding. No input takes credentials.

For onboarding, provide current `discovery_input`, existing MCP `plan_request`
fields and `baseline_evidence` for the accepted public baseline. The baseline is
evaluated locally; extra baseline fields are never added to the MCP schema.
Without approval the coordinator returns the exact server-issued `plan` and
`GOVERNANCE_PLAN_READY`. The host presents this concrete result for approval.
Resume with the unchanged `pending_plan` and exact `approval`, or provide an
`approvePlan(plan)` callback that returns the owner's actual approval. Never
synthesize that approval. Live access is checked again before writes.

Persist the exact issued plan and owner approval through the host's existing
project evidence channel. Do not reconstruct or shorten them. If local activation
finishes but cloud confirmation fails, retain this evidence and rerun. Matching
artifacts undergo fresh readback and application-preservation verification, with
zero local writes on resume. Legacy expired plans and materially changed proposals require a fresh plan.
Durable proposals have no human deadline: the coordinator records approval
through bos_project_governance_decision and restores it using READ after a
restart. It refreshes live access and decision/binding checks before adapter
writes, then verifies fresh exact evidence. CANCEL is explicit and terminal.

For rebind, load that project's exact prior issued plan as `current_plan` and
perform fresh artifact readback. The server's saved active flag alone is
insufficient. After server verification a final `bos_connect` must confirm both
`GOVERNED_ACTIVE` and `project_binding_verified: true`. Missing current plan or
manifest means readback is required; it never authorizes another initial install.

| Result | Meaning / continuation |
| --- | --- |
| HOST_CONNECTION_REQUIRED | Finish host installation and supported OAuth; retry |
| PLATFORM_CONNECTED | Service reachable; project governance still unverified |
| PROJECT_ONBOARDING_REQUIRED | Exact project has no active public governance |
| PROJECT_BASELINE_REQUIRED | Connection works; reconcile only material baseline gaps |
| GOVERNANCE_PLAN_READY | Exact server plan available for review; zero local writes |
| PROJECT_REPAIR_REQUIRED | Current artifacts drifted; obtain an exact repair plan |
| PUBLIC_PROJECT_CONNECTION_READY | Connection and project governance verified |
| BLOCKED / PARTIAL_VERIFIED | Preserve installed state and resolve the named failure |

`project_ready` additionally requires accepted current baseline evidence.
`application_mutation_authorized` remains false: use the normal gates for work.
The coordinator is not editor write interception, a health certificate or proof
that all capabilities are installed.

Base44 must keep its existing app-native profile and session-memory coordinator,
exact app/revision readback and native AI Controls stage. The default three-file
engine is not a Base44 adapter. Any host using a different engine must supply its
actual validate/apply/verify/resume implementation and provider store; injected
evidence is not independently authenticated by this helper. Never use a local
repository store to imitate a Base44 app.

If the host cannot expose a callable MCP bridge to this module, perform the same
live tool sequence directly with the existing adapter and approval gates. Report
which path ran. Neither installed helper files nor the SessionStart context hook
prove that the host has completed this sequence.

## Restored public context

The lifecycle returns `framework_restoration` with scope
`PUBLIC_ADVISORY_PROJECTION`. `RESTORED` requires current authenticated connection,
exact artifact/server binding verification and a current owner-accepted public
baseline. Load `working_context` into the task before proceeding. It includes the
accepted purpose, workflows, acceptance criteria, environment constraints,
exclusions and active intention. Missing grounding returns `RESTORED_WITH_GAPS`
and a null working context; failed binding remains `NOT_RESTORED`. Connection
checks run before questions. This never restores or claims a private Master LDP.

## Bounded drift repair during rebind

The same lifecycle now prepares or resumes an exact bound-manifest drift repair
when fresh hashes show drift and the host supplies the original bound plan and
project discovery/plan inputs. It retains the exact plan-hash approval and current
authenticated access checks. Missing planning evidence returns the named repair
requirement without writing. No unapproved replacement, identity change, or
application modification is implied. Saved Cloud-off preferences suppress
automatic calls; explicit one-shot requests do not change saved preferences.

Next-step advisory validation checks a structured record and its visible footer.
It does not attest host controls or the completion of guidance/readback work.
Base44 exposes a workflow helper; no native Stop interception is claimed.

## Durable saved connections

Native host acceptance must show access expiry followed by refresh, unchanged
issuer/subject/client/resource, preserved consented scopes, reopened connection,
fresh project readback and explicit revocation denial. Codex, Claude and Base44
require separate observations. A resource-server simulation, package install,
or successful initial token cannot satisfy this test. Never retry a consumed
refresh token after an uncertain network result; use the native provider/host
recovery workflow. Do not delete project governance to repair authentication.

Owner repair requirement, 11 October 2026: preserve the saved connection until
explicit revocation, with payment currentness applying only to customer paid
capabilities. This requirement is not a claim that host renewal is installed or
verified. The host/provider must renew expiring access tokens under the existing
grant; an expiring token, chat restart, plugin update or payment lapse must not
delete a platform/project binding or cause another governance installation.

Keep authentication separate from current server entitlement. Payment lapse
suspends paid access under the applicable grace/trial/free rules and retains the
saved connection and app governance. Verified payment restoration restores
authorized access without reinstalling. Founder/creator and billing-exempt
grants remain exempt only when verified by server authority; provider claims or
display labels never grant an exemption.

Revocation and security suspension must still deny access. Reject expired tokens;
a fresh token cannot override a revoked binding. Preserve installed state during
temporary transport failure or required host reauthentication and report the
specific limit. Disclose any provider session cap that prevents the enduring
requirement. Do not disable token validation, accept a permanent shared key, or
promote a disposable beta issuer to production authentication.

Verify actual refresh, resource/scope preservation, replay protection, revocation,
signing-key rotation and saved connection after reopen independently for each
host. Local signed-token simulations verify resource-server behaviour only.
Use `OS/BOOTSTRAP/CLOUD_BOS_PROJECT_CONNECTION_LIFECYCLE.md` as the canonical
requirement and retain the existing provider/migration/deployment approval gates.
