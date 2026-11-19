# App memory card

Product: **Public Cloud BOS V1**
Component version: **1.0.0**
Canonical BOS contract: `OS/PLATFORM/CLOUD_BOS_PUBLIC_APP_MEMORY_CARD_V1.json`
Schema: `BOS_APP_MEMORY_SUMMARY_V1`
Surface: one card on the existing owner/admin onboarding or BOS page.
Tabs: **Decisions**, **Build intentions**, **Memory**.

## Data contract

`scripts/app-memory-summary.mjs` selects bounded display fields. It has no network,
storage, authentication or model dependency. Use `createMemorySummary` with existing
approved summaries, or `summarizeBase44Memory` with the verified public lean pack.
The latter reads Current intentions and accepted project context. Decision entries
require a recorded owner decision with an explicit `display_summary` for the
`owner_admin` audience. A planned activation is not an owner decision. Other hosts
map their existing records into `createMemorySummary`; no new record store is required.

The source adapter must authenticate the caller, authorize owner/admin access and
bind the exact app before calling the helper. The helper's context is supplied by
that trusted adapter, never request JSON. Respect stricter existing app permissions.
Read raw artifacts only on the server or inside a governed projection step. Never
import governance files into frontend code or place them in public assets.

Only pass reviewed, app-facing text into `title`, `summary` and optional `outcome`.
Field selection is not a secret detector: even an allowed field must not contain
credentials, private prompts, customer records or developer-only governance.
Every item retains a source reference for audit. Do not render those references as
arbitrary links. Dates must come from saved records; undated records remain undated.
Unavailable sources and malformed items produce an unavailable tab, not zero counts.
Each tab displays at most 30 summaries, newest dated entries first, with an honest
total and truncation message. The view never infers health or completion from activity.

```js
{
  schema: 'BOS_APP_MEMORY_SUMMARY_V1',
  project_ref: 'base44:<exact-app-id>',
  captured_at: '<ISO timestamp of source readback>',
  mode: 'snapshot',
  tabs: {
    decisions: { status: 'ready', total: 0, items: [] },
    intentions: { status: 'ready', total: 1, items: [
      { title: 'Current intention', summary: '<friendly saved intention>',
        source: '<record reference>', outcome: '', recorded_at: null }
    ] },
    memory: { status: 'unavailable', total: null, items: [] }
  }
}
```

## Installation

1. Reuse the exact existing app page and role gate. Read its current source,
   governance baseline and source revision. Obtain any required app-bound plan
   approval before changing the target. Plugin installation alone grants no app
   write authority.
2. Copy `components/BosMemoryCard.jsx`, `components/BosMemoryCard.css` and
   `scripts/app-memory-summary.mjs`, preserving their relative imports or adapting
   them to the app's existing component convention.
3. Connect a stable `loadSummary` function to the app's existing authenticated
   backend. It receives `{ projectRef, signal }` and returns parsed summary JSON.
   Base44 `functions.invoke()` wraps JSON in `response.data`. Do not treat browser
   `visible` or a claimed role as authorization. The backend must deny unauthenticated
   and unauthorized callers and cross-project reads. Avoid caching private responses.
4. Render `<BosMemoryCard projectRef={exactProjectRef} visible={isOwnerOrAdmin}
   loadSummary={loadSummary} />` inside the existing page. Memoize the loader or
   define it at module scope to avoid needless refetches. On logout/account change,
   unmount the card or change the loader's identity so pending results are discarded.
5. The existing governance writer must regenerate the safe summary after accepted
   decisions, intention updates and memory changes. A generated snapshot must retain
   its original capture timestamp until the source is actually reread. Refresh
   refetches the saved snapshot; it does not execute governance or claim live health.
   If no writer/data adapter exists, report that integration as pending. Do not ship
   a frozen demo as an automatically updating dashboard.
6. Verify source and UI readback, three tabs, keyboard arrows/Home/End, mobile
   containment, long content scrolling, empty/loading/error states, request races,
   role denial and project isolation. Record local component and target integration
   acceptance separately. Retain exact prior target files for owner-directed recovery.

No portal, new launcher, support chat, analytics collection, central database or
scheduled work is part of this card.
