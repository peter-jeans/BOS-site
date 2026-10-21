# Exact local project setup

Use `scripts/local-project-bootstrap.mjs` for public Codex/Claude local projects,
including an empty folder. This host-owned filesystem helper supplements the
unchanged three-artifact server lifecycle; it is not an authentication service,
native hook, private LDP, or automatic editor write interceptor.

Install/connect the supported plugin and sign in once for the host. Each new
project still needs its own exact selected folder, stable project reference,
accepted baseline and approved plan. A second project reuses the platform
connection, with its own binding; it does not require a complete reinstall.
Creating folders is an ordinary host action. Neither helper requires a Git
repository, initializes Git, moves folders, nor flattens organization layouts.

1. Open/select the exact project folder. Complete the existing live connection,
   discovery and accepted public-baseline checks. Obtain the original server
   governance plan without applying it. Retain its exact bytes.
2. Call `prepareLocalProjectBootstrap` with `route: "public"`, `project_root`,
   `project_ref`, `host` (`codex` or `claude_code`), `governance_plan`,
   `baseline_evidence` and current `host_instruction_profile`. It writes nothing.
   Show the combined plan's original three server artifacts, three host artifacts,
   exact folder identity, prior/proposed hashes and complete contents for review.
3. Obtain actual owner approval containing `approved: true`, the combined
   `plan_hash`, `project_ref`, `project_binding_id`, `platform_installation_id`
   and `selected_root`. Approval for a parent/sibling folder or only the original
   server projection does not approve the additional host files. Never synthesize
   approval or pass a previous app's decision by path prefix.
4. Call `activateLocalProjectBootstrap` with that plan/approval, the independently
   selected current `project_root`, `project_ref`, `host`, and the existing live
   authenticated `callTool`. It checks the root and expected file state, runs the
   unchanged service lifecycle with fresh access/readback, then writes the approved
   host artifacts. A failed cloud acknowledgement leaves retained partial files;
   retry only the same plan/approval. Unknown file changes require reconciliation.
5. Verify actual files and reopen a native session at this root. For fresh sessions,
   call `verifyLocalProjectBootstrap` with the exact selected root/project/host,
   live bridge and freshly read baseline evidence. The original server plan is
   retained in project memory; this operation replans/writes nothing. Read the
   resulting accepted public context, then retrieve/apply actual relevant guidance.

The normal footprint is six files:

| File | What it holds |
| --- | --- |
| `.cloudbos/governance/binding.json` | Exact server-issued public project identity |
| `.cloudbos/governance/project-governance.json` | Bounded public governance projection |
| `.cloudbos/governance/manifest.json` | Original service artifact hashes |
| Selected native instruction entry | Managed local binding/readback instructions |
| `.cloudbos/project-memory.json` | Accepted public baseline, original issued server plan and retained decisions |
| `.cloudbos/host-bootstrap-manifest.json` | Exact root identity and host-file/import hashes |

Codex chooses a nonempty existing `AGENTS.override.md`, otherwise `AGENTS.md`.
The owned block is appended; existing text is preserved. Do not claim an ignored
`AGENTS.md` is loaded when an override wins. Codex without a detected project root
checks its working directory, so launch/select this exact root for first setup.
With a detected root, native ancestor instructions can still load.

Claude uses `CLAUDE.md` for unknown/older host support, preserving existing text
and importing a local shared `AGENTS.md` when present. When that shared file
already contains this exact project's managed kernel, the Claude block imports it
instead of duplicating the kernel. Explicit current evidence of supported default
AGENTS loading permits `CLAUDE_AGENTS_DEFAULT_SUPPORTED`; with no ancestor/current
CLAUDE file the selected entry is `AGENTS.md`. An ancestor CLAUDE file selects a
local CLAUDE entry. Never toggle global Claude instruction settings implicitly.
Current installed mode, version, trust and native readback remain host evidence.

Grouping folders gain no binding automatically. Independently governed parents,
children, siblings and monorepo subfolders retain separate identities, approvals
and memory. Native ancestor instructions remain native instructions; their BOS
identity and consent do not transfer. The helper never writes an ancestor file.
Existing `.bos` or Master authority at the selected root rejects this public
bootstrap. Symlink targets/root aliases and cross-root plan reuse are rejected.

`LOCAL_PROJECT_BOOTSTRAP_VERIFIED` means exact local files plus the existing
connection lifecycle passed. `native_instruction_loading: NOT_OBSERVED` and
`native_host_ready: false` explicitly limit that result. A source fixture, package
installation or header is not a genuine native OAuth/loading/readiness acceptance.
If a host cannot call the module with its supported live bridge, follow the same
exact reviewed plan and readback sequence with its available tools; report that
path honestly. Never substitute fixture responses or project-file credentials.

Current vendor discovery references:
[Codex AGENTS discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [Claude memory and imports](https://code.claude.com/docs/en/memory).

## Claude setup and qualification

Promote verified, reusable setup fixes into this canonical generator, public
Skill/contract and package allowlist, then qualify the resulting package. A manual
change in a disposable project or installed cache is not a product fix. Do not
ship owner paths, test-folder identifiers, credentials or per-machine state.

Preserve normal Claude project instruction loading and host trust. Headless runs
that suppress project settings or use stripped/bare modes are diagnostic tests;
they do not qualify the normal customer setup. Never change global instruction
or permission settings implicitly. Confirm the installed host version and actual
loaded entry point rather than inferring loading from a file's existence.

For an owner-approved scoped file permission, use Claude's `Edit` path rules for
file modifications. A path-scoped `Write(...)` rule is not consulted. Prefer a
bounded project-relative rule such as `Edit(./TASKS.md)`; absolute filesystem paths
use `//path/to/project/...`. Do not install broad default grants or use shell
writes to evade a real denial. See the current
[Claude permission rules](https://code.claude.com/docs/en/permissions).

Retain independent approved plan hashes for later verification. If those anchors
are unavailable, recover the exact reviewed plan through supported evidence;
do not approve newly calculated current-file hashes as their own verification.
Observed native qualification must cover actual entry-point/Skill use (or an
explicitly reported source-read fallback), exact saved artifacts, useful saved
work, a fresh session and same-session return. Keep failed observations alongside
later successes. Installation, service connection, agreement acceptance, guidance
use and correctly emitted response formatting remain separate claims.

Updating this source or the plugin does not silently upgrade an existing
project's six-file kernel. Preserve its binding, accepted baseline, instructions,
memory and owner decisions. The current generator preserves differing managed
blocks and returns `HOST_CONTROL_RECONCILIATION_REQUIRED`; it is not an automatic
host-kernel upgrader. Returning through an unchanged compatible kernel remains
supported. A host-kernel change needs a separately reviewed exact-file repair;
do not claim the service's three-file drift-repair route upgrades the additional
host files. Module presence does not install that repair or authenticate human
consent from parent/harness-supplied approval JSON.

## Same folder, another development host

This bootstrap supports one host and one authenticated platform binding per
selected local project root. It does not yet attach a second host to that same
working folder. `LOCAL_PROJECT_HOST_ATTACHMENT_REQUIRED` stops the affected
second-host setup before local writes and preserves the first host, accepted
baseline, project memory, approval and trial dates. Do not delete the manifest,
reuse another host's credentials, change project identity or reinstall governance
to get around this boundary. Reopen the existing host normally.

A fresh Claude/Codex platform connection under the same account remains its own
authenticated platform identity; sharing an account or project reference does not
authorize replacing the first platform's project artifacts. Host attachment needs
a separately reviewed binding/storage/approval flow. Individual Codex and Claude
project journeys remain supported; simultaneous use of this same governed folder
is not certified. Native loading and live OAuth acceptance remain separate.


## Proposed public native response readback

The optional `scripts/native-response-readback.mjs` exports
`buildNativeResponseReadback`. It shares the existing Codex/Claude local
bootstrap verifier and does not apply, repair or reseed governance. Supply the
existing live authenticated native `callTool` bridge, exact public route,
selected canonical root/project/host, current `baseline_evidence`, independent
`expected_artifact_hashes` from the retained approved combined plan, and current
`request_context` (host, project_ref, selected_root, actual chat_ref, locally
hashed request_hash, host-observed source_revision and observed_at). The helper
reads only allowlisted bounded kernel/import/spec files, verifies their hashes,
runs the existing rebind verification, then checks the same files and root again.
Caller-supplied JSON does not authenticate a bridge, owner approval or hashes.

Specify the exact specification representation explicitly: `specification_source`
is either `{kind:"FILE_BYTES",path:<allowlisted spec file>}` or
`{kind:"PUBLIC_BASELINE_CANONICAL"}`. The latter hashes the current memory's
bounded baseline with the existing canonical encoding and checks the retained
baseline anchors. Never infer that a Markdown hash equals a baseline object
hash or try alternate representations until one happens to match. Only a
current authenticated exact-project acceptance snapshot with the same freshly
read digest supports `ACCEPTED_CURRENT_BYTES`. Retain its decision-time revision
and today's host-reported request revision separately as provenance; an ordinary
code revision does not invalidate unchanged accepted specification bytes. Do not
claim those revision labels are equivalent. Local baseline acceptance alone
does not create a cloud receipt. Missing/mismatched evidence limits that
acceptance claim and never authorizes edits or revokes ordinary owner permission.

The result derives the speaker version from this call's public service version,
not Master-local or Base44. The current kernel/cloud binding may be read back
while full source integrity, DevPack authority, DBPP assessment, role, actor
context and model settings remain unknown. BOS activation stays caution because
connection/catalogue is not actual applicable guidance retrieval/application.
`CTX` is derived call-locally from the exact root, host/chat/request, artifact,
specification and policy evidence. It is not authority or a complete source scan.
Existing `CODEX_CLOUDBOS`/`CLAUDE_CLOUDBOS` and `CLOUD_MEDIATED` labels identify
the supported transport/projection only. The action route is display-only
`CLOUDBOS_PUBLIC_NATIVE_READBACK`; it is not a newly registered execution route.
No current role selection is supplied by this adapter, so AI_ROLE stays UNKNOWN.

Native project choices use `contracts/native-assistance.json` and the bundled
read/set command. They are mutable owner controls outside the six-file kernel;
never seed On, rewrite the approved kernel or infer a choice from installation.
Automatic native readback requires a current actual saved Cloud-On choice;
caller-supplied booleans are not consent. An explicit `owner_requested:true`
one-shot does not alter saved choices or resume help. The helper adds no
behavioral recorder or replay backlog; service capture follows the saved pair
(Both Off suppresses capture, either On retains the existing policy). The helper has no preference setter, telemetry upload,
local state writer, model setting change, native hook or automatic invocation.
Formatting permission and actual native instruction loading remain separate.

This helper uses the existing `bos_project_governance_verify` lifecycle. That
service already updates verification/audit metadata; do not describe a future
live invocation as zero cloud writes. The helper adds no local write, source
upload, decision, activation or new service endpoint. The native bridge must
really invoke current authenticated tools: callback shape and timing cannot
prove origin or reject a dishonest callback replaying a same-project response.
Native host execution, trust, helper loading, formatted response emission and
fresh service calls require separate observed acceptance. A test fixture or
returned header is not that acceptance. Existing six-file plans remain exact;
package installation alone does not update an approved project instruction file.

## Native assistance source and qualification

Use `scripts/native-assistance.mjs preference read|set|pause|resume` for explicit independent
Local/Cloud choices, exact-root/host/binding readback and revision comparison.
The project-owned preference file is not a shared service or vendor setting.
The session directory stores bounded operational control only, not transcripts,
raw requests or upload queues. Ordinary work and actual app security continue
when assistance is paused or unavailable. No default permission grants apply.

Codex uses the explicit `hooks/codex-hooks.json` manifest on supported manual
desktop installations; Claude uses `hooks/hooks.json`. Exact changed Codex hooks
need host trust review. Hook scripts do not authenticate or call Cloud BOS.
They request relevant guidance through the existing agent/MCP path, suppress
repeated/cosmetic advice and guard paused public BOS calls. Native loading,
actual unsolicited useful suggestions, current guidance retrieval, preference
persistence, sync and capture behavior each need separate observed evidence.
Source tests cannot certify native parity. Hook-bearing Codex packages are not
currently eligible for official public-directory distribution; do not claim
those hooks run in web-only or untrusted hosts.

Paused native one-shots first READ the exact authenticated preference through
the separately qualified enrollment-gated service. A schema field alone is not
capture protection. The source guards require matching saved app revision
and choices with Cloud Off, or enrolled NO_SAVED_CHOICE for a locally absent
choice. They do not sync automatically or overwrite newer choices. Both Off
suppresses new service capture/backlog. Local-On/Cloud-Off retains the existing
saved-switch capture policy; the optional host recorder stays conservative.
Actual live enrollment and native MCP behavior remain qualification gates.
