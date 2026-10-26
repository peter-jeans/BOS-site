# Cloud BOS setup launcher

Version 0.1.2, implementation candidate. Native acceptance and publication are verified separately.

The Codex sign-in step now requires fresh native readback of the exact installed
public plugin inventory and its enabled, trusted automatic checks. Review these
in Codex and rerun setup if approval is pending. Setup never writes native trust
settings. This checkpoint does not prove the checks actually fired, register a
hook owner, or activate project governance; those require separate verification.
It is an incremental repair, not the completed desktop-only guided installer.

Download the complete sealed setup folder from the Cloud BOS website; do not copy
just one script. The published inventory lists exact file hashes. Hashes detect
changed bytes; obtain the download and its checksum from the trusted publisher.

On Mac, open `Start Cloud BOS.command` from the extracted folder. On native Windows,
open `Start Cloud BOS.cmd`. The optional PowerShell entry point is
`./Start-CloudBOS.ps1` from an ordinary terminal in that folder.
Use the normal OS review process; this launcher does not disable Gatekeeper,
quarantine, SmartScreen or PowerShell execution policy. If your policy prevents
running the launcher, use the manual website instructions or ask your administrator.
These launch methods still require genuine per-platform acceptance before release.

Node.js 20+ and the chosen tool's supported CLI must be available on PATH. Missing
prerequisites produce instructions, not a silent install or upgrade. A desktop app
alone does not guarantee a CLI on PATH. Official setup:

- Node.js: https://nodejs.org/en/download
- Codex: https://learn.chatgpt.com/docs/cli/reference
- Claude Code: https://code.claude.com/docs/en/setup

Choose **Set up BOS**, **Add a project**, or **Check setup**, then Codex or Claude
Code. Both tools use separate physical project folders under the current support
precaution. Nested folders and spaces are supported; choose the actual app folder,
not its grouping parent. An absent folder is created only after explicit confirmation.
Existing instruction and project files are never written by this launcher.

Set up downloads the exact public plugin inventory from a pinned Git commit, verifies
its hashes and registers that verified local package through the native CLI. It uses
the native plugin manager and browser OAuth. Rerunning preserves an existing correct
setup. An older, disabled, private, unknown or conflicting installation needs review;
the launcher never removes or overwrites one to force success. This first version does
not implement an automatic updater or migrate a Git-backed marketplace to local cache.
Existing Git installations require exact-payload review; a matching repository URL
and version do not establish integrity. Installations from this launcher's verified
local inventory can be checked and reused automatically.

OAuth completion is distinct from a live authenticated BOS call. Open the selected
folder in your tool and start a new chat with the displayed onboarding instruction.
For Claude, if the CLI cannot inspect its bundled server, open `/mcp` in a native
session and authenticate that server there; the launcher does not add a duplicate.
Review the project baseline and exact proposed control files before approving them.
The existing project bootstrap owns `.cloudbos`, instruction preservation and exact
project binding. Installation alone does not activate a project or start a trial.

For a later project choose **Add a project**. Reuse the installed plugin/account
connection; each project still receives its own review and binding. The account's
existing trial expiry is shared and is not reset. Check setup is read-only and does
not log in, reinstall, create folders or repair files. Its version check is not proof
of native instruction loading, current entitlement, saved-file integrity or behavior.
Add a project does not start OAuth again. The native onboarding chat checks actual
access and can request sign-in if the saved connection needs it.

No pasted BOS secret is used for supported OAuth setup. Native login/trust prompts
remain visible; the launcher never stores their output or accepts agreements for you.
No background service, project source upload or new diagnostic telemetry is added.

WSL is a separate environment. This first launcher detects it and gives a handoff;
it does not claim WSL or general Linux qualification. Base44 uses its account MCP,
workspace Skill and app controls in the browser, with the separate illustrated guide.

Developer qualification: the packager can seal `QUALIFICATION_ONLY` with an existing
verified plugin bundle. Pass `--qualification-package <absolute bundle>` only to
exercise that exact candidate in disposable profiles. It is not a public install.
Without that explicit local package a qualification build refuses download/install.
`--no-login` leaves OAuth incomplete, useful when testing installation separately.

Commands and examples are supported interfaces, not permission bypasses. The launcher
never auto-accepts terms, consent, project baselines or plans; changes grants/payments;
resets trials; alters assistance preferences; or substitutes a printed success message
for native readback and actual behavior.
