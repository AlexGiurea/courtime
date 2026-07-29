import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { QueryCtx, mutation, query } from "./_generated/server";
import { currentMembership, requireMembership } from "./authz";
import { clinicParticipantValidator } from "./schema";

/**
 * A roster is attached to a grid booking when we know which one it is, and
 * otherwise matched by start time — the clinic sheet and the court grid are two
 * sides of the same piece of paper, so the times line up even when nobody has
 * linked them explicitly.
 */
async function rostersForDate(
  ctx: QueryCtx,
  orgId: Doc<"orgs">["_id"],
  date: string,
) {
  return await ctx.db
    .query("clinicRosters")
    .withIndex("by_org_and_date", (q) => q.eq("orgId", orgId).eq("date", date))
    .take(60);
}

export const forDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;

    const rosters = await rostersForDate(ctx, membership.orgId, args.date);
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", args.date),
      )
      .take(500);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(200);
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);

    const courtName = new Map(courts.map((c) => [c._id as string, c.name]));
    const memberName = new Map(members.map((m) => [m._id as string, m.displayName]));

    return {
      rosters: rosters
        .map((roster) => {
          const entry = roster.entryId
            ? entries.find((e) => e._id === roster.entryId)
            : entries.find(
                (candidate) =>
                  roster.startMin !== undefined &&
                  candidate.startMin === roster.startMin &&
                  (candidate.sessionType === "Clinic" ||
                    candidate.sessionType === "Group"),
              );
          return {
            ...roster,
            court: entry ? (courtName.get(entry.courtId as string) ?? null) : null,
            coach: entry?.proMembershipId
              ? (memberName.get(entry.proMembershipId as string) ?? null)
              : null,
            matchedEntryId: entry?._id ?? null,
          };
        })
        .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0)),
      viewerRole: membership.role,
    };
  },
});

/** The sign-up sheet behind one booking on the grid. */
export const forEntry = query({
  args: { entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== membership.orgId) return null;

    const linked = await ctx.db
      .query("clinicRosters")
      .withIndex("by_entry", (q) => q.eq("entryId", args.entryId))
      .first();
    if (linked) return { roster: linked, matchedBy: "link" as const };

    const sameDay = await rostersForDate(ctx, membership.orgId, entry.date);
    const byTime = sameDay.find((roster) => roster.startMin === entry.startMin);
    return byTime ? { roster: byTime, matchedBy: "time" as const } : { roster: null };
  },
});

export const save = mutation({
  args: {
    rosterId: v.optional(v.id("clinicRosters")),
    date: v.string(),
    title: v.string(),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    entryId: v.optional(v.id("entries")),
    participants: v.array(clinicParticipantValidator),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const title = args.title.trim() || "Clinic";
    const participants = args.participants
      .filter((p) => p.name.trim())
      .slice(0, 40)
      .map((p) => ({ ...p, name: p.name.trim() }));

    if (args.rosterId) {
      const existing = await ctx.db.get("clinicRosters", args.rosterId);
      if (!existing || existing.orgId !== membership.orgId) {
        throw new Error("Unknown clinic");
      }
      await ctx.db.patch("clinicRosters", args.rosterId, {
        title,
        startMin: args.startMin,
        endMin: args.endMin,
        entryId: args.entryId,
        participants,
        updatedAt: Date.now(),
      });
      return { rosterId: args.rosterId };
    }

    const rosterId = await ctx.db.insert("clinicRosters", {
      orgId: membership.orgId,
      date: args.date,
      title,
      startMin: args.startMin,
      endMin: args.endMin,
      entryId: args.entryId,
      participants,
      updatedAt: Date.now(),
    });
    return { rosterId };
  },
});

export const remove = mutation({
  args: { rosterId: v.id("clinicRosters") },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const roster = await ctx.db.get("clinicRosters", args.rosterId);
    if (!roster || roster.orgId !== membership.orgId) throw new Error("Unknown clinic");
    await ctx.db.delete("clinicRosters", args.rosterId);
    return null;
  },
});

export const linkToEntry = mutation({
  args: {
    rosterId: v.id("clinicRosters"),
    entryId: v.union(v.id("entries"), v.null()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const roster = await ctx.db.get("clinicRosters", args.rosterId);
    if (!roster || roster.orgId !== membership.orgId) throw new Error("Unknown clinic");
    if (args.entryId) {
      const entry = await ctx.db.get("entries", args.entryId);
      if (!entry || entry.orgId !== membership.orgId) throw new Error("Unknown booking");
    }
    await ctx.db.patch("clinicRosters", args.rosterId, {
      entryId: args.entryId ?? undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
