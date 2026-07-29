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
                              FastAPI (Oracle VM) ──────► n8n (Oracle VM)
                                    │                          │
                                    ▼                          ▼
                              ChromaDB + Groq            Slack / Zoho Mail
                              ("Malaya" AI)               (newsfeed delivery)
```

- **Auth is one path for everyone.** Supabase Auth issues a JWT on login; the Tauri POS, the React dashboard, and FastAPI all validate against the same token. Role and branch live on the `profiles` table, and Postgres Row-Level Security enforces the Employee/Manager/Executive scoping at the database layer — so even a bug in frontend routing can't leak another branch's data.
- **FastAPI is the only thing that talks to Groq and ChromaDB.** Neither the POS nor the dashboard ever calls the AI layer directly; they call FastAPI's `/malaya/*` routes, keeping the API key and retrieval logic server-side.
- **n8n listens, it doesn't own data.** It reacts to Postgres events/webhooks and writes back into `newsfeed_items` and `hr_flags` — the automation layer, not a second source of truth.

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
| `newsfeed_items` | `id`, `branch_id` (nullable = corp-wide), `type` (expiry/low_stock/hr/general), `message`, `severity` | Written mostly by n8n, read by every dashboard |
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

## 6. n8n Wiring

| Trigger | Source | Action |
|---|---|---|
| `ingredients.expiry_date` within threshold | Postgres webhook | Insert `newsfeed_items` (type=expiry) → Slack channel → Zoho Mail alert |
| `ingredients.current_stock` < `reorder_threshold` | Postgres webhook | Insert `newsfeed_items` (type=low_stock) → notify branch manager |
| Nightly cron | n8n schedule | Call `POST /hr/analyze` → FastAPI computes patterns → inserts `hr_flags` → notifies manager/exec |
| Nightly cron | n8n schedule | Call `POST /summaries/generate` per branch → compiles `daily_summaries` → emails EOD digest via Zoho Mail |

> **Note (2026-07-30):** Slack and Zoho Mail delivery wiring is deferred — not part of the current build. n8n workflows in this phase should write to `newsfeed_items` / `hr_flags` only; hook up external delivery channels later when requested.

---

## 7. Repo Structure

```
saint-michael-system/
  docs/
    ui-ux-concept-plan.md
    technology-execution-plan.md
    backend-execution-plan.md
  apps/
    pos-tauri/            # per-branch POS, theme_key-driven
    dashboard-web/         # React, deployed via GitHub → Vercel
  services/
    api-fastapi/           # central backend, Malaya routes live here
    automations-n8n/       # exported workflow .json, versioned in-repo
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
14. Build the `automations-n8n` workflows in §6 and connect them to Slack/Zoho Mail.
15. Build the HR flagging job and `hr_flags` UI.
16. Scope and build the iOS companion app against the same FastAPI endpoints already in place — no new backend work should be needed here if §3 was followed correctly.

---

## 9. Environment / Config Checklist

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # FastAPI only, never shipped to POS/dashboard
GROQ_API_KEY=
CHROMA_PATH=                     # or CHROMA_URL if hosted separately
N8N_WEBHOOK_BASE=
ZOHO_MAIL_SMTP_CREDENTIALS=
SLACK_WEBHOOK_URL=
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

- **Tauri deferred.** The existing repo already ships POS Terminal as a web page (`client/src/pages/POSTerminal.tsx`). Phase 1 wires that page to the real backend instead of scaffolding `apps/pos-tauri` immediately. Tauri shell comes later once the sale → deduction loop is proven.
- **Supabase is hosted, not local.** Docker/WSL2 aren't available on this dev machine (no admin rights in this session), so `supabase start` (local Docker-based stack) isn't an option. Using a hosted Supabase.com project instead — same environment production will use anyway.
- **n8n → Slack/Zoho Mail wiring is out of scope for now.** Newsfeed/HR-flag writes still happen from n8n workflows when we get to Phase 5, but external delivery channels are not being connected yet.
