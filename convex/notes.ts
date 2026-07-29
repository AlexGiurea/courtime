import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { currentMembership, requireMembership } from "./authz";

/**
 * The NOTES column running down the right-hand side of the paper page —
 * "Humbert would like Ct. 5", an account number, whatever the desk scribbles.
 * One free-text note per day, which is exactly what the paper affords.
 */
export const forDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const note = await ctx.db
      .query("dayNotes")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", args.date),
      )
      .first();
    return {
      body: note?.body ?? "",
      updatedAt: note?.updatedAt ?? null,
      canEdit: membership.role !== "pro",
    };
  },
});

/** Recent days that actually carry a note, for the desk's notes panel. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return [];
    const notes = await ctx.db
      .query("dayNotes")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", membership.orgId))
      .order("desc")
      .take(Math.min(args.limit ?? 12, 40));
    return notes.filter((note) => note.body.trim().length > 0);
  },
});

export const save = mutation({
  args: { date: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const userId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("dayNotes")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", args.date),
      )
      .first();

    const body = args.body.slice(0, 4000);

    if (existing) {
      await ctx.db.patch("dayNotes", existing._id, {
        body,
        updatedAt: Date.now(),
        updatedBy: userId ?? undefined,
      });
      return null;
    }

    if (!body.trim()) return null;

    await ctx.db.insert("dayNotes", {
      orgId: membership.orgId,
      date: args.date,
      body,
      updatedAt: Date.now(),
      updatedBy: userId ?? undefined,
    });
    return null;
  },
});
