# Courtime — Canonical Product & Build Spec

> **This is the single source of truth for building Courtime.** It is written so that a fresh
> agent session with zero conversation history can build the working end-to-end MVP in one shot
> from this document alone. When product decisions change, change them HERE first.

- **App name:** Courtime (Court + time). Repo folder: `Courtime`.
- **One-line pitch:** the club's paper schedule book, on every phone.
- **First deployment:** Sea Island Club (Alex's club), free tier, pilot framing in §2 and §10.
- **Backend platform decision (firm):** **Convex** for database, server functions, file storage,
  scheduling, AND auth (Convex Auth). No Supabase, no Neon, no separate Postgres, no paid Clerk
  seat. Anything Convex can do, Convex does. Frontend hosts on Vercel; Convex cloud free tier
  carries the pilot.
- **Sibling projects (do NOT merge with):** Breakpoint (`AIOS Agent SaaS` repo — full club operating
  system, the upgrade path; its vision import prompt/logic is the porting source), DrawGen
  (tournaments).

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

### 4.0 Onboarding (`/` when signed in without a club) — every club, not just Sea Island

Courtime is built as a standard multi-tenant SaaS from the first commit; Sea Island is simply the
first tenant. A new account lands in a three-step wizard, and nothing it asks for is permanent:

1. **The club** — name, and the hours the day starts and ends (these become the first and last row
   of the grid).
2. **The courts** — "how many courts?" generates `Court 1…N`, each name editable inline, because
   real clubs have a "Stadium" and a "Har-Tru 3".
3. **The coaches** — name plus optional email per coach, added as chips. An email means they can
   sign in and claim their own seat; no email means invite them later from Settings.

One `createClub` mutation writes the org, courts and memberships in a single transaction, so a
half-built club cannot exist. The creator becomes `admin`. New clubs start on the Pro plan so the
whole product is visible; Settings switches tiers freely.

### 4.05 Tempo, the assistant (Pro) — a dock on every signed-in surface

A launcher sits bottom-right; clicking it raises a panel out of that corner. **Tempo** is Courtime's
own character — the Courtime mark (a rounded court with a net) given eyes and a clock hand, so it
reads as "the thing that keeps the club's time". It shares nothing with Breakpoint's Ace.

- **Real tools, not a chat veneer.** `list_bookings`, `find_open_slots`, `coach_hours` for reading;
  `create_booking`, `move_booking`, `cancel_booking` for writing. Every tool runs through the same
  internal mutations the UI uses, so double-booking rejection, the `entryChanges` audit row and the
  coach's push alert all fire identically whether a human or Tempo made the change.
- **Role-scoped at the source.** A coach's request never even receives the write tools, and
  `list_bookings` is filtered to their own column. This is enforced server-side, not by asking the
  model nicely.
- **Pro-gated** in `agent.availability`, so the launcher does not render at all on Free.
- **Two doors, one room.** The dock carries the launcher *and* a microphone button, and `A` / `V`
  reach them from anywhere. Voice and text are the same thread and the same tools — typing during a
  call routes into the realtime session rather than starting a second, deaf assistant.
- **Tempo never speaks first.** A call opens silent and listening; being spoken at the moment a line
  connects is startling, and it makes the assistant feel like it wants something. The panel is what
  says the microphone is live ("Go ahead — I'm listening"), not Tempo.
- Conversation lives in client state and is passed back each turn (last 12 messages) — no threads
  table in v1.
- Implementation note: this model family rejects function tools unless `reasoning_effort` is
  `"none"` on `/v1/chat/completions`. The vision importer keeps `"low"` because it sends no tools.

### 4.1 Desk app (`/desk`) — desktop/tablet browser
- **Day grid:** time rows (configurable day window, 30-min granularity) × court columns. Mirrors
  the paper page visually.
- **Entry editing:** click cell → inline quick-entry (`Danny — Private (R. Hayes)` free text +
  optional structured pro picker + duration). Drag to extend; hover menu: edit, move, delete.
- **Keyboard navigation (non-negotiable, this is the desk's speed story):**
  - `Ctrl+K` command palette: type `nov 12`, `next tuesday`, `today` → jump. (Pro tier later: same
    box accepts natural-language agent queries.)
  - `←/→` previous/next day, `Shift+←/→` week jump, `T` today.
  - Bare letters for the things the desk does all shift: `G` court grid, `C` clinic sheet, `N` day
    notes, `P` print, `I` import, `R` insights, `S` settings, `A`/`V` Tempo, `?` the whole list.
  - Type directly into focused cell to create an entry; `Esc` cancels, `Enter` commits.
  - **One list, three renderings.** `src/desk/shortcuts.ts` is the source of truth — the handler,
    the `?` overlay and the Settings card all read it, so a shortcut can't exist in the app without
    appearing in the list a club is told to trust. Every bare letter checks `isTypingTarget` first,
    or the desk can't type a name with a G in it.
- **Print day sheet:** `Ctrl+P` / button → clean printable layout of the day grid (close to the
  paper book's format). First-class feature, not an afterthought (see §2).
- **Live updates:** free with Convex — `useQuery` subscriptions are reactive, so the grid updates
  the moment any client mutates. No polling code. Show a subtle "live" indicator.
- **The nav stays about the club.** Schedule · Import · Insights · Settings, and nothing else. A
  director who also coaches reaches their own hours through a quiet "View as coach" switch beside
  the avatar — never a nav tab, because the club view must not be framed around one person's day.

### 4.2 Pro app (`/me`) — mobile-first PWA
- **My day / My week:** list of the signed-in pro's entries (time, what, court). Google-Calendar-ish
  list density. Read-only in MVP. Live via the same reactive queries.
- **Optional full-club view** (`/me/club`, permission-gated per org setting).
- **PWA:** installable (manifest + service worker), works from home screen. **Web push** for change
  alerts: "Your 3:00 PM moved to Court 2." iOS caveat: push requires add-to-home-screen first —
  onboarding flow must walk the pro through install (one-time, ~10s).
- **Basic change alerts are FREE tier** (the "always current" promise). Smart digests/rules are paid.

### 4.2b The book has two sides

The paper page is double-sided. The front is the court grid. **The back is the clinic sign-up
sheet** — boxed tables headed "Adult Clinic - 8 AM", "Rising Stars - 3:00pm-4:00pm", each a
numbered Name / Phone list with an NTRP rating pencilled in the left margin. Courtime models both:

- **A flip, not a tab.** The desk schedule page carries a two-option switch between **Court grid**
  and **Clinics** for the same date, with a short page-turn animation (transform + opacity only,
  no refetch, plain crossfade under `prefers-reduced-motion`). It is the same day seen from the
  other side, so the date and the day arrows carry across.
- **The roster behind a booking.** Tapping a clinic on the grid shows who is in it — for the front
  desk and for the coach on their phone. `clinicRosters` links to an entry by `entryId` when known
  and otherwise matches on start time, because the two sides of one sheet share their times.
- **Notes.** The NOTES column down the right-hand side of the paper is free text for the day
  ("Humbert would like Ct. 5", an account number). One note per date in `dayNotes`, editable by
  the desk, readable by coaches.
- **The asterisk.** A star beside a lesson on the paper means *this client asked for this pro by
  name*. Stored as `entries.requested`; `schedule.setRequested` makes it a single click, because
  the desk marks these while a member is still on the phone. Everyone sees it; only the desk sets it.
- **Drag to extend.** On the desk grid, dragging a booking's bottom edge lengthens it, snapping to
  30-minute slots and committing through the same `updateEntry` mutation (so overlaps are still
  rejected with a readable message). Coaches cannot drag — the grid is read-only for them.

### 4.3 Importer (`/desk/import`) — the migration weapon
- **Batch upload:** drag/select many photos at once (phone gallery or desktop). Photos go to Convex
  file storage via upload URLs; creates an `importBatches` doc with N `importPages` docs.
- **Queue:** a Convex action-driven pipeline processes pages (~3 concurrent via the scheduler),
  status per page: `queued → extracting → verifying → needs_review → confirmed | failed`. Status is
  reactive in the UI for free.
- **Extraction pipeline (logic ported from Breakpoint `server/schedule-import.mjs`, runs in a
  Convex `"use node"` action):**
  - Vision call: page photo + date hint + org's court/hours config → structured JSON entries.
    Model: `OPENAI_VISION_MODEL` (default `gpt-5.6-luna`, $1/M in, $6/M out); per-batch override to
    `gpt-5.6-sol`/`terra` for dense pages. Keep the pricing table + per-request cost telemetry,
    stored on the page doc.
  - Domain constraints in prompt: 30-min grid snapping, hour clinics, coachless courts allowed,
    known pro-name roster passed in for name normalization.
  - **Verification pass — deterministic, not a second model call.** Every failure that matters
    here is decidable in code: a court that does not exist at this club, a time outside the club's
    hours, a span off the 30-minute grid, two bookings claiming one court, a coach who is not on
    the staff list, or handwriting the model itself marked illegible. Code is cheaper, faster, and
    cannot hallucinate a verdict the way an LLM critic can. Each finding flags its row in the
    review UI; none of it publishes on its own.
  - Provider-agnostic adapter so a Gemini bake-off is a config change, not a rewrite. (Planned
    bake-off: same 5 real pages through luna/sol/gemini, count wrong cells, pick default.)
- **Two kinds of page, classified in the same call.** One prompt reads either face and reports
  which it read (`pageKind: "schedule" | "clinics"`); a separate classification call would double
  the cost for no accuracy. A declared kind that contradicts what actually came back (clinics but
  all sessions, or no sessions and only clinics) is overridden by the content.
- **Pairing, because a clinic sheet has no date on it.** Pages record their `uploadIndex`, and a
  clinic sheet inherits the date of the nearest court-grid page uploaded *before* it. The pairing
  is derived at read time rather than stored, so it stays correct however the pages finish
  processing, and the reviewer can always override the date. The upload screen therefore asks for
  one thing: photograph each day front then back, keeping each day together.
- **Review screen (the trust anchor):** photo on left, parsed grid on right, low-confidence cells
  highlighted; tap-to-fix; nothing publishes until confirmed. Every published entry keeps
  `sourcePageId` → tap any entry later to see the original paper photo (audit trail). A clinic
  sheet gets its own review: clinics with times, and each signed-up player with phone and rating.

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

## 6. System architecture — Convex-first

- **Stack:** React 18 + Vite + TypeScript frontend (desk + pro route groups); **Convex** for
  everything server-side: reactive database, queries/mutations, `"use node"` actions (OpenAI calls,
  web push), file storage (page photos), scheduler (import queue, alert fanout), HTTP actions if a
  webhook is ever needed. **Convex Auth** (`@convex-dev/auth`) for authentication.
- **Why this wins here specifically:** the product's core promise is "always current on every
  phone" — Convex subscriptions make every surface live with zero polling/websocket code, and the
  import queue's per-page status streams to the review UI for free.
- **Auth model:** Convex Auth with the **Password** provider (email + password). Chosen over
  email OTP because OTP needs a transactional email provider in the loop for every sign-in, which
  adds a dependency and a failure mode to the one screen that must always work — and because a
  shared front-desk machine signs in rarely and stays signed in. Roles come from `memberships`,
  enforced inside every query and mutation via `requireMembership(ctx, minRole)`; the client is
  never trusted for a role. Invited staff are stored as a membership with an email and no
  `userId`; the first sign-in with that email claims the seat (`claimPendingInvite`).
- **Demo access:** the sign-in screen seeds a demo club on demand (`seed.ensureDemo`, idempotent)
  and offers one-click entry as the front desk (admin) or as a coach (pro), so the two points of
  view can be seen without creating anything.
- **Hosting:** frontend on Vercel (static Vite build; no Vercel API routes at all — Breakpoint's
  dual-router gotcha does not apply here). Convex cloud dev + prod deployments
  (`npx convex dev` / `npx convex deploy`). Free tier is sufficient for the pilot.
- **Env/config:** Convex deployment vars (`npx convex env set`): `OPENAI_API_KEY`,
  `OPENAI_VISION_MODEL` (default `gpt-5.6-luna`), `OPENAI_VISION_REASONING_EFFORT` (default `low`),
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Frontend: `VITE_CONVEX_URL`.
- **Repo layout:**
  ```
  Courtime/
    src/            # app frontend (desk + pro route groups)
    convex/         # schema.ts, auth.ts, functions (entries, orgs, imports, push), actions
    landing/        # separate static landing site
    docs/SPEC.md    # this file
  ```
- **Dev:** `npm run dev` (Vite, port 5183) + `npx convex dev` in parallel (`npm run dev:all` wraps
  both).

### 6.1 Data model (`convex/schema.ts`)

Convex tables (documents + indexes; times stored as minutes-from-midnight, 30-min snapped; dates as
`YYYY-MM-DD` strings):

- `orgs` — name, slug, dayStartMin, dayEndMin, settings { prosCanSeeClub }, plan (`free|pro`)
- `courts` — orgId, name, sortOrder, active. Index `by_org`.
- `memberships` — userId (Convex Auth user id), orgId, role (`admin|staff|pro`), displayName,
  proColor?. Indexes `by_org`, `by_user`.
- `entries` — orgId, courtId, date, startMin, endMin, proMembershipId?, label, sessionType?, notes?,
  `requested?` (the asterisk), source (`manual|import`), sourcePageId?, updatedAt. Indexes
  `by_org_and_date`, `by_org_and_pro_and_date`, `by_source_page`.
- `clinicRosters` — orgId, date, title, startMin?, endMin?, entryId?, participants
  [{name, phone, rating, note}], sourcePageId?, updatedAt. Indexes `by_org_and_date`, `by_entry`.
- `dayNotes` — orgId, date, body, updatedAt, updatedBy?. Index `by_org_and_date`.
- `importBatches` — orgId, createdBy, status, model, totals { pages, confirmedPages, costUsd,
  inputTokens, outputTokens }. Index `by_org`.
- `importPages` — batchId, orgId, photoStorageId (Convex storage), dateHint?, status, extraction?
  (parsed entries JSON), verification? (per-cell confidence flags), cost?, error?. Index
  `by_batch`.
- `entryChanges` — orgId, entryId, changeType (`created|moved|edited|deleted`), before?, after?,
  at, byUserId. Index `by_org_at`. Feeds change alerts + audit.
- `pushSubscriptions` — userId, endpoint, keys { p256dh, auth }, createdAt. Index `by_user`.

(Convex Auth adds its own `users`/auth tables via `@convex-dev/auth` schema helpers.)

### 6.2 Server functions (`convex/`)

- **Queries (all reactive):** `day.get({orgId, date})` → courts + entries + meta;
  `me.schedule({range})`; `orgs.get`, `courts.list`, `members.list`;
  `imports.batch({batchId})` → batch + pages with statuses (review UI subscribes to this).
- **Mutations:** `entries.create/update/move/remove` (each writes `entryChanges` and schedules
  push fanout); `courts.upsert`; `members.invite` (creates pending membership keyed to email;
  first OTP sign-in claims it); `imports.createBatch` (+ storage upload URLs);
  `imports.confirmPage` (publishes reviewed entries transactionally).
- **Actions (`"use node"`):** `imports.processPage` (vision extract → verify → write results;
  scheduled per page, ~3 concurrent); `push.send` (web-push with VAPID; called from scheduler on
  entry changes).
- **Auth guard:** every function resolves the caller's membership first; `pro` role gets read-only
  scope (own entries, or org-wide if `prosCanSeeClub`).

## 7. Pricing (build the gates, not the billing, in MVP)

| | Free | Pro (~$19/club/month, flat per org — NEVER per seat) |
|---|---|---|
| Capture, grid, palette, print | ✅ | ✅ |
| Photo import | ✅ (fair monthly cap) | ✅ higher cap |
| Unlimited pros, my-day PWA | ✅ | ✅ |
| Basic change push alerts | ✅ | ✅ |
| Today-at-a-glance counts (bookings, coached hours, courts in use) | ✅ | ✅ |
| Insights: court utilisation, coach load, busiest hours over any period | — | ✅ **built** |
| Payroll/hours export (CSV per coach per period) | — | ✅ **built** (likely #1 closer) |
| **Tempo**, the assistant — natural-language read *and* write over the schedule | — | ✅ **built** |
| Smart notifications (digests, rules, client-facing) | — | roadmap |

The MVP ships the whole Free column **plus three real Pro features** — insights, the hours export,
and the assistant. That is deliberate: a paid tier made only of promises can't be demonstrated.
Smart notifications stay on the roadmap and are not advertised inside the app as though they exist.

Gating is enforced in **both** places: `schedule.range` refuses to return data when the club is on
Free, and the Insights screen renders an explanation of what Pro adds instead of a dead end.
`plan` lives on the org and an admin can switch it from Settings at any time — which doubles as
the demo affordance for seeing both tiers. Stripe comes later.

## 8. Design system ("professional, never AI slop")

- **Tone:** calm operational software. References: Linear's restraint, Notion's warmth. No gradient
  soup, no glassmorphism, no emoji in UI chrome.
- **Type:** one family (Inter or similar), tabular numerals for times, 13–14px data density on desk,
  16px+ on pro mobile.
- **Color:** near-black ink `#101418`, warm gray wash background, ONE brand accent (court green
  family, current `--accent: #0e7a5f`), pro-color chips for coaches. Light mode first; dark later.
- **Grid aesthetics:** hairline borders, generous row height, entries as quiet rounded chips —
  the paper book redrawn by a careful typographer, recognizable to the front desk.
- **Motion:** 150–200ms ease transitions only where state changes (cell commit, day flip). Landing
  page is where motion gets to show off; the app stays quiet.

## 9. One-shot build plan (end-to-end working, not a mockup)

Execute in this order; each phase ends with its own verification before moving on. Gate at the end
of every phase: `npm run build` green + the phase's smoke check passes in the browser.

1. **Foundation:** add Convex + Convex Auth to the repo (`npx convex dev` bootstraps
   `convex/`); write `schema.ts` (§6.1); OTP email sign-in wired; `npm run dev:all` script.
   *Smoke: sign in with OTP, see an authenticated shell.*
2. **Org bootstrap + seed:** org/courts/memberships functions; first-run flow creates Sea Island
   org; seed script adds courts + demo pros (Alex admin, Danny pro).
   *Smoke: fresh account lands in seeded org with correct role.*
3. **Desk grid (the core):** `/desk` day grid on `day.get`; inline entry create/edit/move/delete
   mutations; keyboard nav + `Ctrl+K` date palette; print day sheet stylesheet.
   *Smoke: create/move/delete entries by keyboard only; two browser windows update live; Ctrl+P
   yields a clean page.*
4. **Importer:** batch upload to storage → scheduled `processPage` actions (ported Breakpoint
   prompt + verification pass + cost telemetry) → reactive queue UI → side-by-side review →
   `confirmPage` publishes with audit link.
   *Smoke: import a real photographed page end-to-end; entries appear in grid; cost recorded;
   entry links back to photo.*
5. **Pro PWA + push:** `/me` day/week views; manifest + service worker + install onboarding
   (iOS add-to-home-screen walkthrough); `pushSubscriptions` + `push.send` fanout from entry
   mutations.
   *Smoke: on a phone, install PWA, receive a change alert when the desk moves an entry.*
6. **Invites + roles hardening:** `members.invite` email flow; role checks on every function
   (attempt pro-role mutation → rejected).
   *Smoke: invited pro signs in via OTP and sees only their schedule.*
7. **Landing page** (`landing/`): per §4.4, using real app screenshots.
8. **Final gate — the Definition of Done (§9.1) executed literally, plus a fresh-clone test:**
   `git clone` → install → env setup per README → full flow works.

### 9.1 Definition of done for MVP

Alex can photograph a real Sea Island page, import-review-publish it in under 5 minutes, Danny sees
his correct hours on his phone within a minute (no refresh), and moving an entry at the desk pushes
a change alert to Danny's phone.

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

## 11. v2 backlog

Smart notifications (digests, rules) · Stripe billing · Gemini bake-off automation · batch re-snap
diffing (detect what changed on a re-photographed page) · desk edit from mobile · multi-club UI ·
dark mode · persisted assistant threads (today the conversation lives in the client only).
