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
