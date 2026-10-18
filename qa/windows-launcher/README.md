# Windows launcher qualification

This branch contains a public-safe, immutable plugin candidate and setup launcher
for a bounded test on a standard GitHub-hosted Windows VM. It is not a customer
download or release approval. Main, Pages, download controls and production
services are unchanged by this workflow.

The job has read-only repository permissions, no supplied account credentials,
no OAuth or model calls, no artifact/cache upload and no deployment steps.
It installs pinned vendor CLIs only in the disposable runner. Public standard
runner minutes are free under the current GitHub policy; larger runners are not used.

It verifies exact package bytes, native installation, preserved instructions,
rerun, a separate second folder, read-only checks and limited entrypoint behavior.
CI cannot establish browser consent, human-facing OS trust prompts, native
instruction loading, saved application work, account entitlements or complete
project onboarding. Those acceptance limits remain explicit in the report.
