# BOS Public Downloads

This folder contains public/beta-safe downloadable files for the BOS public
site.

## Current Files

- `cloudbos-public-connector-0.1.0+codex.20260623141316.zip`
- `cloudbos-public-connector-0.1.0+codex.20260623141316.manifest.json`

## Boundary

Downloads must not include Cloud BOS token values, private project memory,
development packs, private BOS internals, private prompt libraries, private
scan engines, raw logs, raw evidence records, target app source, customer data,
or local machine paths.

The public connector package does not grant Cloud BOS access by itself. Beta
users still need their own token or entitlement setup.

Connector responses should make the consulted guidance source visible without
exposing internal prompts or private implementation details.

## Install Surfaces

- Codex: install the `cloudbos-public-connector` package into the user's local
  Codex plugin environment.
- Base44, Replit, Lovable, and similar app builders: use an app-side server
  proxy and store Cloud BOS credentials in the platform secret store.
- GitHub, VS Code, and terminal workflows: use localBOS/Codex today, and a
  future thin CLI or VS Code wrapper that follows the same no-secrets endpoint
  boundary.
