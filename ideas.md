# Saint Michael Food Corp — Design Philosophy & System

**One shell, three worlds.** Employees live inside their own venue all day — the POS should feel like it belongs to that restaurant, not a generic backend. Managers and executives live *above* all three venues, so their view is a single, calm "control tower" that doesn't play favorites.

---

## Design Approach: Four Coordinated Identities

### 1. **Corporate Shell** ("Command Navy")
Used for ALL Manager and Executive screens, tables, charts, and navigation chrome.

- **Palette:** Ink `#13203A` · Navy `#1B2A4A` (primary) · Cyan `#2E8B99` (actions/links/active) · Brass Gold `#B8860B` (positive metrics) · Cloud `#F4F6F9` (bg) · Slate `#2B2F36` (text)
- **Typography:** Space Grotesk (semibold) for headings · Inter for body · IBM Plex Mono for numeric data
- **Personality:** Calm, analytical, in-control
- **Purpose:** Neutral foundation so no brand looks more important than another

### 2. **Danielito's Home Kitchen** ("Bottle & Brass")
Fine dining POS and branch-specific screens.

- **Palette:** Bottle Green `#1F2E28` · Ivory Linen `#F3EEE2` · Brass `#C9A24B` · Oxblood `#6B2E2E` (alerts)
- **Typography:** Fraunces (warm serif) for dish names · Public Sans for body/tickets
- **Personality:** Refined, unhurried, plated precision
- **Layout:** Ticket-rail POS (right-side chit rail), courses grouped, modifiers as elegant text toggles, low information density
- **Brand Thread Color:** Bottle Green `#1F2E28`

### 3. **Malaya's Cafe** ("Sage & Honey")
Cafe/pastry POS and branch-specific screens.

- **Palette:** Sage `#6E8368` · Warm Oat `#EFE6D4` · Honey `#D9A441` · Espresso `#3C2E26`
- **Typography:** Fredoka (rounded, restrained) for headers · Karla for body
- **Personality:** Warm, tactile, quick and friendly
- **Layout:** Big-tile quick-order grid, category tabs across top, optimized for speed and high transaction volume
- **Brand Thread Color:** Sage `#6E8368`

### 4. **D' Bar** ("Aubergine & Copper")
Bar POS and branch-specific screens.

- **Palette:** Aubergine `#241726` (dark bg) · Copper `#B5651D` · Garnet `#7A2E3B` (alerts) · Bone `#E9E2D9` (text)
- **Typography:** Oswald (condensed) for headers · JetBrains Mono for tab numbers and pour measurements
- **Personality:** Moody, low-light, precise
- **Layout:** Open tabs as cards, numeric keypad for pour entry, dark-mode by default
- **Brand Thread Color:** Copper `#B5651D`

---

## Signature Element: The Brand Thread

A **4px colored left-border** on every card, table row, and chip wherever cross-branch data appears (executive dashboards, HR flags, newsfeed).

- **Danielito's:** Bottle Green `#1F2E28`
- **Malaya's:** Sage `#6E8368`
- **D' Bar:** Copper `#B5651D`

This is the primary wayfinding device across the whole system — do not use numbered badges (01/02/03) or generic icons for branch identification.

---

## Core Principles

1. **Branch Identity First:** Each POS feels like it belongs to that venue. Layout structures differ per branch, not just colors.
2. **Executive Calm:** Manager/Executive views use the neutral Command Navy shell with Brand Thread accents for branch identification.
3. **Cause & Effect Visible:** Every POS sale → recipe deduction → inventory impact is traceable in the UI.
4. **Sync Status Always Visible:** A calm dot in the header (synced / syncing / offline-queued) — never a blocking spinner.
5. **Voice Consistency:** Button language matches confirmation language ("Log loss" → "Loss logged").
6. **Touch-Friendly:** Minimum 44px touch targets on tablets/POS terminals.

---

## Responsive Strategy

| Breakpoint | Target | Notes |
|---|---|---|
| ≥1280px | Manager/Exec desktop | Full multi-column dashboards, Malaya panel docked open |
| 768–1279px | POS tablets, manager floor tablet | Large touch targets (min 44px), single-focus screens |
| <768px | Executive mobile glance | Command Center collapses to swipeable card per branch, Malaya panel becomes full-screen sheet |

---

## Screens to Build (10 Total)

1. **Login + Automatic Role/Branch Routing** — Single login, branch + role detected automatically
2. **POS Terminal** — Three deliberately different layouts (Danielito's ticket-rail, Malaya's quick-grid, D' Bar tab-based)
3. **Inventory Count & Recipe Deduction View** — Expected vs. counted stock, variance highlighted in branch alert color
4. **Log Loss/Defect** — Fast modal: item, quantity, reason, optional photo (2 taps max)
5. **Manager EOD Dashboard** — Revenue, COGS, loss, margin cards + sales table + loss log + attendance
6. **Executive Command Center** — 3-column brand comparison + consolidated totals
7. **Malaya AI Panel** — Persistent right-side drawer/chat, plain-language input, inline charts or "what changed" cards
8. **Trend Analysis** — Seasonality heatmap calendar + ranked rising/declining products
9. **HR Attendance & Flags** — Staff roster with status dots, flags as plain-language cards
10. **Branch Newsfeed** — Chronological, color-tagged by branch, filterable by type

---

## What We're Avoiding

- ❌ Cream background with terracotta/clay accent
- ❌ Pure near-black background with single neon accent
- ❌ Broadsheet/hairline-rule newspaper layout
- ❌ Lorem ipsum — using real menu-style example content (e.g., "2g matcha, 3g liquid sugar")
- ❌ Three POS variants as reskins of the same layout — layout structure itself differs per branch
- ❌ Numbered badges or generic icons for branch identification — Brand Thread only

---

## Implementation Strategy

- **Phase 1:** Core layout, design token system (CSS variables), shared shell components
- **Phase 2:** Login, role routing, Employee POS screens (all 3 branch variants)
- **Phase 3:** Inventory, Loss Log, Manager EOD Dashboard
- **Phase 4:** Executive Command Center, Malaya AI Panel, Trend Analysis, HR, Newsfeed
- **Phase 5:** Polish, responsiveness, delivery

---

## Design Decisions

- **Default Theme:** Light for Corporate Shell and Malaya's Cafe; Dark for D' Bar (low-light service); Light with warm undertones for Danielito's
- **Animation:** Snappy (100–300ms), GPU-accelerated (transform/opacity only), respect prefers-reduced-motion
- **Charts:** Line charts for trends, calendar heatmap for seasonality, radial gauge for margin %, stacked bars for brand comparison — NO pie charts
- **Empty States:** Specific and actionable ("No losses logged today" not "No data"), written in interface voice
