# Cloud BOS Public Plugin Release Checklist

Status: `LIVE05_CODEX_AND_CLAUDE_HOST_E2E_VERIFIED / RELEASE_BLOCKED`

V1 host scope is limited to Codex, Claude Code and Base44 BuildAI. Other
packaged adapter contracts are retained for post-V1 evaluation and do not
count as V1 compatibility, acceptance or release blockers. They are inert in
V1: the runtime catalogue withholds them and adapter rendering or installation
planning fails closed with `CLOUDBOS_HOST_DEFERRED_POST_V1`.

The plugin cannot be published merely because its local tests pass. Release
requires the machine-readable gate in
`OS/RELEASE/CLOUD_BOS_PUBLIC_PLUGIN_RELEASE_READINESS_V1.json` to have no hard
blockers and a new explicit owner approval for the exact package digest and
publication target.

The fail-closed live sequence is machine-readable in
`contracts/live-acceptance-plan.json`. Its default state is
`PLAN_READY_EXECUTION_NOT_AUTHORIZED`; it cannot grant approval or perform a
network call.

## Order

1. Deploy the Worker and migrations through
   `0013_public_project_governance_plan_anchors` to a non-public test environment
   under separately disclosed deployment authority.
2. [Complete] Configure an approved test issuer, provision one hashed platform-subject
   binding, then verify HTTPS Streamable HTTP `/mcp`, OAuth discovery,
   authorization, initialization, tool listing and representative tool calls.
3. [Complete] Run real Codex and Claude Code install/auth/discover/use/remove tests. Confirm
   that platform removal does not affect project application functionality.
4. Run Stripe test-mode checkout, portal, signed webhook, replay, cancellation,
   downgrade, refund and entitlement readback. Live mode remains a separate gate.
5. Run the required V1 Base44 clean-app onboarding, governance activation,
   drift, repair, removal and application source/data continuity readback.
6. Close security/privacy findings, obtain qualified legal review, make policy
   links live, and test support, observability, retry, downtime and incident paths.
   The support destination is separately owned and published; the plugin may
   link to it but must not discover, create, deploy, publish, authenticate to or
   manage any website or hosting platform.
   Run `npm run check:cloudbos-public-links:live` and require
   `release_link_ready: true`; an HTTP 200 offline/holding page does not pass.
7. Resolve the external public-support-destination owner hold. Generate a new bounded release bundle with
   `node scripts/package_cloudbos_public_plugin.mjs --output <new-directory>
   --mode release --mcp-endpoint https://<approved-production-host>/mcp`, verify
   that bundle, then apply the plugin-creator cachebuster/reinstall flow, record
   its digest, and request exact owner release approval.

The public package is produced only from
`contracts/public-package-allowlist.json`. Unexpected source files, symlinks,
special filesystem entries, private path markers and secret-shaped values fail
closed. Candidate mode requires the checked-in empty MCP companion and emits
`CANDIDATE_NOT_INSTALLABLE_EMPTY_MCP`. Release mode also requires that source
companion to remain empty; it injects exactly one approved HTTPS production
`/mcp` endpoint only into the new output bundle. Local/private/test/staging
hosts, URL credentials, query strings, fragments, alternate paths and extra MCP
configuration keys fail closed. The endpoint hash and complete output inventory
are bound into the package manifest. Packaging never grants owner release
approval.

Prepare the formal security/privacy input only with the deterministic review
packager:

```text
npm run package:cloudbos-public-security-review -- --output <new-directory>
node scripts/package_cloudbos_public_security_review.mjs --verify <new-directory>
```

The review bundle embeds the exact allowlisted public candidate, threat model,
data-flow/privacy inventory, isolated billing profile and canonical SHA-256
inventory. It always emits `independent_review: NOT_PERFORMED` and
`release_ready: false`; only a separately attributable independent review can
close the formal review gate. LIVE04G five-path deployment/readback is complete
and remains evidence for the final review disposition.

Rollback is two separate actions: remove the platform plugin/MCP entry, and—only
when separately approved—remove a project's minimal governance projection using
its readback-backed removal plan. Neither action may remove application source or
data.

## V1 app memory card

- [x] Canonical public Cloud BOS V1 component version 1.0.0 recorded in BOS and included in the actual public plugin package.
- [x] Shared summary adapter, three-tab component, desktop/mobile UI and package boundary verified locally.
- [ ] Current V2 authenticated plan, backend summary loading, existing-writer refresh integration and live source/UI/role readback verified.

The card is the final owner-requested V1 feature addition. Its local verification
does not close hosted release gates. Contract: `contracts/app-memory-card.md`.

## Local hardening checklist

- [x] Platform install/remove uses an exact prior-state plan and preserves unrelated host configuration.
- [x] Project mutation plans are server-issued and anchored before activation/removal.
- [x] Active bindings anchor adapter, plan, artifact manifest, installed manifest and readback hashes.
- [x] Local filesystem adapter denies traversal/symlinks and uses bounded atomic writes.
- [x] GitHub and Base44 interfaces require exact repository/app revisions and provider readback.
- [x] Remote no-write evidence fails closed when project-visible verification is inadequate.
- [x] A privacy-safe support/incident, retry, downtime and rollback procedure is locally contract-tested.
- [ ] The public support route is configured and the required incident drills pass in the non-public environment.
