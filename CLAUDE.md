# CLAUDE.md — Courtime

Courtime turns a club's paper schedule book into a shared synchronized
calendar: front desk captures (day grid + AI photo import), pros see "my day" on their phones.
First deployment: Sea Island Club, free pilot.

**The canonical spec is [`docs/SPEC.md`](docs/SPEC.md) — read it before any product or build work.**
It contains the problem framing, surfaces, migration playbook, data model, API routes, pricing
tiers, design system, MVP build order, and the Sea Island pilot plan. When decisions change, update
SPEC.md first.

## Essentials

- Run: `npm install`, then `npm run dev:all` → Convex + Vite together on http://127.0.0.1:5183
- Verification gate: `npm run build` **and** `npx tsc -p convex --noEmit` (no tests/lint configured
  yet). Browser checks run through puppeteer-core against Chrome; the demo buttons on the sign-in
  screen are the fastest way in.
- Stack: React + Vite + TS frontend on Vercel; **Convex for everything server-side** — reactive DB,
  queries/mutations, `"use node"` actions (OpenAI vision, realtime session minting, web push), file
  storage (page photos), scheduler, and Convex Auth (email + password — shared front-desk devices
  make an email round-trip the wrong default). No Supabase/Neon/Postgres/Clerk — firm decision;
  anything Convex can do, Convex does.
- Tempo (the Pro-tier assistant) has one brain in `convex/agent.ts`: `loadSession` gates,
  `toolsFor(canWrite)` is the single allow-list, `executeTool` is the single implementation. The
  text path and the voice path (`convex/realtime.ts` → `src/agent/voice.ts`) both go through it, so
  never add a tool to one path only. This model family rejects function tools unless
  `reasoning_effort` is `"none"` on chat completions; the vision importer keeps `"low"` as it sends
  no tools.
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
