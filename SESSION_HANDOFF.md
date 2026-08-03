# SMFC POS — Session Handoff

**Date:** 2026-08-03 (Mon)
**Branch:** `main` — **not yet committed** (this session's changes are on disk, uncommitted — see below)
**Repo:** `https://github.com/vinsu-hub/SMFC-POS.git`
**Local working copy this session:** `D:\SMFC_POS\saint_michael_pos\saint_michael_pos`
**Production:** ✅ Deployed and live as of 2026-08-02 (this session's payroll engine work has **not** been deployed)

---

## ⚠️ ACTION NEEDED BEFORE CONTINUING

This session added **migrations `0022` through `0028`** (holiday calendar, DOLE pay-multiplier rules, attendance/payroll_items breakdown columns, overrides, audit log) — **not yet applied** to the shared Supabase project. Same as every prior DDL change, this environment's CLI has no `supabase link` access, so apply them in order via the Supabase Dashboard SQL Editor for project `autaunyrcqdbhprfdhfh` before testing the new payroll engine or running `tests/test_payroll_engine.py`. Everything else (code) is already in place and working against the flat-rate path in the meantime.

Also: this session's changes have not been committed to git yet (check `git status`).

---

## To continue on another laptop

```bash
git clone https://github.com/vinsu-hub/SMFC-POS.git
cd SMFC-POS
```

Everything up through migration `0021` has already been applied to the **shared Supabase project** (`autaunyrcqdbhprfdhfh`) that both local dev and production point at — there is no separate dev/prod DB to sync. Migrations `0022`–`0028` (this session) are **pending** — see the action-needed note above. You only need to `git pull` and set up local `.env` files (copy from `.env.example` or ask for the values — they're not committed) to resume local dev.

```bash
# Backend (from services/api-fastapi) — avoid --reload, unreliable on Windows
uv run uvicorn app.main:app --port 8001

# Dashboard (from apps/dashboard-web)
npm run dev -- --port 3001

# Staff Clock (from apps/staff-clock)
npm run dev -- --port 5174

# Re-seed demo data (idempotent, safe to re-run)
cd services/api-fastapi && uv run python scripts/seed_demo.py
```

Deploying to production does **not** happen automatically on push — Vercel projects are not connected to GitHub auto-deploy. To deploy:

```bash
cd services/api-fastapi && vercel --prod
cd apps/dashboard-web && vercel --prod
cd apps/staff-clock && vercel --prod
```

---

## Production Status

| Service | URL | Status |
|---|---|---|
| Backend (`smfc-api`) | `https://api-fastapi-omega.vercel.app` | ✅ Live |
| Dashboard (`smfc-ims`) | `https://dashboard-web-two-sigma.vercel.app` | ✅ Live |
| Staff Clock kiosk (`staff-clock`) | `https://staff-clock-omega.vercel.app` | ✅ **Newly deployed this session** — was local-only before |

All three point at the same Supabase project (`autaunyrcqdbhprfdhfh`). Staff Clock's production `VITE_API_BASE_URL` env var (set via `vercel env add`, Production scope) points at the live backend, not `localhost:8001`.

---

## What This Session Covered (2026-08-03)

Built a **Payroll Holiday-Pay Multiplier Engine** plus an adjustable payroll rules section in HR — implemented per a plan at `C:\Users\vinsu\.claude\plans\we-are-improvting-the-resilient-yeti.md` (payroll-scoped only; a separate Command Center Overview redesign was explicitly deferred, as was most of a broader enterprise-UI spec the user supplied — only the pieces relevant to Payroll/Holiday-Calendar/Payroll-Settings were adopted).

### 1. Backend: DOLE Labor Advisory 12-25 engine
- New tables (migrations `0022`–`0028`, **not yet applied** — see action-needed note above): `hr.holidays`, `hr.pay_multiplier_rules` (7 DOLE scenarios: regular day, regular holiday ± rest day, special non-working ± rest day, special working, rest day), `hr.payroll_rule_settings` (single-row `engine_enabled` flag, defaults `false`), `hr.payroll_overrides` (reason + approver required, no direct payroll edits), `hr.payroll_audit_log` (payroll-scoped, not app-wide). Also extends `hr.attendance_logs` and `hr.payroll_items` with breakdown columns (`regular_hours`/`overtime_hours`/`night_diff_hours`/`day_scenario`/`holiday_id`).
- Seeded 2026 PH holiday calendar (fixed dates only — Eid'l Fitr/Eid'l Adha left as a `TODO` follow-up migration since they're lunar-dependent and unproclaimed).
- `services/api-fastapi/app/attendance_utils.py`: added `resolve_day_scenario`, `split_regular_and_overtime`, `compute_night_diff_hours` (PH-local-time-aware — every other timestamp in this codebase is raw UTC with no Asia/Manila conversion, but night-diff specifically needed it for legal correctness), `compute_attendance_breakdown` — wired into `clock_out` and the stale-shift auto-closer.
- `services/api-fastapi/app/routers/hr.py`: fixed a real bug — `_resolve_branch_and_company` (was line 273) had a hardcoded `"Saint Michael Food Corp"` fallback used whenever a branch had no `organization_id` link; now falls back to the real branch name. Rewrote `_compute_payroll_summary` to be engine-flag-aware: byte-identical flat-rate output when `engine_enabled=false` (zero regression risk), full DOLE multiplier math when `true`. Added holiday/pay-rule/settings/override/audit-log CRUD endpoints. **Wired up the previously dead `POST /payroll` / `GET /payroll` / `GET /payroll/{id}/print` endpoints** — they existed in the backend for a while but had zero frontend callers; now the dashboard's "Generate Payroll" actually persists a run and History shows real past runs.
- `services/api-fastapi/app/payroll_pdf.py`: optional OT/night-diff/holiday breakdown rows on the payslip PDF, only rendered when non-zero. Currency still prints as `"PHP 1,234.56"` text, not the ₱ glyph — no Unicode TTF font exists in the repo to embed, confirmed via grep; kept as-is.
- Tests: `tests/test_attendance_utils.py` (8 pure unit tests, **passing now**, no DB needed — hour-splitting, night-diff window math including a midnight-crossing shift, scenario-key mapping). `tests/test_payroll_engine.py` (3 integration tests against real Supabase via `conftest.py`-style fixtures — DOLE math correctness, engine-off regression, override math — **blocked on migrations `0022`–`0028` being applied**, not yet run).

### 2. Frontend: new pages + Payroll restructure
- New page `apps/dashboard-web/client/src/pages/HolidayCalendar.tsx` — Upcoming/Table/Audit-Log views, executive-edit / manager-read-only, linked from Sidebar and the Payroll toolbar. (Simplified from the original plan's Calendar-grid + Import views — judged not worth the extra surface over Table/Upcoming + the existing Add-Holiday dialog.)
- New page `apps/dashboard-web/client/src/pages/PayrollSettings.tsx` — Employee Pay Rates (moved here from the old Payroll "History" tab, which was actually a rate-editor mislabeled as history), Multiplier Rules (editable DOLE percentage table), engine on/off toggle (executive-only, explicitly labeled as a production-wide switch since there's no dev/prod split), Approval Workflow and Payslip Layout info tabs. Consolidated the plan's separate Night-Differential/Overtime/Holiday-Rules tabs into one Multiplier Rules table since they're columns of the same underlying data.
- `HRPayroll.tsx` fully restructured: sticky Toolbar (branch/period/Generate Payroll/Holiday Calendar link/Settings link) → executive-style Summary Cards (Total Payroll, Holiday Premium, Night Differential, Overtime, Employees) → Validation Panel (status chips: attendance complete, holiday configured, pending overrides, engine on/off) → Main Table (row click opens an Employee Drawer) → real payroll History (was previously the mislabeled rate-editor).
- Employee Drawer (right-side sheet): Overview / Breakdown / Overrides / Payslip tabs. **Not fully wired**: the Overrides tab's submit button currently just shows an info toast — targeting a specific attendance log needs a per-day log picker that wasn't in the original page; flagged as the natural next step, not silently stubbed.
- `lib/api.ts`: added ~15 new wrapper functions and types for holidays/pay-rules/settings/overrides/audit-log/payroll persistence, following the existing `request()` pattern.
- Verified live in a real browser (Playwright) against the running dev servers, logged in as `manager@danielito-agapita.com` — all three pages render correctly; the parts needing the unapplied migrations fail gracefully with a toast (not a crash), exactly as expected pre-migration. `tsc --noEmit` shows the same 15 pre-existing unrelated errors (Sidebar/HRAttendance/InventoryMovements/UtilityLog null-check issues, not touched this session) and zero new ones.

---

## What This Session Covered (2026-08-02)

This was a long session building on top of the prior one's inventory-movements/staff-clock/utility-monitor work. Major pieces, roughly in order:

### 1. Multi-company branch restructure
Replaced the old 4 branches (Danielito's, Malaya's, D'Den, Catering) with **5 companies × 12 real locations**, each with its own login, logo, and theming:
- Danielito's Home Kitchen (Agapita Road, Bgy. Maitim Bay, Tagaytay City) — 3 locations
- Malaya's Cafe (Agapita, Brgy. Maitim Bay, 2/F PITX, JSH Bldg Grove) — 4 locations
- The Den (Agapita Road, Brgy. Maitim Bay) — 2 locations
- D'Venue Events Place (Agapita Road, Brgy. Maitim Bay) — 2 locations
- Isabela's Signature Caterer (Agapita Road) — 1 location

Each location: 1 employee + 1 manager account (`employee@{theme_key}.com` / `manager@{theme_key}.com`, password `demo1234`, kiosk PIN `1234`).

Old pre-restructure branch rows (`danielito`, `malaya`, `dden`, `dbar`, `catering`) are **still in the database** (some, like `dbar`, have real historical transactions) but are filtered out of all pickers/dropdowns and reports — never deleted.

Real company logos live in `apps/dashboard-web/client/src/assets/logos/`.

### 2. Command Center fixes
Fixed dead top-level tabs (previously `danielito`/`malaya`/`dden` tabs had no matching content). Now 5 company tabs, each with nested per-location sub-tabs. Utility Monitor's branch breakdown also had legacy branches leaking through — filtered.

### 3. Inventory Movements
- Transfer Out was silently a no-op (never called the transfer API) — fixed, now has a destination-branch picker.
- New **Request Stock** flow: pick a source branch → their ingredient → quantity → sends a request the source branch can approve/decline, converting to a real transfer.
- Fixed a 422 bug on the "Receive" button (backend required an unused body param).
- Delivery movements can now capture a per-unit cost override that updates the ingredient's cost basis.
- Legacy branches filtered out of all branch pickers (`BRANCH_CONFIG` allow-list pattern, reused everywhere this came up).

### 4. Utility Log
Added **gas** as a loggable type — day-range based (1-7 days), not meter-based like electricity/water, since gas is tank/canister consumption. Feeds into Command Center's Utility Monitor.

### 5. HR
- **Add Employee** button (manager/executive) — auto-generates a login (email + password `demo1234`) and kiosk employee number/PIN.
- Fixed a real bug: HR Attendance and HR Payroll pages were hard-gated on `user.branchId`, which is `null` for executives — so both pages silently showed nothing for that role. Both now have a branch selector for executives (same pattern used in POS Management).
- Seeded 2 weeks of attendance data across **all 12 branches / 24 staff**, confirmed payslip PDF generation works end-to-end (tested via `scripts/seed_attendance_and_test_payroll.py`, which also does a "dry run" PDF generation you can re-run any time).

### 6. POS Terminal + new pages
- **Discount buttons** above the subtotal — Employee Discount (10%), Senior Citizen (20%, VAT-exempt), PWD (20%, VAT-exempt) per PH law (RA 9994/RA 10754), seeded per branch.
- **POS Management** (new page, manager/executive) — add/edit discount types per branch, toggle VAT-exempt/active.
- **Owner's Request** flow — flags an order as the owner's personal consumption; requires the acting employee to re-enter their *own* employee number + PIN (verified server-side against their kiosk PIN hash, must match the logged-in account) plus an optional note. These orders are excluded from Command Center revenue.
- **Order Queue** (new page) — today's orders in a timeline:
  - **Void** — restores inventory, employees can only void their own orders, manager/executive any.
  - **Edit** — adjust quantity, or "hold" a recipe ingredient (e.g. "no rice") which returns that ingredient's stock as a positive variance, logged as an `inventory_movements` `trans_in` row.
  - **Done** — marks an order fulfilled (separate from payment status), removing it from the active queue view (toggle to show completed ones again).
- Replaced the `$` icon with `PhilippinePeso` (currency values already rendered `₱` via `formatCurrency`).

**Real bug found and fixed during testing:** voiding an order was restoring stock based on the item's *full* recipe, ignoring which ingredients had been held — double-crediting stock for anything already returned via a hold. Fixed and verified with a full functional test script (`scripts/test_order_edit.py`) covering create → hold → reduce quantity → void, confirming zero stock drift.

### 7. Settings page — role restriction
Employees now see **only** an Account Settings card (email, role, Sign Out) — no Branch Information, Notifications, Users, or System tabs. Manager/executive still get the full tabbed Settings page unchanged.

### 8. Branding
- Login page: "Saint Michael Food OPC" (full legal name), subtitle "SMFC Command Suite" (replacing "Multi-Venue POS System").
- Note: the payslip PDF header still says "Saint Michael Food Corp" (pulled from the `organizations.name` DB column, separate from the Login page text) — not changed, flagged for awareness.

### 9. Test/demo data added this session
- 6 breakable supply items (Glass Cup, Coffee Cup, Straws, Plates, Spoon, Fork) added to every branch's Loss Log dropdown.
- Pan-Seared Halibut's recipe expanded from 1 to 3 ingredients (Halibut Fillet + Jasmine Rice + Lemon Butter Sauce, Danielito's only) specifically so Order Queue's "hold ingredient" edit has something realistic to test ("Halibut, no rice").
- **Coffee Beans** added as a test ingredient to all 12 branches (not just Malaya's, which already had it as a real menu ingredient) so Transfer Out / Request Stock / Receive Stock can be exercised between any two branches.
- 2 weeks of attendance data across all 12 branches for payroll testing (see HR section above).

---

## Database — Supabase Migrations

### 0015–0021 (applied 2026-08-02)

| File | Purpose |
|---|---|
| `0015_dvenue_isabelas_branch_type.sql` | Adds `events_venue`/`catering_service` to `branch_type` enum for the 2 new companies |
| `0016_stock_requests.sql` | New `stock_requests` table for the Request Stock flow |
| `0017_gas_utility_type.sql` | Adds `gas` to `utility_type` enum |
| `0018_utility_logs_gas_columns.sql` | `utility_logs` gains `quantity`/`unit_label`/`days_covered`, `reading_start` now nullable, partial unique index (meter-based types only) |
| `0019_pos_discounts_void_owner_request.sql` | New `discount_types` table; `transactions` gains discount/owner-request/void audit columns |
| `0020_transaction_item_edits.sql` | `transaction_items` gains `held_ingredient_ids uuid[]` |
| `0021_transaction_fulfilled.sql` | `transactions` gains `fulfilled`/`fulfilled_at` (Order Queue's "Done" button) |

### 0022–0028 (written 2026-08-03, **NOT YET APPLIED** — see action-needed note at top)

| File | Purpose |
|---|---|
| `0022_hr_holiday_calendar.sql` | New `hr.holidays` table (date/name/type/recurring/branch-scope) |
| `0023_hr_pay_multiplier_rules.sql` | New `hr.pay_multiplier_rules` (7 DOLE scenarios) + `hr.payroll_rule_settings` (engine on/off flag) |
| `0024_hr_seed_2026_holidays_and_rates.sql` | Seeds DOLE Labor Advisory 12-25 rates + 2026 PH holiday calendar (Eid dates TBD) |
| `0025_hr_attendance_breakdown_columns.sql` | `hr.attendance_logs` gains `regular_hours`/`overtime_hours`/`night_diff_hours`/`is_rest_day`/`holiday_id`/`day_scenario` |
| `0026_hr_payroll_items_breakdown.sql` | Same breakdown columns on `hr.payroll_items` |
| `0027_hr_payroll_overrides.sql` | New `hr.payroll_overrides` table (reason + approver required) |
| `0028_hr_payroll_audit_log.sql` | New `hr.payroll_audit_log` table (payroll-scoped audit trail) |

All migrations (past and pending) apply directly to the live Supabase project via the SQL Editor (this environment's CLI login doesn't have `supabase link` access to that project — DDL changes need the Dashboard SQL Editor; plain row reads/writes work fine via the service-role REST client already used everywhere in the backend/scripts).

---

## Known Gaps / Not Done

| Item | Status |
|---|---|
| Migrations `0022`–`0028` not applied | **Blocking** — see action-needed note at top. Apply before testing the payroll engine. |
| Employee Drawer → Overrides tab not fully wired | Submit button shows an info toast instead of creating a real `hr.payroll_overrides` row — needs a per-day attendance-log picker inside the drawer's Attendance tab first |
| Holiday Calendar has no month-grid/Import view | Simplified to Upcoming/Table/Audit-Log — a full calendar-grid widget and separate "Import DOLE data" flow were judged not worth the extra surface over the existing Add-Holiday dialog |
| Command Center Overview redesign | Explicitly deferred (separate from this session's payroll scope) — user supplied a full enterprise-UI spec covering Inventory/POS/Command Center/Malaya AI/Newsfeed/etc.; only the Payroll/Holiday-Calendar/Payroll-Settings pieces were adopted, the rest flagged as a future initiative |
| ₱ peso glyph in payslip PDF | Still renders as `"PHP 1,234.56"` text — no Unicode TTF font embedded in the repo |
| Payslip PDF header still says "Saint Michael Food Corp" (fixed the *other* hardcode) | The `_resolve_branch_and_company` fallback in `hr.py` was fixed this session; if the org's `organizations.name` row itself still says "Saint Michael Food Corp", that's separate data, not code |
| Old legacy branch rows (`danielito`, `malaya`, `dden`, `dbar`, `catering`) | Left in place deliberately (`dbar` has real historical transactions) — filtered from UI, not deleted |
| Tagaytay-location employee profile `full_name` fields | Still say "...Tagaytay - Alfonso (Kaybagal North)" — set before the location was renamed to "Tagaytay City"; cosmetic only, seed script doesn't overwrite existing `full_name` |
| Backend test coverage | 8 pure unit tests + 3 integration tests added this session (`tests/test_attendance_utils.py`, `tests/test_payroll_engine.py`); integration tests blocked on migrations. Plus the two manual dry-run/functional scripts from 2026-08-02 (`scripts/test_order_edit.py`, `scripts/seed_attendance_and_test_payroll.py`) |
| Bundle size warning | Dashboard's main JS chunk is ~1.35MB — Vite warns about it on every build, not addressed (code-splitting opportunity) |

---

## Demo Accounts (password: `demo1234`, kiosk PIN: `1234`)

Pattern: `employee@{location-theme-key}.com` / `manager@{location-theme-key}.com`, e.g.:

| Role | Location | Email |
|---|---|---|
| Employee | Danielito's - Agapita Road | `employee@danielito-agapita.com` |
| Manager | Danielito's - Agapita Road | `manager@danielito-agapita.com` |
| Employee | Malaya's - 2/F PITX | `employee@malaya-pitx.com` |
| Employee | The Den - Agapita Road | `employee@dden-agapita.com` |
| Employee | D'Venue - Agapita Road | `employee@dvenue-agapita.com` |
| Employee | Isabela's - Agapita Road | `employee@isabelas-agapita.com` |
| Executive | — | `exec@corp.com` |
| Executive | — | `ops@corp.com` |

Full list of all 12 locations' theme keys is in `apps/dashboard-web/client/src/lib/types.ts`'s `LOCATIONS` array.

---

## Testing Checklist (confirmed working 2026-08-02)

- [x] Multi-company login/branding across all 12 locations
- [x] Command Center: all 7 top tabs render (Overview, 5 companies, Utility Monitor), nested location sub-tabs
- [x] Transfer Out actually creates a transfer; Request Stock → approve → converts to transfer
- [x] Gas utility logging (day-range based) feeds Command Center
- [x] Add Employee (manager/executive) creates a working login
- [x] HR Attendance/Payroll work for executives (branch selector)
- [x] Payroll PDF generation (tested across 3 different branches)
- [x] POS discounts (Senior/PWD correctly zero out VAT, Employee Discount doesn't)
- [x] Owner's Request requires correct PIN, excluded from revenue
- [x] Order Queue: Void (restores inventory, verified no double-restore bug), Edit (hold ingredient → positive variance, verified with automated test), Done (removes from active queue)
- [x] Settings page correctly restricted for employee role
- [x] Staff Clock kiosk deployed and reachable in production

## Testing Checklist (confirmed working 2026-08-03)

- [x] `pytest tests/test_attendance_utils.py` — 8/8 pure unit tests pass (hour-splitting, night-diff window math, scenario mapping)
- [x] `tsc --noEmit` — zero new errors introduced, same 15 pre-existing unrelated ones
- [x] Payroll page renders with new Toolbar/Summary Cards/Validation Panel/Table layout (verified live via Playwright, logged in as `manager@danielito-agapita.com`) — flat-rate math unaffected (engine still off)
- [x] Holiday Calendar page renders (Upcoming/Table/Audit tabs), fails gracefully with a toast (not a crash) since `hr.holidays` doesn't exist yet
- [x] Payroll Settings page renders — Employee Pay Rates works today (no migration needed), engine toggle correctly locked to executive-only for a manager login, fails gracefully on the still-missing `hr.payroll_rule_settings` table
- [ ] `pytest tests/test_payroll_engine.py` — **not yet run**, needs migrations `0022`–`0028` applied first
- [ ] End-to-end: flip `engine_enabled` on, generate payroll for a period with a seeded holiday, confirm payslip PDF shows the breakdown and totals match manual DOLE-table math — **not yet done**, needs migrations applied
