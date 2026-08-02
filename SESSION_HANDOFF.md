# SMFC POS — Session Handoff

**Date:** 2026-08-02 (Sun)
**Branch:** `main` — committed and pushed to `origin/main`
**Repo:** `https://github.com/vinsu-hub/SMFC-POS.git`
**Local working copy this session:** `D:\SMFC_POS\saint_michael_pos\saint_michael_pos`
**Production:** ✅ Deployed and live (backend, dashboard, and staff-clock kiosk all now deployed — see below)

---

## To continue on another laptop

```bash
git clone https://github.com/vinsu-hub/SMFC-POS.git
cd SMFC-POS
```

Everything below (migrations, seed data) has already been applied to the **shared Supabase project** (`autaunyrcqdbhprfdhfh`) that both local dev and production point at — there is no separate dev/prod DB to sync. You only need to `git pull` and set up local `.env` files (copy from `.env.example` or ask for the values — they're not committed) to resume local dev. No new migrations are pending.

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

## What This Session Covered

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

## Database — Supabase Migrations (0015 through 0021, all applied)

| File | Purpose |
|---|---|
| `0015_dvenue_isabelas_branch_type.sql` | Adds `events_venue`/`catering_service` to `branch_type` enum for the 2 new companies |
| `0016_stock_requests.sql` | New `stock_requests` table for the Request Stock flow |
| `0017_gas_utility_type.sql` | Adds `gas` to `utility_type` enum |
| `0018_utility_logs_gas_columns.sql` | `utility_logs` gains `quantity`/`unit_label`/`days_covered`, `reading_start` now nullable, partial unique index (meter-based types only) |
| `0019_pos_discounts_void_owner_request.sql` | New `discount_types` table; `transactions` gains discount/owner-request/void audit columns |
| `0020_transaction_item_edits.sql` | `transaction_items` gains `held_ingredient_ids uuid[]` |
| `0021_transaction_fulfilled.sql` | `transactions` gains `fulfilled`/`fulfilled_at` (Order Queue's "Done" button) |

All applied directly to the live Supabase project via the SQL Editor (this environment's CLI login doesn't have `supabase link` access to that project — DDL changes need the Dashboard SQL Editor; plain row reads/writes work fine via the service-role REST client already used everywhere in the backend/scripts).

---

## Known Gaps / Not Done This Session

| Item | Status |
|---|---|
| Payslip PDF header still says "Saint Michael Food Corp" | Not renamed — pulls from `organizations.name`, separate from Login page branding |
| Old legacy branch rows (`danielito`, `malaya`, `dden`, `dbar`, `catering`) | Left in place deliberately (`dbar` has real historical transactions) — filtered from UI, not deleted |
| Tagaytay-location employee profile `full_name` fields | Still say "...Tagaytay - Alfonso (Kaybagal North)" — set before the location was renamed to "Tagaytay City"; cosmetic only, seed script doesn't overwrite existing `full_name` |
| Backend test coverage | Still zero automated tests beyond the two manual dry-run/functional scripts added this session (`scripts/test_order_edit.py`, `scripts/seed_attendance_and_test_payroll.py`) |
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

## Testing Checklist (confirmed working this session)

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
