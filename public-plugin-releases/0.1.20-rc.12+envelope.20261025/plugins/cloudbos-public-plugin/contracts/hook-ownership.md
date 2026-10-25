# Hook ownership and upgrade policy

One approved owner is selected per host, route, plugin family and lifecycle purpose.
The display label is descriptive metadata; it is never the identity or an approval.
The registry lives at `~/.config/bos/hook-owners.json`. It contains exact package
roots, content digests and approved versions; it contains no credentials.

## Installation and updates

The installing host prepares an exact plan with the bundled manager:

`node scripts/bos_hook_ownership.mjs plan --host codex --root <installed-plugin-root>`

Use `claude_code` for Claude. Candidate releases require the explicit
`--channel candidate` option and must remain in a test installation unless the
owner separately approves promotion. Save the returned JSON plan, show the
selected owners, then apply with `apply --plan <plan-file> --approve-digest <digest>
--host-readback <fresh-codex-hooks-list.json>` after native trust review.
The apply step rechecks the prior registry and every package digest under a lock.
The supplied host readback must be fresh and show the exact selected roots/events
as enabled and trusted. Native host hook trust is a separate user review; this manager never writes it.
Do not claim working governance until both the registry and native trust are ready.
For Claude, collect native readback with
`node scripts/bos_claude_hook_readback.mjs --root <installed-plugin-root>
--project <reviewed-probe-project>`. This uses the supported plugin inventory
and startup-only host command. It requires the exact installed version enabled,
unchanged package bytes and a fresh nonce-bound observation from that package's
SessionStart router. Normal host settings and their restrictions remain active.
No model conversation, tool access or MCP connection is enabled. Startup hooks
can still perform their normal local work; use a reviewed probe project.
Save the output and supply it to `apply --host-readback` within five minutes.
The adapter never writes native permissions or claims interactive workspace trust.
Other lifecycle events are definition readback, not observed execution evidence.
`--qualification` loads an exact directory in an isolated session; that readback
cannot activate ownership or justify retiring installed hooks. Qualification and
full lifecycle acceptance remain separate. Do not replace a working release until
installed-mode readback and the required lifecycle tests have passed.
Multiple enabled copies of the same Claude plugin family return
`CLAUDE_PLUGIN_SELECTION_CONFLICT`. The observed Claude 2.1.251 loader suppresses
duplicate names without selecting the newest version. A controlled host switch
with rollback is required; the registry cannot override that loader. Directory
marketplace source roots must match the installed bytes and be observed directly.

`status` shows ACTIVE_OWNER, SUPERSEDED, AWAITING_APPROVAL, CONFLICT or
CHANGED_OR_MISSING. Candidate/test channel is shown in the registration and
requires explicit selection. A stable registry must not automatically enrol an
unreviewed update. After an approved update, the highest compatible approved
semantic version wins. Build metadata does not establish precedence. Equal
versions with different bytes are conflicts, not guesses. Same-byte duplicates
select one deterministic root. Local, private and public routes cannot replace
one another. Changed/missing winning packages block their hook work; do not
silently reactivate an older owner.

## Legacy migration

Old releases cannot obey a policy they do not contain. Before claiming exclusive
execution, disable their duplicate hook registrations using the host's supported
controls, or migrate those registrations to the router and review them again.
Keep recovery copies and a rollback plan. Do not rewrite native trusted hashes,
delete project bindings, or assume installing a package disables other marketplaces.
Do not disable an entire plugin if its other functions are still needed.

For Codex, obtain a fresh supported `hooks/list` readback and run
`legacy-plan --host-readback <saved-json> --selected-plugin <exact-name@marketplace>`.
The plan returns no edits until the selected hooks are enabled and trusted. It
targets only equivalent events from other copies of that plugin. Apply its
`config/batchWrite` edits only after rechecking exact hook hashes and the current
config version; retain a prior config backup. Never treat this saved plan as
fresh native evidence after a reload or package update.

## Concurrent events

Selected owners claim work atomically per host, route, family, project, session
and event. Completed PreToolUse results are replayed so a duplicate cannot lose
a denial. A concurrent or failed check never returns a fabricated permission.
Distinct projects, sessions and purposes do not suppress each other. A failed
claimed event is not automatically retried with side effects; investigate and
start a new operation. With no stable event/turn ID, context hooks provide only
in-flight suppression. They do not suppress a later identical user request.
PreToolUse requires an exact tool/turn identity. No raw prompts or tool arguments
are saved; correlation uses digests. Event receipts are local runtime state.

These controls do not grant installation, cloud access, entitlement, publication,
or governance-write authority. Missing registry setup limits hook work and does
not prohibit ordinary authorized app development. Node.js is required for this
router; local/private delegates retain their existing Python requirement.
