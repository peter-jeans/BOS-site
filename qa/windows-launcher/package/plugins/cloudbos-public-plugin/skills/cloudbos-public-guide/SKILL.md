---
name: cloudbos-public-guide
description: Connect explicitly public Cloud BOS projects and use public Level-1 advisory tools. Preserve existing private or local BOS project bindings; this skill is not the private owner connector or a fallback for its failures.
---

# Cloud BOS Public Guide

## Owner controls before automatic activation

After selecting the verified public route, read the exact app's installed BOS
assistance preference before automatic BOS work. In Base44 use the authorized
`bosAssistancePreference` function with `action: READ` (or its admin-only
`BOSAssistancePreference` entity). Respect `local_enabled` and `cloud_enabled`
independently. Local off keeps recovery resources passive and suspends
optional local BOS gates. Cloud off skips automatic connect/discovery/guidance.
Both off suppress new BOS behavioral usage/learning capture, without replay.
Ordinary authorized app work and actual app security continue.

Sync the saved choice through `bos_assistance_preference`: READ the exact
project, then SYNC the two booleans, `app_revision` and `expected_revision`.
Use the existing authenticated project route. On conflict reread both sources;
never overwrite a newer app-admin choice. Missing service support or sync is a
visible pending state, not an editor lock. A host acknowledgment proves only
that host's projection. An explicit one-shot BOS request may set
`params._meta.bos_owner_requested: true` for that invocation; it does not
resume assistance or bypass entitlement/security. Missing installed preference
readback is uncertainty, not permission to invent On/Off or collect telemetry.
These owner choices take precedence over automatic activation below. Updating
governance files themselves still requires the existing exact-plan approval.

The current saved-preference rollout supports Base44 only. Codex and Claude
Code do not yet have a qualified native persistent assistance control. Report
that support as unavailable; never treat a missing control as assistance On.
An explicit one-shot request can use the existing owner-requested route for
that invocation. It does not enable continuous assistance or behavioral capture.

## Route selection before activation

Apply the current project's verified host binding before selecting a connection.
If host instructions bind it to a private or local BOS bridge, leave activation
to that bridge and stop this public activation sequence. Installing this plugin
does not migrate a project or override its existing binding. A failing private
connection must not trigger public onboarding. Do not read private BOS files or
credentials to select a route.

Continue below only for an explicitly requested public connection or a verified
public project binding. If a generic request has no known route, report the
missing binding and clarify the intended connection before calling a service.
An explicit public connection check may establish platform availability while
leaving any existing project binding intact.

Install or enable the public plugin, skill, MCP connection and platform
authentication once per coding-platform identity. This makes Cloud BOS
available but does not govern the current project.

For public OAuth, use only the host's supported browser authorization flow
against the authorization server advertised by Cloud BOS. Never paste an
access token into project files or source control. An unknown or unlinked OAuth
identity must fail closed; it does not create a platform installation on first
use.

Start with `bos_connect`. Read `platform_connection_state` and
`project_governance_state` separately. Never describe a project as governed
unless its state is `GOVERNED_ACTIVE` and `project_binding_verified` is true.
`client_version` is optional and must match its live schema. Do not pass a full
plugin build label containing `+` when that schema excludes it; omit the field
or use the supported core version. Keep the actual full plugin version in usage
records and installation receipts.

On a supported host with a freshly read saved choice enabling Cloud BOS,
run this read-only activation automatically on new, resumed, compacted or
app-switched sessions after selecting the public route. Otherwise preserve the
preference uncertainty and use only an explicit one-shot request. The bundled SessionStart hook injects
route-selection guidance before the activation sequence; it makes no connection
call by itself. If MCP is still starting, retry once at the first prompt.
Then call `bos_connect` with the exact project reference and current host, and
`bos_capabilities`; verify the project manifest and durable intentions before
continuing. The hook itself cannot establish authentication or app currentness.

For an unbound project, use read-only adapter discovery, then obtain an exact
zero-write governance plan. Project mutation requires approval bound to the
plan hash, followed by environment-specific activation and readback. Do not use
full-LDP onboarding as the public default.

For an already governed public project, `bos_connect` and `bos_project_spec_check`
restore `specification_acceptance` from durable storage. Compare its specification
file hash with fresh saved bytes. A stored receipt is an authenticated host report
of an owner decision, not independent proof of human intent or permission to edit.
Unchanged acceptance survives new chats and ordinary code revisions. Evidence age
means current file readback age, not age of the original owner decision.

When a receipt is missing, recover an inspectable existing exact-project decision
before asking again. Use `bos_project_governance_decision` with `subject:SPECIFICATION`
and `READ`, `ACCEPT` or `REVOKE`; consult its live schema. Writes require an explicit
owner decision, exact spec digest, revision, hashed decision-evidence reference,
unique receipt ID and previous receipt ID (null initially). Confirm readback before
claiming it saved. Never auto-accept from a summary, matching checksum, baseline
object digest or plan approval. A revoked receipt remains revoked on retries.
Unavailable storage requires recovery, not repeat owner acceptance or fabricated
readiness. This route requires an active exact binding; first onboarding retains
its separate baseline and exact-plan gates. Operation authorization, effects and
environment are checked separately from specification acceptance.

Connection checks and rebind readback do not require a new product specification.
Complete these checks first, then report any separate grounding gaps. Before
planning governance writes or claiming readiness for governed product work, read the existing accepted
public specification and ask only for material gaps. Record purpose, users,
workflows, acceptance criteria, maturity, development host, exclusions and active
intention. Separately record execution platform, devices, OS/browser versions,
offline/background requirements and unresolved constraints. Acceptance must be
bound to the exact project and baseline hash, with current provider revision
readback; chat memory is not acceptance evidence.

The bundled `scripts/project-baseline.mjs` evaluates this evidence for the
onboarding planner. Its decisions are advisory host checks: caller-supplied
evidence does not authenticate an owner or prove server enforcement or editor
write interception. Durable delivery and native host enforcement require their
own exact artifact and behavioral readback. Do not add unsupported baseline
fields to an MCP request schema or claim a helper result installed them.

For Codex and Claude Code local projects, the bundled
`scripts/project-connection.mjs` exports `runPublicProjectConnection`. Use it
through the host's authenticated MCP bridge and the existing exact filesystem
adapter. It executes fresh connect/capabilities, discovery, server planning,
approved local activation, cloud confirmation and independent verification.
The integration contract is `contracts/project-connection-lifecycle.md`.

For Codex/Claude local folders, also follow [the local bootstrap contract](../../contracts/local-project-bootstrap.md). The server three-file projection alone omits native instructions and accepted project memory. Prepare the combined exact-root host plan with `prepareLocalProjectBootstrap`, show its file contents/hash for actual owner approval, then use `activateLocalProjectBootstrap` with the live bridge. Use `verifyLocalProjectBootstrap` for a fresh-session readback. Keep the original server plan unchanged. Deep folders and monorepo subfolders are supported without Git initialization; ancestor instruction inheritance does not transfer BOS binding or approval. Package installation is separate from each exact project setup. The local bootstrap currently supports one host/platform binding per folder. A different host on that same folder returns `LOCAL_PROJECT_HOST_ATTACHMENT_REQUIRED`; preserve the first host and do not delete/reseed artifacts or reuse credentials to bypass it. Do not claim shared-folder multi-host coexistence. Native loading remains unverified until that host reads the saved entry point in a new session.

It never obtains credentials or invokes missing tools on its own. If the host
cannot expose a callable bridge to the module, carry out the same tool sequence
directly and preserve its checks and distinct outcomes. The hook remains context
only; module presence is not evidence of a live connection.

For a requested native Codex/Claude response readback, use the bundled
`scripts/native-response-readback.mjs` export `buildNativeResponseReadback`
with the existing live authenticated bridge. Supply current exact root, host,
project, chat/request context and independently retained approved artifact hashes;
do not derive the expected hashes from the same files being verified. Follow the
bootstrap contract's specification-representation and acceptance checks. Retain
unknown fields and its separate guidance/loading/assistance limits. This helper
neither installs a native hook nor proves that a host emitted or followed its
header. If no callable bridge is available, use the supported direct sequence
above and report the limit; do not invent a credential relay. Follow the
contract's Claude setup and qualification steps before claiming native readiness.

For rebinding, load the exact prior server-issued plan through the host's saved
project evidence and verify current artifacts before asking grounding questions.
Never issue a new identity to hide missing or drifted evidence. After interrupted
activation, retain the exact pending plan and approval and resume; already
installed matching artifacts are read back without rewriting them. Missing MCP
is `HOST_CONNECTION_REQUIRED`, uninstalled governance is
`PROJECT_ONBOARDING_REQUIRED`, drift is `PROJECT_REPAIR_REQUIRED`.
`PUBLIC_PROJECT_CONNECTION_READY` verifies connection and governance only;
`project_ready` additionally requires the current accepted baseline. Base44 keeps
its app-native profile, revision, native AI Controls and session-memory workflow;
do not use the three-file local adapter for Base44.

On an already active binding, distinguish a stored planning record's
`PLAN_NOT_CURRENT` from failed installed-file verification. Preserve the approved
local plan and any missing audit-readback limitation; verify the installed
projection through `bos_project_governance_verify` and read specification
acceptance with `subject: SPECIFICATION`. An expired/unavailable planning record
does not by itself revoke an unchanged specification or require new onboarding.
New governance writes still need their own current exact approved plan.

Device feasibility guidance is available at Standard. Missing target evidence
means a bounded test is needed; it does not establish impossibility. A warning
may offer an explanation, a scoped test or Later without authorizing execution.
Respect dismissal and the 24-hour cooldown for the same project, baseline and
warning set; changed evidence permits a fresh relevant notice. A scan plan is
not an executed scan or verified physical-device behavior.

- Use `bos_project_discover` to classify the current project without writing it.
- Use `bos_project_governance_plan` to inspect every proposed write, permission,
  prior checksum and rollback/removal boundary.
- `/bind` (also “bind this app” or “connect BOS to this app”) enters the existing app lifecycle at any development stage. On Base44, use `customer_entry.binding_entry` and `planBase44AppBinding`, an alias of the existing onboarding planner. Inspect the current app and preserve product source, data, auth and integrations. An already bound app needs current readback/context restoration, not reinstall or repeated valid approval. An unbound existing app uses its implemented state and existing specification; ask only material gaps. A stale binding or clone uses the existing repair/rebind route without inherited approval. Preserve private/direct/local routes and owner assistance choices; the command neither migrates authority nor resumes paused assistance. Local Codex `/bind` keeps its existing local meaning.
- Base44 /onboard and /onboard auto remain compatibility routes. Use the workspace skill to continue exact app discovery, accepted specification, plan approval, byte-preserving retention, installation, activation, native UI readback and fresh-session memory. Customer acceptance uses Base44/browser steps; external observers only read evidence. No local wrapper or hidden installer counts as customer completion.
- Use the manifest-verified `scripts/base44-app-governance-profile.mjs` and its profile contract to construct lifecycle readback from actual independent provider observations. Keep helper/download/scratch files outside the app repository. Inspect the whole changed-file list; extra paths block completion. Publishing or importing the helper supplies no authority or independent evidence.
- For Base44 product work, follow `contracts/base44-workspace-reference.json` → `build_checks` proportionately. Inspect affected source, intent and effects before editing; native tools suffice for ordinary authorized work. The checksum-verified build/activation helpers are optional diagnostics, not prerequisites. Reuse valid scope and approval. Report actual saved changes/tests after each batch; unavailable independent readback limits claims rather than stopping subsequent work. Existing app-control updates retain exact-plan approval and historical-byte recovery.
- For accepted product decisions and build intentions follow `contracts/base44-workspace-reference.json` → `project_recording`, preserving the LDP decision contract through the lean app adapter. Read existing records on resume, record at batch closeout, respect pause controls, and verify source save separately from live display. Ordinary records do not require a fresh governance-install approval. Never overwrite existing app records on upgrade.
- Apply `build_checks.execution_continuity`: refresh remembered helper/tool failures against the current permitted host/mode; never evade an actual denial. Cite the real governing source, affected action and current evidence for a hard stop, rather than inventing a rule from diagnostic UNKNOWN. A feasible test plan precedes edits; post-build results and optional viewport/emulation facilities do not. Carry accepted routes and observable outcomes across batches without a new mandatory document or approval. Controller-added pixel targets are not owner requirements. Report actual invocation, saved changes and observed behavior separately; acknowledgements prove recording only.
- Before presenting a Base44 plan for approval, map every accepted material requirement to exact proposed artifact text. Missing requirements block presentation even when checksums pass. Correct the supported inputs and obtain a new server plan without reaccepting an unchanged baseline. This is a host comparison, not proven semantic server enforcement.
- At baseline acceptance and exact plan approval, explicitly show **Your action required**, the app, scope, exact reply and waiting state. Offer corrections or Later. Baseline acceptance prepares a plan only; it does not approve installation. Acknowledge an unambiguous existing decision without asking again.
- Base44 revision discovery starts with fresh native Git HEAD and status from the verified app workspace. If unavailable, report the missing current revision gate; do not probe SDK or private authentication APIs.
- Base44 app-native project_ref must equal `base44:<adapter_context.app_id>`; names, bare IDs and `app-` prefixes are invalid. Prefer `PLAN_DOWNLOAD_V1` and verify the original bytes in native code, not chat-transcribed chunks.
- For Base44 durable memory, provide `base44_profile.profile_id` (normally
  `LEAN_CORE_WITH_BUILD_GATES`), the accepted specification and active build
  intention, plus the exact app ID and current provider revision. The returned
  app-native plan uses documents/governance artifacts. Legacy three-file plans
  cannot represent this profile. Exact repair uses a fresh `ROLLBACK` plan with
  the bound manifest text, complete restoration contents and observed hashes.
- Treat only the returned current server-anchored plan as approvable; never
  reconstruct, shorten or substitute a plan or installed manifest locally.
- Apply the approved plan through the environment adapter, then use
  `bos_project_governance_activate` with the exact local/app-native readback.
- Use `bos_project_governance_verify` for currentness and drift checks.
- For local repositories use the bounded `.cloudbos/governance` filesystem
  adapter; for GitHub and Base44 require exact provider revision readback. A
  no-write host stays LIMITED/BLOCKED unless a project-visible projection
  provider verifies it.
- Use `bos_project_governance_remove` only after the local adapter verifies
  manifest-owned removal and application preservation.

- Use `bos_assess_project` for a compact stage and complexity assessment.
- Use `bos_project_spec_check` to identify missing public project-spec fields.
- Use `bos_maturity_next` for the next maturation step.
- Use `bos_scan_plan` to choose a read-only scan sequence. The bound target
  host, not Cloud BOS, executes the returned scan IDs against its own project.
  Reconfirm the exact project and current host-visible revision, inspect only
  with that host's read-only tools, and distinguish observed source facts from
  inferred risks and untested runtime/platform behavior. If source, revision or
  required evidence is unavailable, mark the run partial or blocked.
- Return a compact finding report with scan ID, stable finding ID, severity,
  confidence, current source revision (or `UNKNOWN`), evidence locator, smallest
  proposed fix, verification check and evidence gaps. Prepare a zero-write,
  risk-ordered fix plan from those findings. If actionable findings exist, offer
  `/scanfix <finding IDs>` (also recognize `/SCAN FIX <finding IDs>`) and ask one
  clear Yes/No question about continuing with those named fixes. Apply this
  same post-scan handoff to every scan type. Yes continues only through exact
  target/scope preflight and all normal owner-approval and readback gates; No
  records the decline and stops. A Yes never bypasses those gates. Keep raw
  source, logs, records and secrets on the target host. A plan, host report or
  usage acknowledgement is not a Cloud BOS scan execution or independent
  verification.
- Route `/scanfix` through `bos_scanfix_plan` with the bound `project_ref`,
  current scan ID/status, exact current source revision, finding IDs and the
  user's Yes/No response. If the scan or revision is absent/unknown, or a
  finding is not selected from that scan, stop and request a fresh read-only
  scan or selection. The tool returns the canonical planner contract; it does
  not execute a scan/fix or grant write authority. Yes allows only target-host
  exact-scope preflight and the usual independent approval, backup, readback
  and verification gates. No stops without mutation.
- Use `bos_health_snapshot` for a bounded project-health view.
- Use `bos_capabilities` to show currently granted and available public tools.

Keep inputs privacy-minimal. Do not send secrets, credentials, customer records,
raw logs, private source, private receipts, `.bos`, DevPack or LDP material.
Use a stable non-secret `project_ref` only when the host has one.

Treat results as evidence-bounded guidance, not mutation authority. The public
plugin does not install or expose LDP:FULL, execute payments, generate a
personal quote or grant a tier because project complexity recommends it. A
governed project receives only the minimal public-safe projection selected for
its environment.

Platform-plugin removal and project-governance removal are separate. Remove
only the exact platform registration or manifest-owned governance artifacts;
preserve application source, data and runtime behaviour.

Websites and hosting control planes are not Cloud BOS plugin hosts. Do not use
Sites, Cloudforge, Cloudflare Pages or any website host to install, run,
deploy, manage or authenticate this plugin. An owner-selected support,
privacy, terms or homepage URL is only a passive external link; it grants no
plugin, project-governance, data, authentication or entitlement authority.

Version 1 runtime support is exactly Codex, Claude Code and Base44. Host
definitions retained for later research are withheld from the V1 runtime
catalogue, adapter renderer and installation planner; they fail closed until a
future owner-approved release line explicitly enables them.

If the MCP server is missing, unauthenticated or not live-verified, state the
connection limitation. Do not imitate unavailable BOS tools from memory or
claim the plugin is active based only on its files being present.

## Durable proposals and owner decisions

New server plans declare `approval_lifecycle: DURABLE_EXACT_PLAN_V1` and
`expires_at: UNTIL_INVALIDATED`. Do not present a countdown or ask the owner to
repeat approval merely because time passed. Legacy timestamped plans retain
their issued policy; never modify a stored plan or fabricate its approval.
Use `bos_project_governance_decision` with exact project_ref, project_binding_id,
plan_hash and decision READ to restore the recorded decision. Use APPROVE only
after explicit approval of that displayed hash, and CANCEL only after explicit
owner cancellation. Immediately before host writes, READ again and refresh the
accepted baseline, current revision and prior hashes. Changed scope, authority,
manifest or relevant state requires a newly reviewed proposal. Expired machine
evidence or download credentials can be refreshed without new owner consent.
Complete with fresh independent execution proof. Cancellation/consumption is
terminal; an interrupted executing claim requires reconciliation, not replay.

## Customer access and continuity

Read `contracts/commercial-model.json` and the authenticated service's `commercial_model`
for the current programme. Describe active cloud help as a trial followed by retained installed stabilisation and records; do not promise free access throughout beta. Read actual access dates and allowances from the authenticated service. Standard prices
are approved; usage allowances and paid launch remain pending. Never quote the retired A$39/A$99 beta sales ladder,
promise unlimited free access, invent a remaining balance, or ask for payment to fix
a BOS defect. A capability restriction is not evidence that payment can unlock it.

The approved direction is a generous starter across several useful sessions, clear
advance notice and a budgeted wrap-up of an already-started bounded workflow, followed
by retained readable/exportable project records and stabilisation-only access, with optional
non-renewing Build Passes or recurring membership. Those later stages are planned,
not active account states. Post-beta active access has a seven-day wind-down for already-started workflows only, followed by no fresh active governance until a plan is active. Preserve current server grants and existing commitments.

Use verified contributions to explain value; label estimates and never infer a trust
score or savings invoice. Do not count repeated warnings or BOS's own defects as new
value. Respect a declined invitation; no repeated sales prompts or surprise expiry.
Provide self-service guidance and the existing structured plugin-defect reporting
route, without promising personal support or a response time. Record access comes
with published retention terms; do not invent a perpetual hosting commitment.

Whenever advising about allowances, limited help, pass expiry, cancellation or payment,
prominently explain: **BOS stabilisation stays with your app.** Your installed build rules, existing checks, decisions and project memory remain in place. A pass or subscription funds additional active governance—new reviews, scans, planning and guidance.
Use the word stabilisation and concrete examples; do not describe this only as a
"BOS workflow". Existing safety and approval requirements must not be weakened for
payment. Existing checks depend on your development tools. Cloud-powered help uses your service allowance; platform, hosting and AI costs remain separate. This is a continuity policy, not a claim that
checks ran, the app is healthy or cloud service is unlimited. State it with relevant
advice, without repeating a sales notice on every unrelated response.

Only server-verified account evidence can establish access, usage or a future pass.
A public catalogue, client flag, plugin reinstall or another host grants nothing.
No automatic charge, checkout or usage restriction is activated by this model.

Approved Standard prices after beta are AUD15 for a seven-day non-renewing pass from activation, or AUD29/month by subscription. Trial access does not promise free cloud help indefinitely or throughout beta. These future prices are not a live checkout offer; no automatic conversion. The 10 workflows per pass and 50 per month are provisional test limits, not live sale terms. Use the bundled commercial-model.json rather than old Plus/Pro beta price examples.

## Active-governance workflow continuity

Before an active-governance call, inspect its current tool schema. Native MCP
clients use the advertised `bos_workflow` tool argument; a bridge that supports
the transport envelope may use `params._meta.bos_workflow`. Supply a unique
`request_key`, a stable `purpose_hash` for the agreed review/change plan and the
returned `workflow_id` for bounded follow-up. Use only the supported surface;
do not invent metadata fields or alternate credentials. Reuse a request key
only to retry identical input. Do not reset workflow identity to bypass usage
limits. Display server-returned dates and access state; never invent a grant.
During the seven-day wind-down, finish only already-started workflows. Once it
ends, stop new cloud analysis and guidance while retaining installed stabilisation
and saved records. Trial requests retain existing access and project gates.

## Proportionate preflight mitigation

Retain a preflight issue's identity across retries and rerun the original check after a change. For routine, bounded issues, explain the finding and use the smallest supported correction within the user's existing intent and applicable authority. Do not require a ranked packet or three alternatives for routine work. Use a mitigation review when the issue leaves a consequential unresolved choice or an applicable rule explicitly requires remediation comparison; compare credible options, explain why any shortlist is smaller than three, and keep the current scope and owner decisions. A different tool cannot bypass a failed rule. If a concrete applicable safety or authority rule still fails, stop that affected action and name the rule, risk and smallest resolution. Record what was actually done and the verification limit.

Use the verified host workflow's mitigation evaluator where exposed, but treat optional diagnostic/helper unavailability as an evidence gap rather than an ordinary-work veto. Supply the issue inventory explicitly, including an empty list for a clean preflight. Reviewed references are evidence-consistency inputs, not authentication or native write interception. Preserve private/direct/local bridge ownership.

## Capability and outcome recording

For the selected public route only, record every actually used BOS capability and
explicitly selected spine, including advice, blocked, failed, partial, skipped and
completed outcomes. Never infer spine execution from tool names or catalogue entries.
For MCP calls, supply `params._meta.bos_usage` with a unique `event_id`, `host` and
the installed `plugin_version` when the host supports metadata; retain the event ID
for identical retries. The service records the actual tool result, not build success.
After a local capability/helper check, use `bos_record_capability_usage` with the
exact project_ref, stable event_id, capability_id, kind (CAPABILITY or SPINE),
outcome, host, plugin_version, trigger category, evidence_status and intervention
(NATIVE, CONTROLLER_ASSISTED or UNKNOWN), following its live schema. Reports are
HOST_REPORTED, never independent proof even if the builder claims verification.
Only send compact categories and an optional evidence SHA-256; no source, paths,
raw prompts/logs, personal data or credentials. Catalogue availability is not use.
Require RECORDED or ALREADY_RECORDED before claiming persistence; otherwise retain
the missing-record gap. Identical retry keeps its ID; a new outcome gets a new ID.
Recording never grants access, approval or app acceptance and never reroutes a
private/local binding into the public service. Do not fabricate historical events.

## Mandatory guidance handoff on every relevant request

Connection is not completed activation. Follow the authenticated
`guidance_activation` handoff: discover with locally classified
`intent_categories`, retrieve actual available-tool guidance, read applicable
app contracts, review blocking rules, and apply the guidance before presenting
a BOS-informed plan. Catalogue availability does not count as use. For UI_UX call bos_scan_plan with locally classified ui_context.page_job and app_type.
Follow gui_guidance: review the bounded contextual shortlist, record owner selection
or reuse a valid accepted contract, and repeat with selected_template_id for draft
contract requirements when a material design decision requires them. Routine edits
reuse accepted intent without a new contract or repeated approval. Missing context is a gap. This exposes bounded
advice, never the full private library or an installed/verified contract.
Report unavailable required guidance and stop dependent work. Never invent
capabilities or copy private authority into a public route.

For Base44 apply workspace reference `guidance_activation` using native tools.
`evaluateGuidanceActivation` PLAN/CLOSEOUT and `evaluateBase44BuildPreflight` are
optional consistency diagnostics. Missing helpers do not prohibit ordinary
authorized edits or actual read-only scans; never invent a helper pass. Retain
named applicable safety and authority boundaries. Record actual capability
outcomes; missing acknowledgement stays NOT_RECORDED without revoking existing
authorization. Separate guidance delivery, action permission, verification and
recording. Reuse valid context and accepted scope; refresh affected evidence
when app, intent, source or effects change.

### Existing-page review

For apps built before onboarding, retrieve existing-page GUI guidance and inspect source, routes, contracts, business/data/permission owners and real journeys. Separate missing contracts from actual defects. Prefer retaining and documenting working pages, then bounded repairs; redesign requires owner acceptance. Explain evidence, user impact, alternatives, preserved behaviour, dependency risk and rollback. Reuse accepted intent for routine repair; bind a new contract for material redesign. Read back saved artifacts, test affected interactions and record actual outcomes, disclosing unavailable independent evidence. Missing source/runtime access remains an evidence gap. Never treat a successful selector or helper as proof the app was repaired.

## User-facing next actions

Every capability/tool response must finish with its actual `next_actions`,
rendered as one to three concrete, ordered steps in plain language. Always show
at least one; show two or three when dependencies or a safe alternative matter.
Explain internal action tokens rather than exposing them as unexplained
commands. Preserve blockers and authorization gates in the sequence. Never
invent a follow-up action or imply that an advisory step executed.

## Next-step model and reasoning footer

Apply the authenticated `next_step_execution_advisory` guidance from this
route's response at the end of every substantive governed answer. Emit one self
row, or independent orchestrator and target rows when handing a task to another
chat/native builder. Include host, project/chat, model or capability, supported
reasoning (or UNKNOWN with desired effort), and a short next-task reason.
Preserve user choices; verify exact models/Auto/effort in the current account.
Recommendations never prove applied settings. Remote sandbox editing by an
external agent does not imply native builder execution. Base44 Discuss is
platform-managed; Replit recommendations do not activate its deferred adapter.
No next task: say model/reasoning is not applicable. Missing guidance: disclose
the gap. Guidance delivery does not prove host emission or grant entitlement.
Keep this recommendation as the final response block, after status, pending
decisions and publication details. If a format check requires a correction,
correct the response once without repeating implementation actions. A corrected
footer is not evidence that model settings changed or a task was executed.


### Continuity and provisional progression
Consume `continuity_guidance` alongside next-step execution advice on the selected authenticated route. Read exact current app/source evidence; use `provisional_evidence` with the maturation tool where supported. Persist provisional metadata through the authorized project state owner with revision comparison and exact readback. Provisional progression is automatic under installed policy; verification and beta/final owner approval remain independent. Unsupported persistence or hooks must be reported explicitly. Public guidance never supersedes a private/local binding.

## Standard BOS page delivery

For a separately authorised Base44 onboarding or upgrade, follow the packaged
`contracts/bos-app-page.json` and workspace reference `bos_page_delivery`. Reuse
compatible app components. Install the canonical icon/colours, three memory tabs,
assistance controls, honest connection status, an exact-app activation prompt,
and the BOS public page and Client Portal links. Use the shared projection; never
copy a private starter's binding or private connection prompt into a public app.
`bos-page-readback.mjs` checks each part's source and rendered UI observations,
backend access denial and exact app/revision before full page acceptance. Missing
parts require the existing bounded upgrade/repair; they do not lock ordinary app
work. Plugin connection alone is not page installation. Existing apps require
app-bound upgrades; there is no automatic fleet write. Copying a prompt neither
activates BOS nor resumes continuous assistance.
