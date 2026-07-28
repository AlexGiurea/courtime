import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

const RANK = { pro: 1, staff: 2, admin: 3 } as const;
export type Role = keyof typeof RANK;

/** The caller's club membership, or null when signed out or not yet in a club. */
export async function currentMembership(
  ctx: QueryCtx,
): Promise<Doc<"memberships"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return membership && membership.active ? membership : null;
}

/**
 * Membership for a caller that must be signed in and hold at least `minRole`.
 * Every non-public query and mutation goes through this — roles are never
 * trusted from the client.
 */
export async function requireMembership(
  ctx: QueryCtx,
  minRole: Role = "pro",
): Promise<Doc<"memberships">> {
  const membership = await currentMembership(ctx);
  if (!membership) throw new Error("Not authenticated");
  if (RANK[membership.role] < RANK[minRole]) {
    throw new Error("Unauthorized: this action needs a higher role");
  }
  return membership;
}

/** Pull an invited membership into the signed-in user's account, by email. */
export async function claimPendingInvite(ctx: MutationCtx): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return;
  const existing = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (existing) return;

  const user = await ctx.db.get("users", userId);
  const email = user?.email?.toLowerCase();
  if (!email) return;

  const invited = await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (invited && invited.userId === undefined) {
    await ctx.db.patch("memberships", invited._id, {
      userId,
      displayName: invited.displayName || user?.name || email,
    });
  }
}
