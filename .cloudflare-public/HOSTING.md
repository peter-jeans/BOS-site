# Hosting-only migration

The owner approved moving website hosting to Cloudflare with GitHub as source. This approval does not qualify native plugins or enable installation/download controls. `release-readiness.json` retains the separate product-release hold; ordinary `npm run deploy` continues to enforce it.

Public target: `peter-jeans/BOS-site` main -> Worker `bos-public-site`, custom domain `cloudbos.dev`. Private/admin hosting is a separate deployment and is never an asset input here. The orchestrator must verify the authenticated provider account and domain before publication. No credentials belong in this repository.

Use a clean checkout of the exact current GitHub main. Run `npm ci`, `npm run test:hosting`, `npm run check:hosting`, `npm run build`, and `npm run dry-run` inside `.cloudflare-public`. The explicit owner-authorized command is `npm run deploy:hosting-only`; it requires HEAD to equal fresh GitHub main and a clean worktree before building the exact asset allowlist. It does not configure GitHub integration or attest a live deployment.

Preserve GitHub Pages, `.nojekyll`, existing workflows and CNAME. Keep Pages serving until independent Cloudflare route and asset readback passes. Never delete Pages or switch its DNS as a side effect of this command. The current baseline has no tracked CNAME or workflow; the guard preserves this baseline rather than creating one.

The hosting record pins the existing native release holds, compatibility evidence, public/source inventories, build code and routing. A changed pin requires review; do not auto-refresh it at deployment. Existing publicly hosted package files stay byte-identical. The marketplace source partition is not copied into Cloudflare web assets.

## Saved Cloudflare Git connection (2026-10-20)

The existing `bos-public-site` Worker is connected to `peter-jeans/BOS-site`, production branch `main`, with root directory `.cloudflare-public`. Preview builds and build caching are disabled. The existing deployment token is reused without changing its permissions.

Build command: `npm ci --ignore-scripts && npm run test:hosting && npm run check:hosting`.

Deploy command: `npm run deploy:hosting-only`.

`SKIP_DEPENDENCY_INSTALL=1` leaves dependency installation to the explicit, lockfile-based build command. A saved connection is not proof of a successful provider build: verify the GitHub commit, Cloudflare build result, deployed version and live asset hashes after a push. Keep GitHub Pages live during this verification.
