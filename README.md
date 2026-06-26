# BOS Public Page

This folder contains the GitHub Pages-ready public marketing and onboarding draft for BOS.

Files:

- `index.html` - static public marketing/onboarding page.
- `capabilities.html` - public-safe capability and app-journey page, backed by generated `data/capabilities.json`.
- `how-it-works.html` - workflow diagrams, Cloud BOS/localBOS boundaries, and privacy model.
- `llms.txt` - AI-readable public summary.
- `policies/` - draft legal, privacy, billing, AI caveat, and data-processing pages.

Before public launch:

- Replace draft policy copy with counsel-reviewed Terms, Privacy, Acceptable Use, AI Caveats, Trial/Billing, Data Processing, and Refund/Cancellation text.
- Do not publish final tier names or pricing until Stripe products, entitlement enforcement, support, and policy gates are ready.
- Keep savings language as beta estimates until measured pilot data exists.
- Keep the public pages aligned with the Cloud BOS agreement-acceptance versions once D1-backed policy storage exists.
- Keep the homepage focused on customer-visible capability, not internal BOS implementation detail.
- Keep `capabilities.html` public-safe: outcome language only, no private project memory, development packs, raw evidence records, source internals, prompt libraries, secrets, or customer/project data.
- Keep the homepage value-first. Detailed workflow diagrams and architecture boundaries belong in `how-it-works.html`.
- Keep subpages narrow. Policy/reference pages should not repeat the homepage hero, tier table, workflow diagrams, or sales copy.
- Do not list guided repair sessions, hardening audits, or other service products as current paid offers until they are scoped, tested, priced, supported, and managed through an approved BOS service path.
