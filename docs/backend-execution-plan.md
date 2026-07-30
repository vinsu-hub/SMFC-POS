# Backend Structure & Connection Execution Plan
### Saint Michael Food Corp — for Claude Code to build against

*This document is the bridge between the UI/UX Concept Plan (what gets built) and the Technology Execution Plan (what it's built with). It gives Claude Code a concrete schema, endpoint map, and build order so it can go from "here are the screens" to "here's the working backend" without guessing.*

---

## 0. How to Use This With Claude Code

Put all three planning documents in the repo before starting:

```
docs/
  ui-ux-concept-plan.md
  technology-execution-plan.md
  backend-execution-plan.md   <- this file
```

Then kick off Claude Code with the prompt in §10. The short version of the instruction it needs: *read the UI/UX plan to know what screens and data the frontend expects, read this file for the schema and endpoint contract, and don't invent a different shape for either — flag a mismatch instead of silently improvising one.*

---

## 1. System Connection Map

```
Tauri POS (per branch)                    React Dashboard (Manager/Exec)
  local SQLite cache                        Supabase JS client
        │  sync on reconnect                       │  Realtime subscriptions
        ▼                                           ▼
        └───────────────► Supabase (Postgres + Auth + Realtime + Storage) ◄───────┘
                                    │        ▲
                     RLS-scoped     │        │  writes (alerts, digests)
                     reads/writes   ▼        │
                              FastAPI (Vercel) ──────► scheduled jobs (mechanism TBD, see §6)
                                    │                          │
                                    ▼                          ▼
                              ChromaDB + Groq            newsfeed_items
                              ("Malaya" AI)               (in-app only — no external delivery)
```

- **Auth is one path for everyone.** Supabase Auth issues a JWT on login; the Tauri POS, the React dashboard, and FastAPI all validate against the same token. Role and branch live on the `profiles` table, and Postgres Row-Level Security enforces the Employee/Manager/Executive scoping at the database layer — so even a bug in frontend routing can't leak another branch's data.
- **FastAPI is the only thing that talks to Groq and ChromaDB.** Neither the POS nor the dashboard ever calls the AI layer directly; they call FastAPI's `/malaya/*` routes, keeping the API key and retrieval logic server-side.
- **The automation layer listens, it doesn't own data.** Whatever ends up triggering alerts reacts to Postgres events/webhooks and writes back into `newsfeed_items` and `hr_flags` — an automation layer, not a second source of truth. n8n was the originally planned engine for this; it's dropped (see §6 and the build decisions log).

---

## 2. Database Schema (Supabase Postgres)

| Table | Key columns | Purpose |
|---|---|---|
| `organizations` | `id`, `name` | Saint Michael Food Corp (single row, future-proofs multi-corp) |
| `branches` | `id`, `organization_id`, `name`, `type` (fine_dining/cafe/bar), `theme_key` | The three brands; `theme_key` drives which POS skin the Tauri app loads |
| `profiles` | `id` (= auth.users.id), `branch_id` (nullable for execs), `role` (employee/manager/executive), `full_name` | Extends Supabase Auth with role/branch |
| `products` | `id`, `branch_id`, `name`, `category`, `price`, `active` | Menu items |
| `ingredients` | `id`, `branch_id`, `name`, `unit`, `unit_cost`, `current_stock`, `reorder_threshold`, `expiry_date` | Raw inventory |
| `recipe_items` | `id`, `product_id`, `ingredient_id`, `quantity` | The bill-of-materials link — this is what makes deduction automatic |
| `transactions` | `id`, `branch_id`, `employee_id`, `status` (open/closed/voided), `opened_at`, `closed_at`, `total_amount` | A sale or an open bar tab |
| `transaction_items` | `id`, `transaction_id`, `product_id`, `quantity`, `unit_price` | Line items per sale |
| `loss_records` | `id`, `branch_id`, `ingredient_id`, `product_id`, `employee_id`, `reason` (spoilage/breakage/comp/prep_error), `quantity`, `cost_impact`, `photo_url` | Logged separately from normal consumption |
| `attendance_logs` | `id`, `employee_id`, `branch_id`, `clock_in`, `clock_out`, `status` (on_time/late/absent) | Feeds the HR flag engine |
| `hr_flags` | `id`, `employee_id`, `branch_id`, `pattern_type` (lateness/absence), `description`, `resolved` | `description` is Malaya's plain-language narration, not a raw code |
| `daily_summaries` | `id`, `branch_id`, `date`, `revenue`, `cogs`, `losses`, `margin`, `units_sold` | The EOD compile — one row per branch per day |
| `newsfeed_items` | `id`, `branch_id` (nullable = corp-wide), `type` (expiry/low_stock/hr/general), `message`, `severity` | Written by scheduled automation jobs (mechanism TBD, see §6), read by every dashboard |
| `malaya_query_log` | `id`, `user_id`, `question`, `answer`, `created_at` | Audit trail for what Malaya was asked and answered |

`ChromaDB` sits outside Postgres entirely — it holds embedded daily summaries, product history, and HR pattern text so Malaya can retrieve by meaning, not just by exact SQL filter.

---

## 3. Screen → Endpoint → Data Map

This is the direct handoff from the UI/UX plan to the backend — every screen listed there maps to a specific contract here.

| Screen (from UI/UX plan) | Endpoint(s) | Tables touched | Realtime channel |
|---|---|---|---|
| Login & Role Landing | Supabase Auth (client SDK, no custom endpoint) | `profiles` | — |
| POS Terminal (all 3 variants) | `GET /products`, `POST /transactions`, `POST /transactions/{id}/close` | `products`, `recipe_items`, `transactions`, `transaction_items`, `ingredients` (deduction) | — |
| Inventory Count & Recipe Deduction | `GET /inventory`, `POST /inventory/{id}/count` | `ingredients` | `inventory:{branch_id}` |
| Log Loss/Defect | `POST /loss-records` (+ Storage upload for photo) | `loss_records`, `ingredients` | `inventory:{branch_id}` |
| Manager EOD Dashboard | `GET /branches/{id}/summary`, `GET /branches/{id}/losses`, `GET /branches/{id}/attendance` | `daily_summaries`, `loss_records`, `attendance_logs` | `summary:{branch_id}` |
| Executive Command Center | `GET /organizations/{id}/summary` | `daily_summaries` (all branches) | `summary:{branch_id}` × 3 |
| Malaya AI Panel | `POST /malaya/query` | `malaya_query_log` (write); reads via ChromaDB | — |
| Trend Analysis | `GET /trend/seasonality`, `POST /malaya/trend-narration` | `transaction_items` (aggregated), ChromaDB | — |
| HR Attendance & Flags | `GET /hr/attendance`, `GET /hr/flags` | `attendance_logs`, `hr_flags` | `hr:{branch_id}` |
| Branch Newsfeed | `GET /newsfeed` | `newsfeed_items` | `newsfeed:{branch_id}` or `newsfeed:corp` |

If a screen in the UI/UX plan needs a field that isn't in §2, that's a signal to extend the schema deliberately — not to bend an existing column to double duty.

---

## 4. Real-Time & Offline Sync

- **Live dashboards:** Supabase Realtime streams Postgres changes on `inventory`, `daily_summaries`, `newsfeed_items`, and `hr_flags` straight to subscribed clients — no polling needed on the Manager/Executive side.
- **Offline POS (Tauri + SQLite):** a local `sync_queue` table holds transactions and loss records created while offline, each tagged with a client-generated UUID. A background worker flushes the queue on reconnect. Orders are always additive inserts, never overwritten, so there's no real conflict there. The one place conflicts actually happen is **manual inventory counts** — if a queued offline count disagrees with the server's current figure, the server's count wins automatically and the local one is surfaced to the manager as a flagged variance, not silently applied. This is the rule flagged as a risk in the Technology Execution Plan — this is where it gets resolved concretely.

---

## 5. Malaya's Backend Flow

1. **Ingestion (nightly job):** compile each branch's `daily_summaries`, recent `loss_records`, and `hr_flags` into short text blocks, embed them with BAAI/bge-m3, store in ChromaDB tagged by branch and date.
2. **Query:** `POST /malaya/query {question, scope}` → FastAPI retrieves the top-k relevant embeddings from ChromaDB → builds a grounded prompt (retrieved context + the question) → sends to Groq → logs the exchange to `malaya_query_log` → returns the answer to the AI Panel.
3. **Trend narration & HR flags stay hybrid, not pure-LLM:** the seasonality math and attendance-pattern detection are computed deterministically in FastAPI first; Malaya's job is only to phrase the already-computed result in plain language. This was flagged in the Technology Execution Plan as the way to avoid an LLM silently getting the arithmetic wrong — this flow is where that rule is enforced in code, not just in principle.

---

## 6. Automation (formerly n8n Wiring)

> **Update (2026-07-30): n8n is no longer part of this build.** The automation
> layer originally specified here — expiry alerts, low-stock pings, the
> nightly HR-flag job, and the EOD digest job — still needs to happen, but
> not via n8n. Until a replacement is chosen, the triggers below are
> unimplemented. The leading candidate is moving them into
> `services/api-fastapi` itself as scheduled jobs (e.g. Vercel Cron hitting
> dedicated endpoints), since the API is already deployed on Vercel rather
> than the Oracle VM this section originally assumed — see the build
> decisions log at the bottom of this file. Do not build n8n workflows
> against this schema; treat the table below as a statement of *what* needs
> to trigger, not *how*.
>
> **Update (2026-07-31): external delivery is dropped, not deferred.** Slack
> and Zoho Mail were the originally planned delivery channels; both are now
> out of scope entirely, same treatment as n8n. SMS was never specified
> anywhere in this plan and shouldn't be treated as scope either — the
> Settings UI toggle for it was a frontend-only artifact with nothing behind
> it and has been removed. All triggers below land in `newsfeed_items` only
> and are read in-app; there is no external delivery channel until a real
> need for one is scoped.

| Trigger | What still needs to happen |
|---|---|
| `ingredients.expiry_date` within threshold | Insert `newsfeed_items` (type=expiry), in-app only |
| `ingredients.current_stock` < `reorder_threshold` | Insert `newsfeed_items` (type=low_stock); notify branch manager, in-app only |
| Nightly | Compute HR attendance patterns → insert `hr_flags` → notify manager/exec, in-app only |
| Nightly | Compile `daily_summaries` per branch → in-app daily digest on the dashboard |

---

## 7. Repo Structure

```
saint-michael-system/
  docs/
    ui-ux-concept-plan.md
    technology-execution-plan.md
    backend-execution-plan.md
  apps/
    pos-tauri/            # per-branch POS, theme_key-driven (not started)
    dashboard-web/         # React, deployed on Vercel
  services/
    api-fastapi/           # central backend, deployed on Vercel (see build decisions log)
  supabase/
    migrations/            # schema in §2, as SQL migrations
```

---

## 8. Execution Order for Claude Code

**Phase 1 — Pilot engine (Malaya's Cafe only)**
1. Write Supabase migrations for `organizations`, `branches`, `profiles`, `products`, `ingredients`, `recipe_items`, `transactions`, `transaction_items`.
2. Scaffold `services/api-fastapi` with routers for products, recipes, inventory, transactions.
3. Implement the deduction logic: on `POST /transactions`, for each `transaction_item`, look up `recipe_items` and decrement `ingredients.current_stock` accordingly. Write a test that sells one matcha latte and asserts matcha and syrup stock both drop by the right amount.
4. Scaffold `apps/pos-tauri` with a local SQLite cache and a stub sync worker (queue writes, no server call yet).

**Phase 2 — Branch dashboard**
5. Add `loss_records`, `daily_summaries` migrations.
6. Implement `GET /branches/{id}/summary` and the nightly `/summaries/generate` job.
7. Build the Manager dashboard screens against the endpoint map in §3, wired to Supabase Realtime.

**Phase 3 — Multi-branch**
8. Extend `pos-tauri` to load `theme_key` per branch and confirm the Danielito's and D' Bar POS variants render correctly from the same codebase.
9. Add RLS policies scoping managers to their branch and executives to all branches; write a test that confirms a manager's token cannot read another branch's `transactions`.
10. Build the Executive Command Center against `GET /organizations/{id}/summary`.

**Phase 4 — Malaya**
11. Stand up ChromaDB, write the nightly embedding job from §5.
12. Implement `POST /malaya/query` and `POST /malaya/trend-narration`.
13. Wire the AI Panel and Trend Analysis screens to these endpoints.

**Phase 5 — Automation & mobile**
14. Build the automation triggers in §6 (expiry/low-stock alerts, HR flagging job, EOD digest) via scheduled FastAPI endpoints instead of n8n. In-app (`newsfeed_items`) delivery only — no external channel to wire.
15. Build the `hr_flags` UI.
16. Scope and build the iOS companion app against the same FastAPI endpoints already in place — no new backend work should be needed here if §3 was followed correctly.

---

## 9. Environment / Config Checklist

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=             # FastAPI only, never shipped to POS/dashboard
GROQ_API_KEY=
CHROMA_PATH=                     # or CHROMA_URL if hosted separately
```

---

## 10. Claude Code Kickoff Prompt

```
Read docs/ui-ux-concept-plan.md and docs/technology-execution-plan.md before
writing any code. Then treat docs/backend-execution-plan.md as the
authoritative schema and API contract — do not invent a different table
shape or endpoint path than what's specified there. If a screen in the
UI/UX plan needs data that doesn't fit the existing schema, stop and flag
the mismatch instead of silently working around it.

Start with Phase 1 only (§8): Supabase migrations for organizations,
branches, profiles, products, ingredients, recipe_items, transactions, and
transaction_items; a FastAPI service with routers for products, recipes,
inventory, and transactions; the recipe-based deduction logic with a test
that sells one matcha latte and confirms matcha and syrup stock both drop
correctly; and a Tauri POS shell with a local SQLite cache and a sync
worker stub. Do not begin Phase 2 until Phase 1's deduction test passes.
```

---

## Build decisions log (this repo, 2026-07-30)

- **Tauri deferred.** The existing repo already ships POS Terminal as a web page (`client/src/pages/POSTerminal.tsx`, now themed per-branch). Phase 1 wired that page to the real backend instead of scaffolding `apps/pos-tauri` immediately. Tauri shell comes later, still not started.
- **Supabase is hosted, not local.** Docker/WSL2 aren't available on this dev machine (no admin rights in this session), so `supabase start` (local Docker-based stack) isn't an option. Using a hosted Supabase.com project instead — same environment production will use anyway.
- **n8n is dropped entirely (2026-07-30).** Not deferred — excluded. The automation layer (§6) needs a different mechanism; nothing has been built for it yet. This also removes the Oracle VM as a requirement for hosting the automation layer specifically, though see the next point — it was never used for the API either.
- **Slack and Zoho Mail delivery dropped entirely (2026-07-31).** Same treatment as n8n — not deferred, excluded. All automation triggers (§6) land in `newsfeed_items` and are read in-app; no external delivery channel is planned until a real need is scoped. Removed `ZOHO_MAIL_SMTP_CREDENTIALS` and `SLACK_WEBHOOK_URL` from the env checklist (§9) accordingly. Removed the entire "Delivery Method" card (Email + SMS toggles) from the Settings UI — with no external channel in scope, there's nothing for a delivery-method preference to control; "Alert Preferences" (which alert types show up in the in-app Newsfeed) is the only notification setting that still means anything.
- **`services/api-fastapi` is deployed on Vercel, not the Oracle Always Free VM the tech plan assumed.** Both `apps/dashboard-web` and `services/api-fastapi` are separate Vercel projects (`smfc-ims` and `smfc-api`), the latter as a Python/ASGI serverless function. This was simpler than provisioning and maintaining an Oracle VM for a project already using Vercel for the frontend, and keeps both deploys on one platform/one `vercel` CLI auth. Revisit if a real always-on process (e.g. background workers, WebSocket/Realtime consumers) is needed later — serverless functions don't hold long-running state between requests.
- **RLS is partial.** Only `profiles`, `branches`, and the `loss-photos` storage bucket have RLS policies. `products`, `ingredients`, `recipe_items`, `transactions`, `transaction_items`, and `loss_records` are still open to the anon/publishable key at the database level — access to them is enforced only in `services/api-fastapi/app/auth.py` (branch/role scoping on every route), not by Postgres RLS. Anyone bypassing the API and calling Supabase's REST endpoint directly with the publishable key could currently read/write those tables. Full RLS parity with the auth layer is still open work.
