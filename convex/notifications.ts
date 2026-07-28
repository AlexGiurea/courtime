import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { currentMembership } from "./authz";

/** One row per device. Re-subscribing on the same endpoint updates in place. */
export const savePushSubscription = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      await ctx.db.patch("pushSubscriptions", existing._id, {
        userId,
        p256dh: args.p256dh,
        auth: args.auth,
      });
      return null;
    }

    await ctx.db.insert("pushSubscriptions", {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
    });
    return null;
  },
});

export const removePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing && existing.userId === userId) {
      await ctx.db.delete("pushSubscriptions", existing._id);
    }
    return null;
  },
});

export const myPushState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { subscribed: false, deviceCount: 0 };
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(20);
    return { subscribed: subs.length > 0, deviceCount: subs.length };
  },
});

export const subscriptionsForMemberships = internalQuery({
  args: { membershipIds: v.array(v.id("memberships")) },
  handler: async (ctx, args) => {
    const out: { endpoint: string; p256dh: string; auth: string }[] = [];
    for (const membershipId of args.membershipIds.slice(0, 50)) {
      const membership = await ctx.db.get("memberships", membershipId);
      if (!membership?.userId) continue;
      const subs = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", membership.userId!))
        .take(10);
      for (const sub of subs) {
        out.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
      }
    }
    return out;
  },
});

export const dropSubscription = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) await ctx.db.delete("pushSubscriptions", existing._id);
    return null;
  },
});

/** What the pro's "recent updates" strip reads. */
export const myRecentAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return [];
    const changes = await ctx.db
      .query("entryChanges")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .order("desc")
      .take(60);
    return changes
      .filter((c) => c.affectedMembershipIds.includes(membership._id))
      .slice(0, Math.min(args.limit ?? 10, 30));
  },
});
