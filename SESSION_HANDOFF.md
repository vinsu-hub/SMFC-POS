# SMFC POS — Session Handoff

**Date:** 2026-07-31 (Fri)  
**Branch:** `main` (no git commits yet)

---

## Objective
Build comprehensive SMFC POS extensions: inventory movements (TransIN/TransOUT/transfers), utility logging, HR attendance/payroll, separate staff-clock app, branch renames, Catering branch, Malaya AI integration.

---

## Completed Work

### Database Migrations (3 files)
| File | Purpose |
|------|---------|
| `supabase/migrations/0007_inventory_movements_and_transfers.sql` | `inventory_movements`, `transfers`, `transfer_items` tables + RLS |
| `supabase/migrations/0008_utility_logs.sql` | `utility_logs` (electricity/water/gas/other meter readings) |
| `supabase/migrations/0009_hr_attendance_and_payroll.sql` | `attendance_logs`, `payroll_records`, `payroll_items` + RLS |

> ⚠️ **Migrations NOT yet applied** — must run in Supabase SQL Editor before features work.

---

### Branch Configuration Updates
**File:** `apps/dashboard-web/client/src/lib/types.ts`  
Updated `BRANCH_CONFIG` with 4 branches:
- `danielito` — Danielito's (existing)
- `malaya` — Malaya's Cafe (existing)
- `dden` — **D'Den** (renamed from D'Bar)
- `catering` — **Saint Michael Food Corp Catering** (new)

Each branch has: `name`, `color`, `accentColor`, `displayFont`, `bodyFont`, `theme`.

---

### CSS Design System (Warm Slate)
**File:** `apps/dashboard-web/client/src/index.css` (lines 62-104)  
Added brand-thread utilities for all 4 branches:
```css
.brand-thread-danielito   { border-left-color: #6E8368; }
.brand-thread-malaya      { border-left-color: #6E8368; }
.brand-thread-dden        { border-left-color: #8B4513; }
.brand-thread-catering    { border-left-color: #2A5C45; }
```
Typography fonts: `font-dden-*`, `font-catering-*`, etc.

---

### Renamed D'Bar → D'Den (across 8 files)
| File | Changes |
|------|---------|
| `CommandCenter.tsx` | Branch references, stat cards |
| `Newsfeed.tsx` | Branch filter |
| `Login.tsx` | Branch selection |
| `Header.tsx` | Branch display |
| `POSTerminal.tsx` | Branch context |
| `Settings.tsx` | Branch config |
| `TrendAnalysis.tsx` | Branch selector |
| `Sidebar.tsx` | Nav labels |

---

### Backend — FastAPI Routers (4 new files)
**Location:** `services/api-fastapi/app/routers/`

| Router | Endpoints |
|--------|-----------|
| `inventory_movements.py` | `POST /inventory/movements`, `GET /inventory/movements`, `POST /inventory/transfers`, `GET /inventory/transfers`, `POST /inventory/transfers/{id}/receive` |
| `transfers.py` | Transfer lifecycle (create, list, receive, complete) |
| `utility.py` | `POST /utility/logs`, `GET /utility/logs`, `GET /utility/summary` |
| `hr.py` | `POST /hr/clock-in`, `POST /hr/clock-out`, `GET /hr/attendance`, `POST /hr/payroll`, `GET /hr/payroll`, `GET /hr/payroll/{id}/print` |

**Also updated:**
- `schemas.py` — All new Pydantic models
- `main.py` — Registered new routers

---

### Frontend API Client (Complete rewrite)
**File:** `apps/dashboard-web/client/src/lib/api.ts`  
New TypeScript interfaces + fetch/create/update functions for:
- `InventoryMovement`, `Transfer`, `TransferItem`
- `UtilityLog`, `UtilitySummary`
- `AttendanceLog`, `PayrollRecord`, `PayrollItem`
- All CRUD + branch-scoped queries

---

### Frontend Pages (4 new)
| Page | Route | Features |
|------|-------|----------|
| `InventoryMovements.tsx` | `/inventory-movements` | TransIN/TransOUT/Delivery tabs, transfer create/receive |
| `UtilityLog.tsx` | `/utility-log` | Meter readings (electricity/water/gas/other), monthly summary |
| `HRAttendance.tsx` | `/hr/attendance` | Live clock, branch roster, attendance table, hours calc |
| `HRPayroll.tsx` | `/hr/payroll` | Payroll generation, print receipts, period selector |

---

### Navigation & Dashboard Updates
**Files:** `App.tsx`, `Sidebar.tsx`, `CommandCenter.tsx`
- Added HR, Utility, Inventory nav items in sidebar
- Command Center: utility cost card + pending transfers card

---

### Staff Clock App (Separate Vite app)
**Location:** `apps/staff-clock/` — **Port 5174**

| File | Purpose |
|------|---------|
| `package.json` | Vite + React + Tailwind v4 |
| `vite.config.ts` | Port 5174, proxy to API |
| `client/src/index.css` | Warm Slate tokens + `.btn*` component classes |
| `client/src/App.tsx` | Number keypad, employee verify, clock in/out, live timer |
| `client/src/lib/api.ts` | Lightweight API client for clock endpoints |

**UI Flow:** Employee ID → PIN verify → Clock In/Out buttons → Live elapsed timer

---

## Dev Servers Running
| Service | URL | Port | Status |
|---------|-----|------|--------|
| FastAPI Backend | http://127.0.0.1:8001 | 8001 | ✅ `/health` → `{"status":"ok"}` |
| Main Dashboard | http://localhost:3001 | 3001 | ✅ HTTP 200 |
| Staff Clock | http://localhost:5174 | 5174 | ✅ HTTP 200 |

---

## Build Errors Fixed This Session

### 1. Staff Clock — Tailwind v4 Recursive `@apply btn`
**Error:** `[plugin:@tailwindcss/vite:generate:serve] Cannot apply unknown utility class 'btn'`
**File:** `apps/staff-clock/client/src/index.css:63-83`

**Root Cause:** `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-destructive` used `@apply btn ...` where `.btn` is the class being defined — creating a recursive self-reference that Tailwind v4 rejects.

**Fix:** Inlined the full utility list from `.btn` into each variant class instead of `@apply btn`. All visual styles preserved.

---

### 2. Dashboard — TypeScript Comment Syntax Error
**Error:** `[plugin:vite:esbuild] Expected identifier but found "--"`
**File:** `apps/dashboard-web/client/src/lib/types.ts:180,181,188,189`

**Root Cause:** CSS-style comments (`-- comment`) used inside a `.ts` file.

**Fix:** Converted all 4 `--` comments to `//` comments:
```ts
// Before (lines 180-181):
color: '#8B4513', -- Saddle Brown for den atmosphere
accentColor: '#D4A574', -- Warm sand accent

// After:
color: '#8B4513', // Saddle Brown for den atmosphere
accentColor: '#D4A574', // Warm sand accent
```

---

### 3. Dashboard — `await import()` in Template Literals (Top-Level)
**Error:** `[plugin:vite:react-babel] Unexpected reserved word 'await'`
**Files:** `HRPayroll.tsx` (3), `HRAttendance.tsx` (1), `InventoryMovements.tsx` (2), `UtilityLog.tsx` (1) — **6 total occurrences**

**Root Cause:** Dynamic `await import('@/lib/types')` used inside template literals and top-level const declarations — `await` only valid inside `async` functions.

**Fix:** 
1. Added static import at top of each file: `import { BRANCH_CONFIG } from '@/lib/types';`
2. Replaced all `await import(...)` with direct `BRANCH_CONFIG[...]` usage

**Example (HRPayroll.tsx:107):**
```tsx
// Before:
<div class="branch">${user?.branch ? (await import('@/lib/types')).BRANCH_CONFIG[user.branch as any]?.name : 'Corporate HQ'}</div>

// After:
<div class="branch">${user?.branch ? BRANCH_CONFIG[user.branch as keyof typeof BRANCH_CONFIG]?.name : 'Corporate HQ'}</div>
```

---

## Demo Accounts (password: `demo1234`)
| Role | Emails |
|------|--------|
| Employee | `ana@malaya.com`, `marco@danielito.com`, `diego@dden.com` |
| Manager | `sofia@malaya.com`, `luis@danielito.com`, `victor@dden.com` |
| Executive | `exec@corp.com`, `ops@corp.com` |

---

## Known Gaps / Next Steps

| Item | Status | Action Needed |
|------|--------|---------------|
| **Apply Supabase migrations** | ❌ Not done | Run 0007, 0008, 0009 SQL in Supabase Dashboard |
| **Seed `pay_rate` for demo users** | ❌ Empty | Run seed script or manual UPDATE on `profiles` table |
| **Malaya AI indexing** | ⚠️ Partial | Extend router to read `attendance_logs`, `utility_logs`, `transfers` |
| **Catering branch demo data** | ❌ None | Insert sample catering products/ingredients |

---

## Key Design Decisions (from user)
1. **HR in-dashboard** (Option B) — not separate app
2. **`pay_rate` on `profiles` table** (Option A)
3. **Transfer flow:** Source logs TransOUT → Destination confirms receipt (marks TransIN)
4. **Catering palette:** Sage Green `#2A5C45` + Terracotta `#C76A4F` (accepted)

---

## Files Modified This Session (Summary)

### Backend
```
services/api-fastapi/app/routers/inventory_movements.py   (new)
services/api-fastapi/app/routers/transfers.py             (new)
services/api-fastapi/app/routers/utility.py               (new)
services/api-fastapi/app/routers/hr.py                    (new)
services/api-fastapi/app/schemas.py                       (extended)
services/api-fastapi/app/main.py                          (router registration)
```

### Dashboard Frontend
```
apps/dashboard-web/client/src/lib/types.ts                (branch config + fix)
apps/dashboard-web/client/src/lib/api.ts                  (rewritten)
apps/dashboard-web/client/src/pages/InventoryMovements.tsx  (new)
apps/dashboard-web/client/src/pages/UtilityLog.tsx          (new)
apps/dashboard-web/client/src/pages/HRAttendance.tsx        (new)
apps/dashboard-web/client/src/pages/HRPayroll.tsx           (new)
apps/dashboard-web/client/src/App.tsx                       (routes)
apps/dashboard-web/client/src/components/Sidebar.tsx        (nav)
apps/dashboard-web/client/src/components/CommandCenter.tsx  (stats)
apps/dashboard-web/client/src/index.css                     (brand threads)
... + 8 files for D'Bar → D'Den rename
```

### Staff Clock (new app)
```
apps/staff-clock/                                         (entire directory)
```

### Supabase
```
supabase/migrations/0007_inventory_movements_and_transfers.sql
supabase/migrations/0008_utility_logs.sql
supabase/migrations/0009_hr_attendance_and_payroll.sql
```

---

## Commands to Resume
```bash
# Backend (from services/api-fastapi)
uvicorn app.main:app --reload --port 8001

# Dashboard (from apps/dashboard-web)
npm run dev -- --port 3001

# Staff Clock (from apps/staff-clock)
npm run dev -- --port 5174
```

---

## Testing Checklist (Post-Migration)
- [ ] Login as employee → clock in/out on Staff Clock (port 5174)
- [ ] Dashboard → Inventory Movements: create TransIN, TransOUT, Transfer
- [ ] Dashboard → Utility Log: add meter reading, view summary
- [ ] Dashboard → HR Attendance: view roster, hours, export
- [ ] Dashboard → HR Payroll: generate payroll, print receipt
- [ ] Command Center: verify utility cost + transfer cards show data
- [ ] Malaya AI: ask cross-branch questions (after indexing extended)