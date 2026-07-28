# Courtime — Canonical Product & Build Spec

> **This is the single source of truth for building Courtime.** It is written so that a fresh
> agent session with zero conversation history can build the MVP in one shot from this document
> alone. When product decisions change, change them HERE first.

- **App name:** Courtime (Court + time). Repo folder stays `CoreTime`; all user-facing branding says
  **Courtime**.
- **One-line pitch:** the club's paper schedule book, on every phone.
- **First deployment:** Sea Island Club (Alex's club), free tier, pilot framing in §2 and §10.
- **Sibling projects (do NOT merge with):** Breakpoint (`AIOS Agent SaaS` repo — full club operating
  system, the upgrade path; its vision import pipeline is the porting source), DrawGen (tournaments).

---

## 1. The problem (and the pain, precisely)

Clubs like Sea Island run their entire court/lesson operation out of one handwritten paper book at
the front desk. The pain, ranked by who feels it:

1. **The schedule exists in exactly one copy, in one place, in handwriting.** Pros can't see their
   day without calling the desk or driving in. Tens of calls per day are schedule questions.
2. **Changes don't propagate.** A member calls, the desk erases and rewrites; every pro affected
   finds out late, or at the gate, or never. The desk absorbs the interruptions both directions.
3. **Leadership has zero remote visibility.** The director can't see utilization, load, or today's
   reality without walking to the desk.
4. **Single point of failure.** One damaged/lost/misread page and the club runs blind. There is no
   backup and no audit trail.

Courtime removes 1–3 without asking anyone to change how they work on day one (see §10 pilot).
It is NOT a booking platform, member app, or payment system — that's Breakpoint's territory.

## 2. Product principles

- **Paper is a habit, not the enemy.** During pilot, paper stays the source of truth; Courtime
  mirrors it. Post-cutover, Courtime can PRINT the daily page in a familiar layout — paper becomes
  an output, not the source.
- **100% verified, not 100% AI.** Nothing enters the calendar without a human confirming it. The AI
  does the typing; a person does the vouching. The review step is never automated away.
- **Free tier must fulfill the core promise completely** (capture + see + stay current). Paid tier
  sells automation on top of the habit, never the habit itself.
- **Two design languages, one app.** Desk = dense, keyboard-first desktop grid. Pro = thumb-first
  mobile list. Professional and calm, never "AI slop" (see §8 design system).

## 3. Users & roles

| Role | Who | Can |
|---|---|---|
| `admin` | Director / Alex | Everything: settings, members, courts, billing later |
| `staff` | Front desk operators | Create/edit/delete entries, run imports, print day sheet |
| `pro` | Coaches (e.g. Alex, Danny) | Read own schedule; optional org-wide read; manage own notification prefs |

One club = one `org`. Multi-club per user is supported by the data model (memberships) but has no UI
in MVP.

## 4. Surfaces

### 4.1 Desk app (`/desk`) — desktop/tablet browser
- **Day grid:** time rows (configurable day window, 30-min granularity) × court columns. Mirrors
  the paper page visually.
- **Entry editing:** click cell → inline quick-entry (`Danny — Private (R. Hayes)` free text +
  optional structured pro picker + duration). Drag to extend; right-click or hover menu: edit,
  move, delete.
- **Keyboard navigation (non-negotiable, this is the desk's speed story):**
  - `Ctrl+K` command palette: type `nov 12`, `next tuesday`, `today` → jump. (Pro tier later: same
    box accepts natural-language agent queries.)
  - `←/→` previous/next day, `Shift+←/→` week jump, `T` today.
  - Type directly into focused cell to create an entry; `Esc` cancels, `Enter` commits.
- **Print day sheet:** `Ctrl+P` / button → clean printable layout of the day grid (close to the
  paper book's format). This is a first-class feature, not an afterthought (see §2).
- **Live updates:** poll every 30s; show a subtle "updated Xs ago" indicator.

### 4.2 Pro app (`/me`) — mobile-first PWA
- **My day / My week:** list of the signed-in pro's entries (time, what, court). Google-Calendar-ish
  list density. Read-only in MVP.
- **Optional full-club view** (`/me/club`, permission-gated per org setting).
- **PWA:** installable (manifest + service worker), works from home screen. **Web push** for change
  alerts: "Your 3:00 PM moved to Court 2." iOS caveat: push requires add-to-home-screen first —
  onboarding flow must walk the pro through install (one-time, ~10s).
- **Basic change alerts are FREE tier** (the "always current" promise). Smart digests/rules are paid.

### 4.3 Importer (`/desk/import`) — the migration weapon
- **Batch upload:** drag/select many photos at once (phone gallery or desktop). Creates an
  `import_batch` with N `import_pages`.
- **Queue:** server processes pages sequentially/parallel (limit ~3 concurrent), status per page:
  `queued → extracting → verifying → needs_review → confirmed | failed`.
- **Extraction pipeline (ported from Breakpoint `server/schedule-import.mjs`):**
  - Vision call: page photo + date hint + org's court/hours config → structured JSON entries.
    Model: `OPENAI_VISION_MODEL` (default `gpt-5.6-luna`, $1/M in, $6/M out); per-batch override to
    `gpt-5.6-sol`/`terra` for dense pages. Keep the pricing table + per-request cost telemetry.
  - Domain constraints in prompt: 30-min grid snapping, hour clinics, coachless courts allowed,
    known pro-name roster passed in for name normalization.
  - **Verification pass (new vs Breakpoint):** second cheap call critiques the extraction —
    grid violations, double-booked pros, court/time out of range → per-cell confidence flags.
  - Provider-agnostic adapter so a Gemini bake-off is a config change, not a rewrite. (Planned
    bake-off: same 5 real pages through luna/sol/gemini, count wrong cells, pick default.)
- **Review screen (the trust anchor):** photo on left, parsed grid on right, low-confidence cells
  highlighted; tap-to-fix; nothing publishes until confirmed. Every published entry keeps
  `source_page_id` → tap any entry later to see the original paper photo (audit trail).

### 4.4 Landing page — separate static build (`landing/` in repo, deploys independently)
- Level of finish: match the AIOS Agency site's professionalism, plus more motion: hero concept =
  a handwritten paper schedule page morphing into the digital grid (that IS the product story),
  scroll-triggered sections, tasteful 3D accents. Built LAST (needs real screenshots).
- Sections: hero, the 3-step story (photograph → verify → every phone), pro-view showcase,
  free vs pro pricing, FAQ (incl. "do we have to stop using paper?" → No), CTA.

## 5. Migration playbook (Sea Island, generalizes to any club)

1. **Archive session (one weekend, Alex does it, free):** photograph every future page of the paper
   book (~40 min for ~160 pages), batch-import **back-to-front** (sparse far-future pages first,
   volatile near-term pages last, right before pilot start). Review everything. Est. API cost
   $5–8 (sol for ~20 dense pages, luna for the rest).
2. **Sticky-tab protocol:** from archive day, the desk clips a sticky tab on any FUTURE page they
   write on; Alex re-photographs flagged pages weekly. Today/this-week changes are covered by the
   daily re-snap below.
3. **Shadow month (paper = source of truth, ~4 weeks):** each morning (+ midday re-snap), the day's
   page is photographed and published after review. Pros get read-only phone view + change alerts.
   Nobody at the club changes anything. Success metric: pros check phones daily; schedule calls to
   the desk drop.
4. **Pull phase:** pros asking "is the app updated?" creates desk-side demand; desk starts entering
   changes directly because it's less work than fielding calls.
5. **Cutover Monday:** app becomes source of truth; desk prints the day sheet; book becomes archive.
   Never announced as a migration — it's just the day paper became downstream.

## 6. System architecture

- **Stack (mirror Breakpoint's, nothing new to operate):** React 18 + Vite + TypeScript frontend;
  Node API server (Express-style, `server/` dir); Postgres on Neon via Drizzle ORM + migrations;
  Clerk auth feature-flagged on `VITE_CLERK_PUBLISHABLE_KEY` (absent → anonymous dev workspace mode,
  same pattern as Breakpoint); deploy on Vercel.
- **Vercel dual-router discipline (learned the hard way on Breakpoint):** every `/api/*` route must
  be registered in BOTH the dev server entry AND the prod catch-all (`api/index.js`) or it 404s in
  prod only.
- **Repo layout:**
  ```
  CoreTime/
    src/            # app frontend (desk + pro route groups)
    server/         # API, db schema/migrations, import pipeline
    landing/        # separate static landing site
    docs/SPEC.md    # this file
  ```
- **Realtime:** polling (30s desk, 60s pro). No websockets in MVP — not earned yet.
- **Push:** standard Web Push (VAPID keys env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), service
  worker in pro PWA; subscription rows per user+device.
- **Env vars:** `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `OPENAI_VISION_REASONING_EFFORT`,
  `VITE_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` (optional in dev), VAPID pair.
- **Dev ports:** frontend 5183, API 5184 (`npm run dev:all`).

### 6.1 Data model (Drizzle/Postgres)

- `orgs` — id, name, slug, day_start, day_end, settings jsonb (e.g. pros_can_see_club)
- `courts` — id, org_id, name, sort_order, active
- `users` — id, clerk_id nullable, email, display_name
- `memberships` — user_id, org_id, role (`admin|staff|pro`), pro_color nullable
- `entries` — id, org_id, court_id, date, start_min, end_min (minutes-from-midnight, 30-min snapped),
  pro_user_id nullable, label text, notes nullable, source (`manual|import|print`), source_page_id
  nullable, created_by, updated_at. Index (org_id, date).
- `import_batches` — id, org_id, created_by, status, model, totals jsonb (pages, cost_usd, tokens)
- `import_pages` — id, batch_id, photo_url (blob storage or db bytea in MVP), date_hint nullable,
  status, extraction jsonb, verification jsonb (per-cell confidence), cost jsonb, error nullable
- `entry_changes` — id, entry_id, org_id, change_type (`created|moved|edited|deleted`), before jsonb,
  after jsonb, at, by — feeds change alerts + audit
- `push_subscriptions` — id, user_id, endpoint, keys jsonb, created_at

### 6.2 API routes (register in BOTH routers)

- `GET/POST/PATCH/DELETE /api/entries` (query: org, date range; mutations write `entry_changes`)
- `GET /api/day?date=` (grid payload: courts + entries + last_updated)
- `POST /api/imports` (create batch, upload pages) / `GET /api/imports/:id` (status) /
  `POST /api/imports/:id/pages/:pageId/confirm` (publish reviewed entries)
- `GET/POST /api/orgs`, `/api/courts`, `/api/members` (+ invite: `POST /api/members/invite`)
- `POST /api/push/subscribe`, change-alert fanout job on entry mutation
- `GET /api/me/schedule?range=` (pro view payload)

## 7. Pricing (build the gates, not the billing, in MVP)

| | Free | Pro (~$19/club/month, flat per org — NEVER per seat) |
|---|---|---|
| Capture, grid, palette, print | ✅ | ✅ |
| Photo import | ✅ (fair monthly cap) | ✅ higher cap |
| Unlimited pros, my-day PWA | ✅ | ✅ |
| Basic change push alerts | ✅ | ✅ |
| Smart notifications (digests, rules, client-facing) | — | ✅ |
| AI agent (read-write chat over calendar, in palette) | — | ✅ |
| Extended analytics (utilization heatmaps, pro load, trends — Breakpoint-style insight surface) | rudimentary strip only | ✅ |
| Payroll/hours export (CSV per pro per period) | — | ✅ (likely #1 closer) |

MVP implements the FREE column only, plus a `plan` field on orgs and UI affordances (locked pro
features visible but gated) so the upsell surface exists from day one. Stripe comes later.

## 8. Design system ("professional, never AI slop")

- **Tone:** calm operational software. References: Linear's restraint, Notion's warmth. No gradients
  soup, no glassmorphism, no emoji in UI chrome.
- **Type:** one family (Inter or similar), tabular numerals for times, 13–14px data density on desk,
  16px+ on pro mobile.
- **Color:** near-black ink `#101418`, warm gray wash background, ONE brand accent (court green
  family, current `--accent: #0e7a5f`), pro-color chips for coaches. Light mode first; dark later.
- **Grid aesthetics:** hairline borders, generous row height, entries as quiet rounded chips —
  the paper book redrawn by a careful typographer, recognizable to the front desk.
- **Motion:** 150–200ms ease transitions only where state changes (cell commit, day flip). Landing
  page is where motion gets to show off; the app stays quiet.

## 9. MVP build order (one-shot checklist)

1. Rename branding to Courtime everywhere (folder stays `CoreTime`)
2. Server: db schema + migrations, org/court/member/entry CRUD, dev seed (Sea Island courts + demo pros)
3. Desk app: day grid, inline entry editing, keyboard nav + `Ctrl+K` palette, print day sheet, polling
4. Importer: batch upload → queue → extraction (ported pipeline + verification pass + telemetry) →
   side-by-side review → confirm/publish; audit-trail link photo↔entries
5. Pro PWA: my day/week, install flow, web push change alerts (fanout from `entry_changes`)
6. Auth + roles + invites (Clerk-flagged, anonymous dev mode)
7. Landing page (`landing/`)
8. Verification gate: `npm run build` green; manual smoke of the §10 pilot loop end-to-end

**Definition of done for MVP:** Alex can photograph a real Sea Island page, import-review-publish it
in under 5 minutes, Danny sees his correct hours on his phone within a minute, and moving an entry
at the desk pushes a change alert to Danny's phone.

## 10. Sea Island pilot — the director framing (see also §5)

**The pitch is risk-removal, not change:**

> "Nothing about how anyone works changes. The paper book stays exactly where it is and stays the
> official schedule. I photograph the page each morning — that's the whole intervention. Your pros
> see their day on their phones and stop calling the desk about it. It's free, and I run it. If
> after a month you don't like it, we stop, and you've lost nothing — you actually GAINED a photo
> backup of your entire book for the first time."

- Pain hooks per stakeholder: **director** — remote visibility + backup/audit of the book;
  **front desk** — fewer interruption calls, no behavior change asked; **pros** — their day in
  their pocket, told when it changes.
- Explicit testing month: paper = source of truth for 4 weeks minimum (§5 shadow month). Success
  = pros check daily + desk call volume drops; only then discuss entering changes directly.
- Never lead with "AI." Lead with "your schedule, on every phone, always current." The AI is
  plumbing.

## 11. v2 backlog (do NOT build in MVP)

Agent in palette (read-write) · smart notifications · analytics surface · payroll export ·
Stripe billing + plan enforcement · Gemini bake-off automation · batch re-snap diffing (detect
what changed on a re-photographed page) · desk edit from mobile · multi-club UI · dark mode.
