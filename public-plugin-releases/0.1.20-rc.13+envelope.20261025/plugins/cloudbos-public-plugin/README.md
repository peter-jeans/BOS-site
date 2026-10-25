# Cloud BOS Public Plugin

Status: `SELF_SERVICE_BETA_PACKAGE_PREPARED / CODEX_CLAUDE_BASE44_TARGETS / CURRENT_NATIVE_ACCEPTANCE_PENDING / STABLE_RELEASE_NOT_GRANTED`

## Prepared self-service beta

Source version: `0.1.20-rc.9+codex.20261021` for both Codex and Claude manifests.
This prepares a public-safe self-registration beta distribution. It does not
publish a download, install a plugin, activate a project, qualify a native host,
accept terms, grant access or authorize a stable/paid launch.

Build a distinct bundle with:

```sh
node scripts/package_cloudbos_public_plugin.mjs --mode self-service-beta --mcp-endpoint https://bos-live03-test.peterjeans2.workers.dev/mcp --output <new-directory>
```

`contracts/self-service-beta-distribution.json` pins exactly that existing shared
MCP resource. Its historical test hostname is an explicit exception for this
mode only; stable `release` still rejects test/staging hosts. The source
`.mcp.json` remains empty. Only the generated package seals the endpoint, without
headers, credentials or private BOS. Supported host browser OAuth is required;
sealing a URL is not proof that OAuth or saved sessions work in that host.

The intended user journey is self-registration through My BOS on the publisher's
verified BOS site, browser sign-in and current terms, then the supported host
connection and exact per-project setup. No private invitation or founder token
is packaged or required by this distribution contract. Actual account, trial
and project eligibility come from the authenticated service. Installation and
reinstallation do not start or reset a trial; current native behavior must be
verified against the delivered version before publication claims.

The generated distribution contains `.agents/plugins/marketplace.json` for
Codex, `.claude-plugin/marketplace.json` for Claude, and the direct folder
`plugins/cloudbos-public-plugin/`. These are real package-relative paths,
not live download URLs. The publisher must provide the actual approved links.
Base44 retains its separate account MCP/workspace skill/app-native route.

## Hook ownership and upgrades

Hooks have descriptive route/plugin/purpose labels and a shared owner router.
Before enabling the new hooks, follow [the hook ownership contract](contracts/hook-ownership.md):
prepare and approve the exact installed-root ownership plan, review native host
hook trust, and disable superseded legacy hook registrations. The manager never
grants trust, chooses a test release automatically or changes a project's BOS route.
Use its `status` command to see selected owners and superseded registrations.
This release is a candidate; native Codex/Claude observation remains pending.

## Historical private beta mode and startup

The historical `beta` mode and `contracts/beta-distribution.json` remain unchanged.
That private beta contract is separate from self-service beta. Build it with
`node scripts/package_cloudbos_public_plugin.mjs --mode beta --mcp-endpoint https://bos-live03-test.peterjeans2.workers.dev/mcp --output /tmp/cloudbos-private-beta`.
The packager checks the exact endpoint allowlist, seals its digest and verifies
the generated bundle. It leaves the source MCP companion empty. A beta bundle
does not claim production OAuth, live billing or Base44 acceptance.

Codex loads `hooks/codex-hooks.json`; Claude Code loads `hooks/hooks.json`.
The owner router selects one registered version before the public session helper
reads the exact project binding and saved assistance settings. Those settings
control guidance. The scripts do not make network calls or read credentials;
they maintain compact local ownership/session records. Current authenticated
Cloud evidence remains separate from this local hook readback.
Host trust or OAuth consent still belongs to the user. See the official
[Codex hooks reference](https://learn.chatgpt.com/docs/hooks) and
[Claude Code hooks reference](https://code.claude.com/docs/en/hooks).

Base44 uses its account MCP connection, workspace skill and per-app native AI
Controls pointer. It does not execute desktop plugin hooks. Acceptance must
verify those surfaces in Base44, then reopen the exact app's governance files
and test a fresh BuildAI chat against the bound test service.

The server lifecycle accepts app-native Base44 plans through the
`base44_profile` input. The default profile has eight durable-memory artifacts.
Activation and exact repair require a server anchor, plan approval and provider
readback; removal checks the exact installed manifest and application-source
preservation. The host readback helpers distinguish the projection's original
revision from its installed revision. This integration is locally verified;
deployment and native Base44 acceptance must be recorded separately.

Base44's native tool response can truncate a full governance plan. The current
workspace-skill contract requests `response_format: "BASE44_PLAN_CHUNK_V1"`,
`response_encoding: "base64"` and `response_chunk_bytes: 1536`. This is a protocol
setting, not a qualified reliable host-transfer size. Retrieval repeats the
identical inputs with `plan_chunk` containing the returned `plan_hash`,
`created_at` and successive `chunk_index`. Verify each `chunk_base64_sha256`,
decode each chunk independently, and concatenate its exact bytes in order.
Verify the total byte count, JSON SHA-256, plan hash and artifact
checksums before review or approval. Each retrieval verifies the original
server anchor and expiry. A partial response never permits installation.
Authentication or multi-tenancy must be included in `security_triggers`, which
adds the ninth security-baseline artifact.

Native transfer acceptance remains incomplete: manual copying of received
base64 chunks has changed retained bytes and failed integrity checks. Receiving
all chunks or parsing the reconstructed JSON is insufficient. Preserve the
original tool results and verify the retained bytes; do not repair content from
memory, substitute locally generated artifacts, or approve a mismatched plan.
Direct programmatic result retention must be verified on the host before it is
described as supported. Smaller chunks alone do not establish reliable transfer.
The September 12 boundary experiment found checksum failures in chat-displayed
base64 at both 384 and 1536 decoded bytes, including isolated retries. Two
768-byte samples passed but did not cover the failing ranges. Raw UTF-8 recovered
one failed range, then failed another 384-byte range in a batch and in isolation.
The experiment held a 13,774-byte plan fixed; it did not establish a maximum file
size or a universal Base44 limit. No tested size or representation is qualified
for unattended transfer. Integrity failures continue to block plan approval.

The September 12 shared-service update adds original-plan storage and recovery
on the isolated beta Worker. To recover without resending the contents, call
`bos_project_governance_plan` with only `project_ref`, `project_binding_id` and
`recover_plan: {plan_hash}`. Base44 may request `BASE44_PLAN_CHUNK_V1` with
`recover_plan.chunk_index` and the existing encoding/chunk-size options.
Recovery returns the stored original and preserves its expiry and approval
requirements. It cannot recover historical hash-only anchors. Deployment and
local tests for all three host request types are verified; live recovery through
Base44, Codex and Claude Code remains pending separate native-client evidence.

The beta service also offers an opt-in `PLAN_DOWNLOAD_V1` response for initial
issuance or reference-only recovery. It returns a short-lived, single-use
credential for `POST /mcp/plan-download`. A host must fetch the original bytes
in code and verify their length, JSON SHA-256, canonical plan hash and every
artifact checksum before retaining them. Keep the credential out of URLs,
logs and saved files. This route grants neither plan approval nor project
write authority. The five-path default surface is unchanged unless the beta
download flag is enabled. Local tests and the Base44 beta deployment are
verified; a complete native file-retention and recovery pass is still pending.
See `OS/OPERATIONS/CLOUD_BOS_PLAN_DOWNLOAD_PROTOCOL_20260912.md` for the exact
verification and acceptance boundaries.

## Version 1 host scope

### In-app memory card

This is the canonical **public Cloud BOS V1** app memory card, component version
**1.0.0**, accepted by the owner on 2026-09-15. Canonical BOS records the same
component in `OS/PLATFORM/CLOUD_BOS_PUBLIC_APP_MEMORY_CARD_V1.json`.

The shared package includes one read-only card with **Decisions**, **Build
intentions** and **Memory** tabs for an app's existing owner/admin onboarding or
BOS page. It displays friendly summaries of existing app records with a fixed
scrolling area and honest snapshot timestamps, empty states and unavailable states.
See `contracts/app-memory-card.md` for the component, safe summary adapter and
installation checks. Target installation and ongoing summary refresh require the
app's authenticated backend and existing governance writer; packaging the card is
not evidence that it is installed or current in an app.

This is the final owner-requested feature addition for the current plugin release.
Further work in this scope is verification and demonstrated release blockers.

Cloud BOS Public Plugin V1 supports exactly three development environments:
Codex, Claude Code and Base44 BuildAI. Historical Codex/Claude evidence does not
qualify this newly assembled version. Base44 remains a required V1 acceptance lane and must complete its
production OAuth plus governance repair/removal continuity gates before V1
release.

The existing VS Code/Copilot, Cursor, Replit, Gemini CLI, GitHub Copilot CLI,
Windsurf and generic MCP adapters are retained as internal post-V1 research.
They are not V1 public support claims, compatibility requirements, acceptance
lanes or release blockers. The V1 runtime does not render them, include them in
its supported-host catalogue or issue installation plans for them. Adding any
of them to a later public release scope requires a new owner decision, a new
release-line implementation and current live evidence.

Websites and hosting platforms are not plugin environments. The separately
owned publicBOS website may be linked as an external support destination, but
Cloud BOS does not discover, create, deploy, publish, authenticate to, manage
or exchange data with Sites, Cloudflare Pages, Cloudforge or any other website
host. The link grants no plugin, governance or entitlement authority.

This is the isolated public Cloud BOS product source. It is deliberately
separate from `plugins/cloudbos-connector`, which remains the owner/developer
connector and rollback comparison.

```text
plugins/cloudbos-connector       private owner/developer channel
plugins/cloudbos-public-plugin   public product development channel
Cloud BOS hosted service         shared governed backend
```

Both plugins can coexist because they have different plugin names, folders and
installation identities. Changes to the public plugin must not overwrite or
repackage the private connector.

## Current state

The shared package now carries separate native Codex and Claude Code manifests,
one public skill and one MCP companion. The provider-neutral Level-1 contract,
hosted MCP runtime,
OAuth protected-resource discovery, RS256/JWKS resource validation and hashed
OAuth-to-platform D1 binding are locally verified. The bounded
project-governance engine and its six MCP control-plane tools (five lifecycle
operations plus exact-plan decision handling) are also locally verified across local repository, GitHub, Base44 and
project-visible remote adapters. The local repository has an actual-filesystem
activate/drift/repair/remove E2E, and the GitHub adapter now has a public-safe
exact-ref REST controller locally verified with simulated GitHub API readback.
It binds to an approved repository, branch and expected head, writes only the
three governance artifacts with a non-force commit, and verifies that the
application tree is unchanged. A real disposable GitHub repository/ref and
separate exact owner approval are still required before live execution.
For hosts with no project-write capability, the remote projection verifier
requires separate authority and project-view channels, an exact
project/revision/plan/manifest index, bounded freshness, a cryptographic or
provider-native attestation and exact project-visible content/absence
readback. Local Ed25519 fixtures pass; no live remote provider is selected.
Progressive Standard, Plus, Pro and Enterprise
capability decisions and scan-planning depth are server-entitlement-gated and
locally verified. LIVE04 also verifies the isolated OAuth bridge, authenticated
MCP initialization, 12-tool discovery and `bos_connect`. LIVE05 verifies the
exact Codex install, browser OAuth, protocol negotiation, 12-tool discovery,
`bos_connect`, removal and post-removal continuity lifecycle. The repository
MCP companion remains empty intentionally; each generated distribution seals
only its mode's allowed endpoint. LIVE05 is historical evidence for its exact
staged version and does not qualify the current self-service-beta package.
Source preparation and package verification are separate from publication,
current browser OAuth and native saved-operation acceptance.

Claude Code and its VS Code extension share the user-scope plugin registry.
The native Claude package structure can therefore be installed once for both
surfaces. Its isolated live install, OAuth, tool-discovery, `bos_connect`,
removal and baseline-restoration acceptance test is complete; production
endpoint and OAuth issuer hardening remain separate release gates.

Definitions and historical research for VS Code/Copilot, Cursor, Replit,
Gemini CLI, GitHub Copilot CLI, Windsurf and generic MCP remain in the manifest
only as inert post-V1 material. The V1 adapter renderer returns
`CLOUDBOS_HOST_DEFERRED_POST_V1` for every one of those identifiers, and the V1
catalogue exposes them only in `deferred_post_v1_host_ids` and
`withheld_host_ids`. No V1 installation or removal plan can be created for a
deferred host.

Base44 AI app builder also uses a host-native route rather than the Codex or
Claude manifest. Official Base44 surfaces support one OAuth custom MCP
connection at account scope and static skills at workspace scope. The public
package now carries an exact public-safe `cloudbos-governed-build` workspace
skill projection and a dry-run-only Base44 account/workspace adapter. A
separate governed operator controller has now live-verified the associated
read-only discovery path using exactly two authenticated Base44 `GET` requests:
the account workspace list and bounded app metadata. It refuses redirects,
non-owner-only credential files, oversized or malformed responses and all
non-allowlisted request shapes; its saved evidence contains only
domain-separated app/workspace hashes. The skill
routes BuildAI to fourteen core Cloud BOS tools (eight Level-1 advisory and six
project-governance tools). The outcome recorder and app-status access route are
advertised only when their authenticated host functions are enabled. The skill
is not security enforcement;
each governed app still needs a separate approved app-governance projection
and exact provider readback. Live installation remains blocked until the
production MCP endpoint and Base44 OAuth client/callback path are verified.

The dedicated hosted endpoint must enable the fail-closed
`PUBLIC_PLUGIN_ONLY` surface profile. It permits only MCP, OAuth resource
metadata and minimal health/version paths; other Cloud BOS routes return 404.
This is runtime route isolation and does not claim a separately compiled Worker.

Contract source:
`contracts/level1-tools.json`
`contracts/tier-capabilities.json`

Contract generator and test:

```text
scripts/generate_cloudbos_public_level1_contracts.mjs
scripts/test_cloudbos_public_level1_contracts.mjs
scripts/test_cloudbos_public_mcp_runtime.mjs
scripts/test_cloudbos_public_oauth_bridge.mjs
scripts/test_cloudbos_public_oauth_mcp_authority.mjs
scripts/test_cloudbos_live04_test_issuer.mjs
scripts/test_cloudbos_public_host_adapters.mjs
scripts/test_cloudbos_public_claude_package.mjs
```

Authorization and project-governance sources:
`OS/PLATFORM/CLOUD_BOS_PUBLIC_MCP_AUTHORIZATION_V1.md`

```text
contracts/oauth-platform-identity-bridge.json
contracts/project-governance-lifecycle.json
contracts/project-governance-adapters.json
contracts/project-governance-*.schema.json
scripts/project-adapter-discovery.mjs
scripts/project-governance.mjs
scripts/project-governance-adapters.mjs
scripts/github-exact-ref-api.mjs
scripts/remote-project-visible-api.mjs
src/cloudbos_public_project_governance_contracts.js
src/cloudbos_public_project_governance_runtime.js
```

Host adapter source and evidence:

```text
contracts/host-adapters.json
contracts/base44-workspace-skill.json
scripts/host-adapter.mjs
skills/cloudbos-public-guide/SKILL.md
OS/PLATFORM/CLOUD_BOS_PUBLIC_HOST_ADAPTER_MATRIX_V1.md
```

Adapter output is platform/user scoped and does not write real user
configuration. Project-adapter discovery is separately read-only. The Codex
and Claude Code host lifecycles are live-verified; the checked-in companion
remains empty and fail-closed. The release packager injects a separately
approved production `/mcp` endpoint only into the generated release bundle;
it never rewrites the source plugin. Base44 is the remaining required V1 host.
Replit, VS Code, Cursor, Gemini CLI, GitHub Copilot CLI, Windsurf and generic
MCP remain packaged only as deferred internal adapter evidence; they do not
block or expand V1. Only Codex and Claude Code currently carry live host
evidence.

Render one adapter for a specific development environment:

```sh
node scripts/host-adapter.mjs base44_build_ai https://cloud-bos.example/mcp
```

Render the deterministic, hash-bound cross-environment catalog containing the
Base44, Codex, Claude and every other currently packaged adapter:

```sh
node scripts/host-adapter.mjs --catalog https://cloud-bos.example/mcp
```

The catalog is read-only authoring output. It contains no credentials, performs
no host or project writes, and preserves the separate per-project governance
lifecycle. `validateHostAdapterCatalog` independently reconstructs the exact
host inventory and every adapter projection, rejects undeclared fields and
fails closed on a changed endpoint, host payload, inventory or catalog hash.

Base44 uses two native scopes: one OAuth MCP connection for the account, plus
one exact `cloudbos-governed-build` skill for each selected workspace. Every
selected workspace is represented in the plan and readback by a privacy-safe
hashed workspace reference. This makes “available to all apps in this
workspace” verifiable without claiming that the skill propagates to other
workspaces or that any app is already governed.

Before a Base44 installation plan can become approval-ready, the adapter must
match the target app's read-only `organization_id` to the authenticated
account's workspace list. It converts the app and selected workspace IDs into
domain-separated SHA-256 references, discards names and raw identifiers, and
binds the sanitized discovery evidence into the exact plan hash. A manually
typed workspace hash cannot substitute for this evidence.

## Level-1 tools

- `bos_connect`
- `bos_assess_project`
- `bos_project_spec_check`
- `bos_maturity_next`
- `bos_scan_plan`
- `bos_scanfix_plan`
- `bos_health_snapshot`
- `bos_capabilities`

`bos_estimate` is not part of this plugin.

Standard retains all eight tools. Plus, Pro and Enterprise add progressively
deeper governed scan planning through the same plugin; D1 entitlement and
server tier controls select depth without reinstalling the plugin. Complexity
and maturation-stage recommendations never grant access.

Stripe billing is a separate hosted-service entitlement lane, not a plugin
feature. The plugin never handles cards, charges a user, generates a personal
quote or treats a checkout redirect as access proof. Paid capability access is
resolved only from server-side D1 entitlement state written after verified
provider webhooks.

## Project-governance control-plane tools

- `bos_project_discover` — read-only adapter and authority classification.
- `bos_project_governance_plan` — exact, expiring, zero-write plan.
- `bos_project_governance_decision` — read, approve or cancel one exact plan hash; records a control-plane decision without writing project files.
- `bos_project_governance_activate` — bind only an approved plan with verified host readback.
- `bos_project_governance_verify` — detect currentness or fail closed as drifted.
- `bos_project_governance_remove` — detach only after manifest-owned removal preserves the app.

The decision, activation and removal tools require `write:project_governance`.
The decision route requires that scope for every call because it can approve or
cancel an exact proposal, even though it never writes project files. Discovery,
planning, verification and the eight Level-1 tools use `read:advisory`.

Hosted activation accepts only a current server-issued plan anchored in D1.
The binding records the exact adapter, approved plan, artifact-manifest,
installed-manifest and readback hashes. Replayed, substituted or incomplete
plans/readbacks fail closed. The adapter package supplies a bounded atomic
local filesystem executor and exact-version provider interfaces for GitHub,
Base44 AICONTROL and independently visible remote projections.

New Base44 project discovery emits `BASE44_GOVERNED_APP` with the
`base44_app_governance` adapter. The public package keeps the historical
`BASE44_DIRECT_APP` / `base44_direct_app` identifiers only as explicit
read-compatibility aliases. The Base44 profile contract defines calibration
treatments for MCP/skill-only, a seven-artifact lean memory core and the one
additional build-gates artifact; the larger internal governance pack remains
non-distributable. The app-native profile engine now locally verifies exact
seven/eight/conditional-artifact dry runs, hash-bound approval, activation,
drift and manifest-owned removal while preserving application source. The
existing LIVE07 packet still targets its historical three-artifact binding
envelope and cannot be relabelled or executed as the preferred profile without
a new exact approval packet.

The canonical Base44 onboarding planner joins the native host install and
per-app lifecycle into one deterministic sequence without collapsing their
authority: account MCP connection, selected-workspace skill, read-only app
discovery, the eight-artifact `LEAN_CORE_WITH_BUILD_GATES` profile, exact
activation/readback, a separate owner/admin connection-plug app-surface action,
then any server-entitled governance capability upgrade. Each mutating step has
its own exact app-bound plan and stops after readback. Payment makes a paid pack
eligible; it never approves file mutation. Server-only paid capability remains
server-only. The matched FULL-versus-lean efficacy lane is deferred but still
blocks governance-equivalence and fleet-completion claims.

Onboarding sources:
`contracts/base44-governed-app-onboarding.json`
`scripts/base44-governed-app-onboarding.mjs`

Public OAuth uses an externally operated authorization server. Cloud BOS
validates signed resource-bound access tokens and maps verified identity to a
server-authorized platform installation. The self-service account/enrollment
journey belongs to the hosted service; installing this plugin does not create
or authorize an unknown identity. No OAuth token or personal credential is
packaged, and client claims never select entitlement. Current account terms,
verified project binding and native host acceptance remain separate gates.

## Local project behavior

Installing this plugin does not install `LDP:FULL` into projects. The plugin,
skill, MCP connection and authentication install once per platform identity.
Every project described as `GOVERNED_ACTIVE` must separately receive the
minimal environment-appropriate public governance projection, exact manifest,
Cloud BOS binding and verified readback. That projection is not LDP and remains
independently removable without changing application source or data.

For local Codex/Claude folders, `contracts/local-project-bootstrap.md` adds the
appropriate native instruction entry, accepted public project memory and host
manifest around the unchanged server projection. Its combined exact-root plan
requires owner approval and fresh readback. Existing instructions are preserved;
deeply nested/empty folders do not require Git initialization. Only one host and
authenticated platform binding per selected folder is supported. Another host
returns `LOCAL_PROJECT_HOST_ATTACHMENT_REQUIRED`; never delete/reseed project
records or reuse another host's credentials to bypass it.

See `PUBLIC_BOUNDARY.md` for the enforced IP and data boundary.

## Support boundary

Use the currently published support/incident route described by its verified
contract and publisher. The author's metadata is not an access grant or a
requirement to contact the founder before self-registration. Packaging alone
does not configure a support destination or prove email delivery. Existing
support authentication, privacy, incident and evidence gates remain in force.

## Public package boundary

`npm run package:cloudbos-public-plugin -- --output <new-directory>` creates a
candidate distribution containing only the exact public allowlist, separate
Codex and Claude marketplace catalogs, and a SHA-256 file-inventory manifest.
The output directory must not already exist. Candidate mode remains explicitly
non-installable with an empty MCP companion. `--mode release --mcp-endpoint`
seals a validated HTTPS production endpoint only in its generated output and
continues rejecting test/staging hosts. Historical private `beta` and the new
`self-service-beta` use separate exact endpoint contracts and release states.
All modes retain strict inventory, symlink, private-content, credential-pattern
and file-hash checks. The packager cannot confer owner publication, stable-launch
or native acceptance approval. Archived packages are never rewritten.

An existing bundle is verified without rewriting it using
`npm run package:cloudbos-public-plugin -- --verify <bundle-directory>`.

## Access model

The prepared self-service beta uses the hosted account journey and its current
explicit terms. Read access sources, start/end dates and allowances from fresh
authenticated service results. The approved account model provides a timed trial
and may have an explicit owner-granted account override; neither the package,
a displayed tier nor a checkout return grants access. Project setup remains
independent. Installed stabilisation and project records remain governed by the
accepted policy after active cloud access ends.

Read the current service offer and `contracts/commercial-model.json` for any
commercial terms; this package does not activate paid checkout or billing.
Browser sign-in codes belong to the identity provider. Project credentials,
private account data and payment material never enter the distribution.

# Base44 build-check enforcement (workspace skill 1.35.0)

The Base44 workflow now explicitly dispatches existing BOS Build Alignment and
artifact-readback requirements. Before material writes, builders demonstrate
task-specific app knowledge against current source, resolve indirect effects and
scope, and emit a bound alignment result. Failed knowledge requires relevant
LDP/app-projection and source reread followed by a fresh application question.

After a batch, exact saved paths, revision, lines, symbols/diffs and actual test
results are required. The read-only helper compares current and baseline bytes
and claimed line excerpts through an authorised host reader. Builder reports
cannot independently verify themselves. Source-location success remains partial
until the applicable complete-change, behaviour and live-parity checks pass.

`contracts/base44-workspace-reference.json` contains the `build_checks` protocol;
`scripts/base44-build-discipline.mjs` and its generated CommonJS companion provide
the executable host checks. They do not authenticate supplied host evidence,
judge semantic truth from fields, or intercept arbitrary native editor writes.
Unavailable evidence leaves the affected workflow blocked/unverified.

New activation plans include these instructions. Existing app files stay intact
until an explicit `PUBLIC_BUILD_DISCIPLINE_V1` update is approved and read back.
Old exact plans remain valid; customized controls and downgrades fail closed.
Git publication and local plugin installation do not update a live Base44
workspace skill, an existing app, the public companion site or the Worker.

## Standard BOS page delivery

The 1.0.0 page standard is packaged with this plugin, including the complete reviewed surface bundle in `templates/base44-status-surface.json`. On separately authorised Base44 onboarding and app upgrades, install/reuse the BOS icon and colours, Decisions / Build intentions / Memory, assistance and connection controls, an exact-app Builder activation prompt, and public BOS and Client Portal links. `scripts/bos-page-readback.mjs` checks all required source/UI observations and backend access before full page acceptance. Plugin connection alone does not install an app page; earlier apps need their bounded upgrade. Private bindings keep their private adapters and prompt. This ships a verified installer and template; fleet/native-host execution still needs app-specific evidence.

## Response continuity repair

Rebind uses the route's current project evidence. Private rebind may restore only
approved, unchanged managed continuity files, with exact source hashes and
recoverable backups; custom files and unapproved releases require a named decision.
The public/Base44 route retains its exact bound-manifest approval lifecycle.

Model advice must include the next task, host, project/chat, role, model/capability,
reasoning or UNKNOWN plus desired effort, and Recommendation only. Actual settings
come from separate native/session readback or remain UNKNOWN. Local Stop checks
regenerate a project/session/request/source-bound advisory recorded through
`response-continuity --advisory-input <local-json> --session-id <current-session>`.
The private startup entrypoint sequences bootstrap before continuity checks.

Source/package parity does not prove installed, loaded, trusted or fired hooks.
Updated hook definitions require supported host trust/reload and native negative
controls. Stop permits at most one corrective continuation and has no pre-display
guarantee. Structured output stays intact with unsupported enforcement reported.
Base44 remains a host workflow/readback check and has no claimed native Stop hook.

## Native saved assistance controls — successor source

`contracts/native-assistance.json` describes project-owned Local/Cloud choices
and `scripts/native-assistance.mjs preference read|set|pause|resume` provides their bounded
read/set workflow. Use the actual installed plugin path, exact selected root,
`--host codex|claude_code`, explicit `--local on|off --cloud on|off` and the
current `--expected-revision` for changes. Pause remembers the actual prior pair;
Resume restores it rather than enabling both. Nothing defaults to On. This is a BOS
project control, not a new vendor setting, account entitlement or shared service.

Supported hooks request current guidance at meaningful build moments, respect
Off/unknown choices, deduplicate repeated suggestions and keep cosmetic work
light. They never contact Cloud BOS or inspect transcripts/credentials. The
agent still must retrieve and apply actual authenticated guidance. Sync uses
the existing exact-project preference tool when native compatibility is available.
Paused one-shot help needs a supported current request argument/envelope; it
never flips Cloud On or enables capture/replay. No missing optional helper
blocks ordinary app work or weakens actual app security.

This is unqualified successor source, not a change to frozen19 installations.
Codex uses the explicitly referenced Codex hook manifest on supported manual
desktop installs, with exact hook trust review. Hook-bearing packages are not
currently eligible for the official public directory. Claude uses its documented
plugin lifecycle hooks. Source tests, saved files, hook loading, actual unsolicited
suggestions, guidance use, preference persistence and capture behavior remain
separate evidence. Each host must pass its native qualification before parity
is claimed; no reinstall, deployment or publication occurs merely from this code.

Paused native one-shots first READ the exact authenticated preference through
the separately qualified enrollment-gated service. A schema field alone is not
capture protection. The source guards require matching saved app revision
and choices with Cloud Off, or enrolled NO_SAVED_CHOICE for a locally absent
choice. They do not sync automatically or overwrite newer choices. Both Off
suppresses new service capture/backlog. Local-On/Cloud-Off retains the existing
saved-switch capture policy; the optional host recorder stays conservative.
Actual live enrollment and native MCP behavior remain qualification gates.
