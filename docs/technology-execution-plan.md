# Technology & Execution Plan — Saint Michael Food Corp System

*Built on what Varix already runs, not a from-scratch stack*

The original proposal recommended a generic React/Node/PostgreSQL stack. This version replaces that with the tools Varix has already shipped and proven across Tessora, eBALIK, the MPI RAG thesis, and the SSA platform — lower risk, faster to build, and mostly running on infrastructure that's already paid for (or free-tier).

---

## 1. What We Already Have

| Asset | Proven in | Reused here for |
|---|---|---|
| **Tauri** (Rust + webview desktop shell) | Tessora | The POS terminal itself — a lightweight, installable app per branch |
| **SQLite** (local-first storage) | Tessora | Local order/inventory cache on each POS terminal — keeps selling during a dropped connection |
| **Groq API** (fast LLM inference) | Tessora | Powers Malaya's natural-language answers and trend narration |
| **ChromaDB + BAAI/bge-m3 embeddings** | Tessora, MPI RAG thesis | Malaya's retrieval layer — lets her search sales/inventory/HR history semantically instead of running rigid fixed queries |
| **FastAPI** | MPI RAG thesis | Central backend API |
| **Flask + Socket.IO** (real-time push pattern) | eBALIK | Same live-update pattern, reused for POS → dashboard sync |
| **Supabase** (Postgres + Auth + Realtime + Storage) | SSA platform plan | Central database, role-based login, and live dashboard updates |
| **GitHub → Vercel CI/CD** (push-to-deploy) | SSA platform | Version control for the dashboard codebase; every push to `main` auto-deploys, every branch/PR gets a preview URL |
| **Laravel** | SSA platform | Available as an alternative CRUD backend if the team prefers PHP for admin-style screens |
| **n8n** | Varix's core specialty, SSA platform | The automation layer — expiry alerts, low-stock pings, HR flags, EOD digest emails |
| **Oracle Cloud Always Free ARM VM** | SSA platform | Hosts the backend + n8n at zero infrastructure cost |
| **Vercel / Netlify** | SSA platform | Hosts the Manager/Executive web dashboards |
| **Zoho Mail (varixph.com) + Slack channels** | Varix ops | Delivery channels for automated alerts and the daily digest |
| **iOS development capability** | Varix specialty | An Executive companion app for on-the-go glances and Malaya chat |
| **Arduino / RFID / sensor integration** | eBALIK | Optional future hardware layer — see §6 |

Nothing here is a stretch. Every piece has already shipped in a Varix project this year.

---

## 2. Architecture, Mapped to This Stack

**Client layer**
- **POS Terminal (per branch):** Tauri desktop app, same shell pattern as Tessora. Ships one binary per branch with that branch's theme (from the UI/UX plan) baked in as a config flag, not three separate codebases. SQLite holds a rolling local cache of orders, recipes, and current stock so the counter never stops selling if the connection drops — syncs to Supabase the moment it's back.
- **Manager / Executive Dashboard:** React web app, deployed on Vercel, same deployment pattern as the SSA site.
- **Executive Mobile Companion:** native iOS app — glance-view metrics plus a Malaya chat screen. Optional for MVP, natural Phase 5 addition given Varix already builds iOS.

**Backend / API layer**
- **FastAPI**, hosted on the Oracle Always Free VM. Chosen over Laravel here because it sits naturally next to the Python-based AI pipeline (Groq + ChromaDB) already used in Tessora and the thesis — one language across API and AI logic instead of two.
- **Real-time sync:** Supabase Realtime (Postgres change streams) handles most live-update needs out of the box. Socket.IO — the exact pattern proven in eBALIK for pushing hardware-state changes to a dashboard — is kept in reserve for anything Supabase's realtime can't cover cleanly (e.g. POS-terminal-to-POS-terminal state like a shared bar tab).

**Data layer**
- **Supabase Postgres** — the single source of truth across all three branches. Supabase Auth + Row-Level Security maps directly onto the Employee/Manager/Executive role structure: a manager's RLS policy scopes them to their branch, an executive's policy opens all three.
- **SQLite** — per-terminal offline cache (Tessora pattern).
- **ChromaDB** — holds embedded daily summaries, product history, and HR patterns so Malaya can retrieve relevant context instead of trying to reason over raw tables.
- **Supabase Storage** — photos attached to loss/defect logs.

**AI layer — Malaya**
- **Groq** for inference — the same choice made for Tessora, and the right one here too: see §4 on why this beats self-hosting a model.
- **Retrieval pattern:** BAAI/bge-m3 embeddings into ChromaDB (identical to the thesis pipeline), retrieved and handed to Groq as context for natural-language Q&A.
- **Trend analysis & HR flagging are hybrid, not pure-LLM:** scheduled jobs compute the actual seasonality stats and attendance-pattern math deterministically (reliable, auditable), and Malaya's job is to *narrate* those computed results in plain language — not to do the arithmetic herself. This avoids the classic failure mode of asking an LLM to silently miscalculate a margin.

**Automation layer — n8n**
Running on the same Oracle VM, this is where the "glue" logic lives instead of being buried in custom backend code:
- Ingredient nearing expiry → posts to that branch's Newsfeed + Slack channel + Zoho Mail alert
- Stock crossing reorder threshold → notifies the branch manager
- HR pattern flag triggered → notifies manager and executive dashboards
- End of day → compiles and emails the daily digest to relevant roles

This also matches how Varix already runs its own ops (Slack channel structure, `hello@ / vince@ / neil@ / projects@ / support@` on Zoho Mail) — the same rails get reused for the product itself.

**Hosting layer**
- Oracle Always Free ARM VM: FastAPI backend + n8n (start on one instance; Oracle's Always Free tier permits a second ARM VM under the same account if the first gets tight — see §5).
- Vercel: dashboard frontend, deployed straight from GitHub — same push-to-deploy flow already used for the SSA site. Main branch auto-deploys to production; feature branches get their own preview URL, so each dashboard screen (POS variants, Executive Command Center, etc.) can be reviewed live before merging.
- Supabase: managed Postgres/Auth/Storage, free tier to start.

---

## 3. Execution Roadmap, Tied to Real Tech

| Phase | Focus | What gets built |
|---|---|---|
| **1** | Pilot — Malaya's Cafe | Tauri POS shell + SQLite cache, FastAPI backend, Supabase schema (products, recipes, inventory, transactions), core recipe-deduction logic. No AI yet — prove the sale-to-inventory loop works cleanly on one branch. |
| **2** | Branch dashboards | React manager dashboard, Supabase Realtime wiring, EOD summary + loss-to-profit margin calculation, loss/defect logging UI. |
| **3** | Multi-branch rollout | Danielito's and D' Bar Tauri POS variants (themed per the UI/UX plan), Executive web dashboard, RLS policies for cross-branch access, Oracle VM scaled if needed. |
| **4** | Malaya goes live | ChromaDB + bge-m3 embedding pipeline, Groq-backed natural-language Q&A, trend analysis (deterministic stats + AI narration). |
| **5** | Automation + mobile | n8n workflows for newsfeed/alerts/HR flags, iOS executive companion app, daily digest emails. |

Same five phases as the business proposal — this table just makes each one concrete in terms of what actually gets opened in an editor.

---

## 4. A Note on the GPU

Your dev machine (Ryzen 5 PRO 3400G, 24GB RAM, GTX 1050 Ti — 4GB VRAM) is plenty for Tauri builds, running ChromaDB locally, and general development. It is **not** enough to self-host a production LLM the way the thesis did with Ollama + llama3.2:3b — that setup was fine for a single-laptop defense demo, but three branches querying Malaya simultaneously in production needs inference that doesn't compete with your own dev workload or choke on 4GB VRAM. Groq's hosted inference sidesteps this entirely and is already the proven choice in Tessora — no reason to introduce a second, weaker pattern here.

---

## 5. Things Worth Watching

- **Oracle Always Free capacity — update:** Oracle cut the Always Free Ampere A1 (ARM) allocation in June 2026, from 4 OCPU/24GB down to a **2 OCPU / 12GB pool shared across all Ampere A1 instances in the account** — it's no longer possible to just spin up a second free VM to double capacity, since the cap applies to the total, not per-instance. Budget for the backend + n8n to share that single 2 OCPU/12GB pool. If it gets tight, the next step is paying for the extra Ampere A1 capacity directly (roughly $25–28/month for a full 4 OCPU/24GB at Oracle's current Arm rates) rather than assuming a second free instance will help.
- **RLS policy correctness matters more than usual here:** since Employee/Manager/Executive access is enforced at the Supabase Postgres level, a misconfigured policy is a data-leak risk between branches, not just a UI bug. Worth a dedicated test pass before Phase 3 rollout.
- **Offline sync conflicts:** with SQLite caching orders locally per terminal, define a clear conflict-resolution rule (e.g. last-write-wins vs. queued-in-order) before D' Bar goes live — bar tabs opened offline are the likeliest place for this to bite.

---

## 6. Net-New Work (nothing to reuse here)

- Recipe/BOM engine and the sale → deduction logic itself
- The three branded POS UI variants (from the UI/UX plan)
- Loss/defect schema and logging flow
- Trend-analysis rule engine and Malaya's narration prompts
- HR flagging thresholds and pattern-detection logic
- **Optional, later:** physical automation using the Arduino/RFID skills proven in eBALIK — e.g. RFID-tagged stockroom counts or bar pour sensors feeding inventory directly, removing manual counts entirely. Not needed for MVP, but a natural extension once the software layer is stable.
