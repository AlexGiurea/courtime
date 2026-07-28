# CLAUDE.md — Courtime

Courtime turns a club's paper schedule book into a shared synchronized
calendar: front desk captures (day grid + AI photo import), pros see "my day" on their phones.
First deployment: Sea Island Club, free pilot.

**The canonical spec is [`docs/SPEC.md`](docs/SPEC.md) — read it before any product or build work.**
It contains the problem framing, surfaces, migration playbook, data model, API routes, pricing
tiers, design system, MVP build order, and the Sea Island pilot plan. When decisions change, update
SPEC.md first.

## Essentials

- Run: `npm install`, then `npm run dev` → http://127.0.0.1:5183 (currently a static concept shell;
  MVP adds `npx convex dev` alongside, wrapped as `npm run dev:all`)
- Verification gate: `npm run build` (no tests/lint configured yet)
- Stack: React + Vite + TS frontend on Vercel; **Convex for everything server-side** — reactive DB,
  queries/mutations, `"use node"` actions (OpenAI vision, web push), file storage (page photos),
  scheduler, and Convex Auth (email OTP/magic-link, no passwords). No Supabase/Neon/Postgres/Clerk —
  firm decision; anything Convex can do, Convex does.
- Import pipeline logic is ported from Breakpoint (`AIOS Agent SaaS` repo,
  `server/schedule-import.mjs`) into a Convex action: keep model pricing table + per-request cost
  telemetry; default model `gpt-5.6-luna`
- Sibling projects, do not merge: Breakpoint (full club OS, upgrade path), DrawGen (tournaments)

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
