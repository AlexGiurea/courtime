# CLAUDE.md — Courtime

Courtime (folder name `CoreTime`) turns a club's paper schedule book into a shared synchronized
calendar: front desk captures (day grid + AI photo import), pros see "my day" on their phones.
First deployment: Sea Island Club, free pilot.

**The canonical spec is [`docs/SPEC.md`](docs/SPEC.md) — read it before any product or build work.**
It contains the problem framing, surfaces, migration playbook, data model, API routes, pricing
tiers, design system, MVP build order, and the Sea Island pilot plan. When decisions change, update
SPEC.md first.

## Essentials

- Run: `npm install`, then `npm run dev` → http://127.0.0.1:5183 (currently a static concept shell;
  MVP adds an API on 5184 via `npm run dev:all`)
- Verification gate: `npm run build` (no tests/lint configured yet)
- Stack: React + Vite + TS, Node API, Neon Postgres + Drizzle, Clerk (feature-flagged — no key =
  anonymous dev mode), Vercel deploy
- Vercel gotcha: every `/api/*` route must be registered in BOTH the dev server and the prod
  catch-all (`api/index.js`) or it 404s only in prod
- Import pipeline is ported from Breakpoint (`AIOS Agent SaaS` repo, `server/schedule-import.mjs`):
  keep model pricing table + per-request cost telemetry; default model `gpt-5.6-luna`
- Sibling projects, do not merge: Breakpoint (full club OS, upgrade path), DrawGen (tournaments)
