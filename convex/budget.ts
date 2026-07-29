import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  MutationCtx,
  QueryCtx,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { currentMembership } from "./authz";

/**
 * A hard monthly ceiling on what a club can spend on model calls.
 *
 * Every paid call in the app — reading a photographed page, a Tempo answer, a
 * voice session, the Insights line — writes a row here first and checks the
 * month's total before it starts. Without this the app has an open tab against
 * someone else's API key: one enthusiastic coach holding a voice call open, or
 * a stuck import loop, is a real bill with nothing between it and the card.
 *
 * The ceiling is deliberately generous against real use. Importing a club's
 * whole book runs about $4; a month of ordinary Tempo use is cents. A club that
 * reaches $25 in a month is doing something nobody intended.
 */

const DEFAULT_CEILING_USD = 25;

/** Voice is the one that can run away, so it gets its own smaller allowance. */
const VOICE_CEILING_USD = 10;

export function monthKey(at: number): string {
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function ceilingUsd(): number {
  const raw = Number(process.env.AI_MONTHLY_CEILING_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CEILING_USD;
}

function voiceCeilingUsd(): number {
  const raw = Number(process.env.AI_MONTHLY_VOICE_CEILING_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : VOICE_CEILING_USD;
}

export type Spend = { total: number; voice: number };

export async function spendThisMonth(
  ctx: QueryCtx,
  orgId: Id<"orgs">,
  at: number,
): Promise<Spend> {
  const rows = await ctx.db
    .query("aiUsage")
    .withIndex("by_org_and_month", (q) =>
      q.eq("orgId", orgId).eq("month", monthKey(at)),
    )
    .take(5000);

  let total = 0;
  let voice = 0;
  for (const row of rows) {
    total += row.costUsd;
    if (row.kind === "voice") voice += row.costUsd;
  }
  return { total, voice };
}

/**
 * Throws when the club is out of budget. Called *before* a paid request goes
 * out, so the failure is a readable sentence rather than a surprise invoice.
 */
export async function assertWithinBudget(
  ctx: QueryCtx,
  orgId: Id<"orgs">,
  kind: Doc<"aiUsage">["kind"],
  at: number,
): Promise<void> {
  const spend = await spendThisMonth(ctx, orgId, at);
  if (spend.total >= ceilingUsd()) {
    throw new Error(
      `This club has reached its monthly limit for AI features ($${ceilingUsd().toFixed(2)}). It resets at the start of next month, or an admin can raise it.`,
    );
  }
  if (kind === "voice" && spend.voice >= voiceCeilingUsd()) {
    throw new Error(
      `This club has reached its monthly limit for voice ($${voiceCeilingUsd().toFixed(2)}). Tempo still answers by typing.`,
    );
  }
}

export async function recordSpend(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  kind: Doc<"aiUsage">["kind"],
  costUsd: number,
  at: number,
): Promise<void> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  await ctx.db.insert("aiUsage", { orgId, month: monthKey(at), kind, costUsd, at });
}

/* ---------------- entry points for actions and the UI ---------------- */

export const check = internalQuery({
  args: {
    orgId: v.id("orgs"),
    kind: v.union(
      v.literal("vision"),
      v.literal("agent"),
      v.literal("voice"),
      v.literal("insight"),
    ),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    await assertWithinBudget(ctx, args.orgId, args.kind, args.at);
    return true;
  },
});

export const record = internalMutation({
  args: {
    orgId: v.id("orgs"),
    kind: v.union(
      v.literal("vision"),
      v.literal("agent"),
      v.literal("voice"),
      v.literal("insight"),
    ),
    costUsd: v.number(),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    await recordSpend(ctx, args.orgId, args.kind, args.costUsd, args.at);
  },
});

/** What Settings shows the club about its own month. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const membership = await currentMembership(ctx);
    if (!membership || membership.role === "pro") return null;
    const now = Date.now();
    const spend = await spendThisMonth(ctx, membership.orgId, now);
    return {
      month: monthKey(now),
      spentUsd: Math.round(spend.total * 10000) / 10000,
      voiceUsd: Math.round(spend.voice * 10000) / 10000,
      ceilingUsd: ceilingUsd(),
      voiceCeilingUsd: voiceCeilingUsd(),
    };
  },
});
