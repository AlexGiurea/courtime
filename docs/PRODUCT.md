# CoreTime — Product & System Design

One-line pitch: **the club's paper schedule book, on every phone.** The front desk keeps working the
way it works; pros open an app and see their hours, always current.

First deployment: Sea Island Club (free). Later: a focused, standalone product for any club still
running on paper. Breakpoint remains the "full operating system" upgrade path; CoreTime is the
single-use-case wedge.

## The two surfaces

CoreTime is one shared calendar with two very different windows into it:

1. **Capture (front desk / director)** — desktop-and-tablet-first. A day grid (time rows × court
   columns) that mirrors the paper page exactly, so the person entering data recognizes what they
   see. Two ways in:
   - **Photo import**: snap the paper page, AI turns it into grid entries (port of Breakpoint's
     vision import pipeline).
   - **Quick manual entry**: click a cell, type "Danny — Private (R. Hayes)", done. Entry speed has
     to beat writing on paper or the habit never forms.
2. **View (pros / coaches)** — mobile-first, read-only in v1. "My day / my week": only your hours,
   Google-Calendar-like list, live-updated. Zero training required; the pro's entire onboarding is
   opening a link and logging in.

Roles: **admin** (director — settings, members, everything), **staff** (front desk — capture/edit),
**pro** (read own + optionally full club view). One club = one organization; multi-club comes later.

## Migration: the "booked on paper until next year" problem

Do not try to digitize the whole paper book. The key insight: a club's forward schedule is mostly a
**repeating weekly pattern plus exceptions**, so:

1. **Capture one representative week** (photo import, ~7 pages) and convert it into recurring
   weekly entries.
2. **Pick a cutover Monday.** From that day, the app is the source of truth; the paper book becomes
   an archive nobody maintains forward.
3. **Handle the future exceptions lazily**: anything already booked on paper for later months gets
   entered the week it becomes relevant, by the front desk, as part of the normal daily rhythm.

This turns "migrate a year of paper" (impossible to sell) into "photograph one week, then just keep
doing your job" (a 30-minute onboarding). Batch photo import (upload a stack of pages, process as a
queue) is a v2 nice-to-have, not a launch requirement.

## System design

Stack mirrors what we already run well (Breakpoint), so nothing new to learn or operate:

- **Frontend**: React + Vite + TypeScript. Two route groups: `/desk` (capture) and `/me` (pro view).
- **API**: small Node server (same dual-router discipline as Breakpoint if we deploy to Vercel:
  register routes in both the dev server and the prod catch-all).
- **DB**: Postgres (Neon). Tables:
  - `orgs` (club), `courts`, `users`, `memberships` (user↔org + role)
  - `entries` (org, court, date, start, end, pro_id, label, notes, source: manual|import|recurrence)
  - `recurrences` (weekly pattern rows that materialize into `entries` a rolling N weeks ahead)
  - `imports` (uploaded page photo, AI output, review status)
- **Auth**: Clerk (already know it from Breakpoint). Pros sign in with email link — no passwords to
  support at the front desk.
- **Real-time**: polling every 30–60s in v1. It's a schedule, not a chat app; websockets are not
  earned yet.
- **Photo import**: reuse Breakpoint's vision pipeline (gpt-5.5 grid-accuracy model, 30-min grid,
  review-before-commit step where the front desk confirms/corrects the AI's read).

## v1 scope (what "done enough for Sea Island" means)

- Day grid capture with manual entry + single-page photo import with review step
- Recurring weekly entries with per-day overrides
- Pro mobile view (my day / my week), live via polling
- Roles + invites (admin invites pros by email)
- That's it. No payments, no analytics, no agent, no notifications in v1.

## Business model (later, but the shape)

- **Free tier — the calendar itself, complete.** Capture, photo import (reasonable monthly cap),
  unlimited pros, recurring schedules, mobile views. The free tier builds the daily habit and
  spreads pro-to-pro; crippling it kills the wedge.
- **Paid (~$15–25/club/month, flat per-org)** — automation on top of the habit:
  - change notifications (push/SMS: "your 3pm moved to Court 2")
  - hours summaries / payroll export (pro hours → CSV for the bookkeeper) — likely the #1 closer
  - AI agent over the schedule ("who's free Thursday at 4?", "swap my Friday morning with Danny")
  - analytics (court utilization, pro load)
- Upgrade path beyond that: Breakpoint (players, payments, communication — the full OS).

Pricing stays flat per club, not per seat — per-seat punishes exactly the behavior we want (every
pro on the app).

## Sea Island framing

Sell it as removing zero habits and adding one convenience: "keep your paper process exactly as it
is; we photograph the page each morning and every pro sees their day on their phone. Free." Once
the pros depend on it, the front desk naturally shifts to entering directly — the paper fades on
its own rather than by mandate.
