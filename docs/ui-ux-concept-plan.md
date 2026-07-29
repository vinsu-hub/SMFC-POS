# UI/UX Concept Plan — Saint Michael Food Corp System

*Danielito's Home Kitchen · Malaya's Cafe · D' Bar — one platform, three identities*

---

## 1. Design Philosophy

**One shell, three worlds.** Employees live inside their own venue all day — the POS should feel like it belongs to that restaurant, not a generic backend. Managers and executives live *above* all three venues, so their view is a single, calm "control tower" that doesn't play favorites.

- **Shared shell** (navy / cyan / gold, from the proposal) — used for all Manager and Executive dashboards, tables, and charts. Neutral on purpose, so no brand looks more important than another.
- **Branch identity** — each brand's POS and floor-facing screens are skinned in that venue's own palette and type, so staff recognize it as *their* tool.
- **Signature motif — the Brand Thread:** a 4px colored rule used as a left-border/tag on every card, row, and chip wherever cross-branch data appears (executive dashboards, HR flags, newsfeed). Instead of generic numbering or icons, color alone tells you which brand a number belongs to — Bottle Green for Danielito's, Sage for Malaya's Cafe, Aubergine/Copper for D' Bar. It's the one consistent wayfinding device across the whole system.

---

## 2. Token System (design brief per identity)

| Identity | Palette | Type pairing | Personality |
|---|---|---|---|
| **Corporate Shell** ("Command Navy") | Ink `#13203A` · Navy `#1B2A4A` · Cyan `#2E8B99` · Brass Gold `#B8860B` · Cloud `#F4F6F9` bg | Display: Space Grotesk (semibold) · Body: Inter · Data: IBM Plex Mono | Calm, analytical, in-control |
| **Danielito's Home Kitchen** ("Bottle & Brass") | Bottle Green `#1F2E28` · Ivory Linen `#F3EEE2` · Brass `#C9A24B` · Oxblood `#6B2E2E` (86'd/alerts) | Display: Fraunces (warm literary serif) · Body: Public Sans | Refined, unhurried, plated precision |
| **Malaya's Cafe** ("Sage & Honey") | Sage `#6E8368` · Warm Oat `#EFE6D4` · Honey `#D9A441` · Espresso `#3C2E26` | Display: Fredoka (rounded, restrained) · Body: Karla | Warm, tactile, quick and friendly |
| **D' Bar** ("Aubergine & Copper") | Aubergine `#241726` bg · Copper `#B5651D` · Garnet `#7A2E3B` (alerts) · Bone `#E9E2D9` text | Display: Oswald (condensed) · Data: JetBrains Mono (tabs/pours) | Moody, low-light, precise |

*Deliberately avoided: cream-and-terracotta, near-black-and-acid-accent, and broadsheet/hairline layouts — the three looks every AI design tool defaults to. Copper and Brass are kept in the same warm-metal family on purpose — a quiet visual reminder that D' Bar and Danielito's share one parent company.*

---

## 3. Roles × Devices × Context

| Role | Primary device | Where | Session pattern |
|---|---|---|---|
| Employee | Tablet / POS terminal | Counter, floor, service station | Many short sessions, high touch-target needs, gloves/wet hands possible at the bar |
| Manager | Desktop (back office) + tablet (floor walk) | Their branch only | Medium sessions, one deep EOD review daily |
| Executive | Desktop (deep dive) + mobile (glance) | Anywhere, across all branches | Sporadic but high-context; needs the fastest possible "how are we doing" answer |

---

## 4. Information Architecture

**Employee**
`Clock In → POS Terminal → [Inventory Count | Log Loss/Defect] → My Shift Summary → Clock Out`

**Manager** (per branch)
`Branch Dashboard (EOD) → Sales & COGS Detail → Inventory Status → Loss Log → Staff & Attendance → Newsfeed → Approvals`

**Executive** (all branches)
`Command Center (all 3 branches) → Branch Drill-down → Trend Analysis → HR Flags (corp-wide) → Newsfeed (aggregate) → Malaya AI (persistent panel, available everywhere)`

---

## 5. Key Screens

**Login & Role Landing** — single login, branch + role detected automatically. Employee lands straight on the POS (zero clicks to start selling). Manager lands on their EOD dashboard. Executive lands on the Command Center.

**POS Terminal** — three deliberately different layouts, same underlying logic:
- *Danielito's:* a ticket rail down the right side (like a kitchen chit), courses grouped, modifiers as elegant text toggles, ivory/brass palette.
- *Malaya's Cafe:* a big-tile quick-order grid (menu-board feel), category tabs across the top, sage/honey palette, built for speed.
- *D' Bar:* tab-based (open tabs as cards), pour amounts entered in ml/oz with a numeric keypad, aubergine/copper, dark by default for low-light service.

**Inventory Count & Recipe Deduction View** — shows expected vs. counted stock per ingredient, auto-filled from today's sales deductions, variance highlighted in the branch's alert color.

**Log Loss/Defect** — a fast drawer/modal: item, quantity, reason (spoilage / breakage / comp / prep error), optional photo. Two taps or less.

**Manager EOD Dashboard** — top: revenue, COGS, loss, margin as four cards. Below: sales-by-product table, loss log, attendance summary for the day. Command-navy shell with the branch's Brand Thread as an accent.

**Executive Command Center** — three-column comparison (one column per brand, each tagged with its Brand Thread color), consolidated totals up top, tap into any brand for its full manager view.

**Malaya AI Panel** — persistent right-hand drawer/chat, available from any Manager or Executive screen. Plain-language input, responses can render as text, a small inline chart, or a "here's what changed" card. Suggested prompts shown when idle (e.g., "Compare this week to last week").

**Trend Analysis** — a seasonality heatmap calendar (month × product) plus a ranked list of rising/declining items, each with a one-line AI-generated suggestion ("Push ube cake — trending up 34% into December").

**HR Attendance & Flags** — a roster with a lateness/absence indicator per employee (dot, not a number, to avoid feeling punitive at a glance), flags surface as cards with the pattern described in plain language.

**Branch Newsfeed** — a chronological feed, each item color-tagged by branch, filterable by type (expiry, low-stock, HR, general). Executives see all branches merged; employees/managers see only their own.

---

## 6. Interaction Patterns

- **Sync status** — a small, calm dot (not a spinner) in the header: synced / syncing / offline-queued.
- **Notifications** — badge counts on Newsfeed and HR icons; nothing interrupts an active POS transaction.
- **Data viz** — line charts for trend-over-time, calendar heatmap for seasonality, radial gauge for margin %, stacked bars for brand comparison. No pie charts (poor for 3-way comparison).
- **Empty/error states** — written in the interface's voice, specific and actionable: "No losses logged today" (not "No data"), "Sync paused — reconnecting" (not "Error").
- **Voice** — active, plain, consistent: a button that says "Log loss" produces a confirmation that says "Loss logged."

---

## 7. Responsive Strategy

| Breakpoint | Target | Notes |
|---|---|---|
| ≥1280px | Manager/Exec desktop | Full multi-column dashboards, Malaya panel docked open |
| 768–1279px | POS tablets, manager floor tablet | Large touch targets (min 44px), single-focus screens |
| <768px | Executive mobile glance | Command Center collapses to a swipeable card per branch, Malaya panel becomes a full-screen sheet |

---

## 8. Detailed Build Prompt

Copy the block below into a UI generation tool (Lovable, v0, Bolt, or similar) or hand it to a frontend developer as a build spec.

```
Build a multi-tenant web platform for "Saint Michael Food Corp," a restaurant
group with three branches: Danielito's Home Kitchen (fine dining), Malaya's
Cafe (cafe/pastry), and D' Bar (bar). The platform combines a point-of-sale
system, recipe-based inventory tracking, role-based dashboards, and an AI
analyst named "Malaya."

USERS & ROLES
- Employee: works one branch, operates the POS, logs inventory counts and
  loss/defect events, clocks in/out. Zero-friction access to the POS is the
  top priority.
- Manager: oversees one branch. Sees end-of-day sales, inventory
  consumption, loss-to-profit margin, staff attendance, and approves counts.
- Executive: sees all three branches side by side, has full access to the
  Malaya AI panel, trend analysis, and corp-wide HR flags.

CORE LOGIC TO REFLECT IN THE UI
Every POS sale is matched to a recipe (bill of materials) and automatically
deducts ingredient quantities from that branch's inventory. Losses
(spoilage, breakage, comps, prep errors) are logged separately. At day's
end the system produces: units sold, revenue, cost of goods sold, losses,
and loss-to-profit margin = (Revenue - COGS - Losses) / Revenue. Make this
cause-and-effect visible in the UI wherever relevant (e.g., an inventory
screen that visibly ties a stock change back to specific sales).

DESIGN SYSTEM — four coordinated identities, not one generic theme

1. Corporate Shell ("Command Navy") — used for ALL Manager and Executive
   screens, tables, charts, and navigation chrome.
   Colors: ink #13203A, navy #1B2A4A (primary), cyan #2E8B99 (actions/
   links/active states), brass gold #B8860B (positive metrics/highlights),
   cloud #F4F6F9 (background), slate #2B2F36 (body text).
   Type: Space Grotesk (semibold) for headings, Inter for body, IBM Plex
   Mono for numeric data (currency, percentages, timestamps).

2. Danielito's Home Kitchen POS ("Bottle & Brass") — fine dining.
   Colors: bottle green #1F2E28, ivory linen #F3EEE2, brass #C9A24B,
   oxblood #6B2E2E for alerts/86'd items.
   Type: Fraunces (warm serif) for dish names and headers, Public Sans for
   body/tickets. Layout: a ticket-rail POS — courses grouped, modifiers as
   elegant text toggles, unhurried spacing, low information density.

3. Malaya's Cafe POS ("Sage & Honey") — cafe and pastry.
   Colors: sage #6E8368, warm oat #EFE6D4, honey #D9A441, espresso
   #3C2E26.
   Type: Fredoka (rounded display, used with restraint) for category
   headers, Karla for body. Layout: a big-tile quick-order grid, category
   tabs across the top, optimized for speed and high transaction volume.

4. D' Bar POS ("Aubergine & Copper") — bar.
   Colors: aubergine #241726 (dark background, default), copper #B5651D,
   garnet #7A2E3B for alerts, bone #E9E2D9 text.
   Type: Oswald (condensed) for headers, JetBrains Mono for tab numbers
   and pour measurements (ml/oz). Layout: open tabs as cards, numeric
   keypad for pour entry, dark-mode by default for low-light service.

SIGNATURE ELEMENT — "Brand Thread": on every Executive or cross-branch
screen, tag every card, table row, and chip with a 4px colored left-border
matching that item's brand (bottle green / sage / aubergine-copper). This
is the primary way users distinguish branches at a glance — do not use
numbered badges (01/02/03) or generic icons for this purpose.

SITEMAP / SCREENS TO BUILD
1. Login + automatic role/branch routing
2. POS Terminal — build all three branch variants described above, sharing
   the same order/checkout logic underneath
3. Inventory Count & Recipe Deduction view — expected vs. counted stock,
   variance highlighted in the branch's alert color
4. Log Loss/Defect — fast modal/drawer: item, quantity, reason (spoilage/
   breakage/comp/prep error), optional photo, 2 taps max
5. Manager EOD Dashboard — 4 top-line metric cards (revenue, COGS, loss,
   margin), sales-by-product table, loss log, daily attendance summary,
   themed in Command Navy with that branch's Brand Thread accent
6. Executive Command Center — 3-column brand comparison (each column
   tagged with its Brand Thread color) + consolidated corporate totals,
   click into any column for that branch's full Manager view
7. Malaya AI Panel — persistent right-side drawer/chat available from every
   Manager/Executive screen, plain-language input, responses can include
   inline mini-charts or "what changed" cards, shows suggested prompts
   when idle
8. Trend Analysis — month × product seasonality heatmap calendar + a
   ranked list of rising/declining products, each with a one-line
   AI-generated suggestion
9. HR Attendance & Flags — staff roster with a status dot (not a raw
   number) for lateness/absence patterns; flags render as plain-language
   cards, not tables of codes
10. Branch Newsfeed — chronological, color-tagged by branch, filterable by
    type (expiry, low-stock, HR, general); Executive view merges all
    branches, Employee/Manager view shows only their own

COMPONENTS & PATTERNS
- Sync status indicator: calm dot in the header (synced / syncing /
  offline-queued) — never a blocking spinner
- Charts: line charts for trend-over-time, calendar heatmap for
  seasonality, radial gauge for margin %, stacked bars for brand
  comparison. Do not use pie charts.
- Empty and error states are written in-voice and specific: "No losses
  logged today," "Sync paused — reconnecting" — never generic "No data" or
  "Error occurred"
- Button/action language stays consistent end-to-end: a "Log loss" button
  produces a "Loss logged" confirmation, never a different verb

RESPONSIVE RULES
- ≥1280px: full multi-column dashboards, Malaya panel docked open
- 768–1279px: POS tablets and manager floor tablet, minimum 44px touch
  targets, one focused task per screen
- <768px: Executive mobile view — Command Center becomes a swipeable card
  per branch, Malaya panel becomes a full-screen sheet

TECH NOTES (if generating code)
React + Tailwind CSS, component library in the shadcn/ui style, Recharts
for charts. Keep the three POS themes as swappable design-token sets, not
copy-pasted components, so branch styling stays maintainable from one
underlying POS engine.

WHAT TO AVOID
- Do not default to a cream background with a terracotta/clay accent
- Do not default to a pure near-black background with a single neon accent
- Do not use a broadsheet/hairline-rule newspaper layout
- Do not use lorem ipsum — use real menu-style example content (e.g., a
  matcha latte recipe: 2g matcha, 3g liquid sugar) so the recipe-to-
  inventory logic is legible in the mockup
- Do not make the three POS variants reskins of the same layout — the
  layout structure itself should differ per branch, as specified above
```
