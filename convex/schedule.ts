import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, mutation, query } from "./_generated/server";
import { currentMembership, requireMembership } from "./authz";
import { linkEntry, unlinkEntry } from "./clients";

export const SLOT_MIN = 30;

export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function snap(min: number): number {
  return Math.round(min / SLOT_MIN) * SLOT_MIN;
}

function assertValidSpan(startMin: number, endMin: number) {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    throw new Error("Invalid time");
  }
  if (endMin <= startMin) throw new Error("A booking must end after it starts");
  if (startMin < 0 || endMin > 24 * 60) throw new Error("Times must be inside the day");
}

/** Same court, same day, overlapping minutes — the one thing paper gets wrong silently. */
async function findConflict(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  date: string,
  courtId: Id<"courts">,
  startMin: number,
  endMin: number,
  ignoreEntryId?: Id<"entries">,
): Promise<Doc<"entries"> | null> {
  const sameDay = await ctx.db
    .query("entries")
    .withIndex("by_org_and_date", (q) => q.eq("orgId", orgId).eq("date", date))
    .take(500);
  for (const entry of sameDay) {
    if (entry.courtId !== courtId) continue;
    if (ignoreEntryId && entry._id === ignoreEntryId) continue;
    if (startMin < entry.endMin && endMin > entry.startMin) return entry;
  }
  return null;
}

async function recordChange(
  ctx: MutationCtx,
  args: {
    orgId: Id<"orgs">;
    entryId?: Id<"entries">;
    changeType: "created" | "moved" | "edited" | "deleted" | "imported";
    summary: string;
    date: string;
    affectedMembershipIds: Id<"memberships">[];
  },
) {
  const userId = await getAuthUserId(ctx);
  await ctx.db.insert("entryChanges", {
    orgId: args.orgId,
    entryId: args.entryId,
    changeType: args.changeType,
    summary: args.summary,
    date: args.date,
    affectedMembershipIds: args.affectedMembershipIds,
    byUserId: userId ?? undefined,
  });
  if (args.affectedMembershipIds.length) {
    await ctx.scheduler.runAfter(0, internal.pushNode.deliver, {
      membershipIds: args.affectedMembershipIds,
      title: "Schedule updated",
      body: args.summary,
    });
  }
}

/** The desk's day grid: courts down the columns, every booking on that date. */
export const day = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", args.date),
      )
      .take(500);

    return {
      date: args.date,
      entries: entries.sort((a, b) => a.startMin - b.startMin),
      viewerRole: membership.role,
      viewerMembershipId: membership._id,
    };
  },
});

/** The coach's own hours across a date range — the whole pro app runs on this. */
export const mySchedule = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_pro_and_date", (q) =>
        q
          .eq("orgId", membership.orgId)
          .eq("proMembershipId", membership._id)
          .gte("date", args.startDate)
          .lte("date", args.endDate),
      )
      .take(500);

    return {
      entries: entries.sort((a, b) =>
        a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
      ),
      membershipId: membership._id,
      displayName: membership.displayName,
    };
  },
});

/** Club-wide day for a coach who is allowed to see past their own column. */
export const clubDay = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const org = await ctx.db.get("orgs", membership.orgId);
    if (!org) return null;
    if (membership.role === "pro" && !org.prosCanSeeClub) {
      return { allowed: false as const, entries: [] };
    }
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", args.date),
      )
      .take(500);
    return {
      allowed: true as const,
      entries: entries.sort((a, b) => a.startMin - b.startMin),
    };
  },
});

/**
 * Entries across a span, for the Pro insight surface and the payroll export.
 * Gated server-side as well as in the UI so the tier means something.
 */
export const range = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const org = await ctx.db.get("orgs", membership.orgId);
    if (!org) return null;
    if (org.plan !== "pro") return { locked: true as const, entries: [] };

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q
          .eq("orgId", membership.orgId)
          .gte("date", args.startDate)
          .lte("date", args.endDate),
      )
      .take(3000);

    return { locked: false as const, entries };
  },
});

/** Recent desk activity — powers the audit strip and "what changed" reads. */
export const recentChanges = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return [];
    const changes = await ctx.db
      .query("entryChanges")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .order("desc")
      .take(Math.min(args.limit ?? 25, 100));
    return changes;
  },
});

export const createEntry = mutation({
  args: {
    date: v.string(),
    courtId: v.id("courts"),
    startMin: v.number(),
    endMin: v.number(),
    label: v.string(),
    proMembershipId: v.optional(v.id("memberships")),
    sessionType: v.optional(v.string()),
    notes: v.optional(v.string()),
    requested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const startMin = snap(args.startMin);
    const endMin = snap(args.endMin);
    assertValidSpan(startMin, endMin);

    const court = await ctx.db.get("courts", args.courtId);
    if (!court || court.orgId !== membership.orgId) throw new Error("Unknown court");

    const label = args.label.trim();
    if (!label) throw new Error("Give the booking a name");

    const conflict = await findConflict(
      ctx,
      membership.orgId,
      args.date,
      args.courtId,
      startMin,
      endMin,
    );
    if (conflict) {
      throw new Error(
        `${court.name} is already booked at that time (${conflict.label})`,
      );
    }

    const entryId = await ctx.db.insert("entries", {
      orgId: membership.orgId,
      courtId: args.courtId,
      date: args.date,
      startMin,
      endMin,
      label,
      proMembershipId: args.proMembershipId,
      sessionType: args.sessionType,
      notes: args.notes,
      requested: args.requested,
      source: "manual",
      updatedAt: Date.now(),
    });

    // Whoever is named on the booking gets a profile entry, right now — the
    // label itself is left exactly as the desk typed it.
    const created = await ctx.db.get("entries", entryId);
    if (created) await linkEntry(ctx, created);

    await recordChange(ctx, {
      orgId: membership.orgId,
      entryId,
      changeType: "created",
      date: args.date,
      summary: `${label} added — ${court.name}, ${formatTime(startMin)}`,
      affectedMembershipIds: args.proMembershipId ? [args.proMembershipId] : [],
    });

    return { entryId };
  },
});

export const updateEntry = mutation({
  args: {
    entryId: v.id("entries"),
    courtId: v.optional(v.id("courts")),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    label: v.optional(v.string()),
    proMembershipId: v.optional(v.union(v.id("memberships"), v.null())),
    sessionType: v.optional(v.string()),
    notes: v.optional(v.string()),
    requested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== membership.orgId) throw new Error("Unknown booking");

    const courtId = args.courtId ?? entry.courtId;
    const startMin = args.startMin !== undefined ? snap(args.startMin) : entry.startMin;
    const endMin = args.endMin !== undefined ? snap(args.endMin) : entry.endMin;
    assertValidSpan(startMin, endMin);

    const court = await ctx.db.get("courts", courtId);
    if (!court || court.orgId !== membership.orgId) throw new Error("Unknown court");

    const conflict = await findConflict(
      ctx,
      membership.orgId,
      entry.date,
      courtId,
      startMin,
      endMin,
      entry._id,
    );
    if (conflict) {
      throw new Error(
        `${court.name} is already booked at that time (${conflict.label})`,
      );
    }

    const movedCourt = courtId !== entry.courtId;
    const movedTime = startMin !== entry.startMin || endMin !== entry.endMin;
    const nextPro =
      args.proMembershipId === undefined
        ? entry.proMembershipId
        : args.proMembershipId === null
          ? undefined
          : args.proMembershipId;

    await ctx.db.patch("entries", args.entryId, {
      courtId,
      startMin,
      endMin,
      ...(args.label !== undefined && args.label.trim() ? { label: args.label.trim() } : {}),
      proMembershipId: nextPro,
      ...(args.sessionType !== undefined ? { sessionType: args.sessionType } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.requested !== undefined ? { requested: args.requested } : {}),
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get("entries", args.entryId);
    if (updated) await linkEntry(ctx, updated);

    const label = args.label?.trim() || entry.label;
    const affected = new Set<Id<"memberships">>();
    if (entry.proMembershipId) affected.add(entry.proMembershipId);
    if (nextPro) affected.add(nextPro);

    await recordChange(ctx, {
      orgId: membership.orgId,
      entryId: args.entryId,
      changeType: movedCourt || movedTime ? "moved" : "edited",
      date: entry.date,
      summary:
        movedCourt || movedTime
          ? `${label} moved to ${court.name}, ${formatTime(startMin)}`
          : `${label} updated — ${court.name}, ${formatTime(startMin)}`,
      affectedMembershipIds: [...affected],
    });

    return null;
  },
});

/**
 * The asterisk. One click, no dialog — the desk marks these while a member is
 * still on the phone, so it has to be as cheap as ticking a box on paper.
 */
export const setRequested = mutation({
  args: { entryId: v.id("entries"), requested: v.boolean() },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== membership.orgId) throw new Error("Unknown booking");
    await ctx.db.patch("entries", args.entryId, {
      requested: args.requested,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteEntry = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== membership.orgId) throw new Error("Unknown booking");
    const court = await ctx.db.get("courts", entry.courtId);

    await unlinkEntry(ctx, args.entryId);
    await ctx.db.delete("entries", args.entryId);
    await recordChange(ctx, {
      orgId: membership.orgId,
      changeType: "deleted",
      date: entry.date,
      summary: `${entry.label} cancelled — ${court?.name ?? "court"}, ${formatTime(entry.startMin)}`,
      affectedMembershipIds: entry.proMembershipId ? [entry.proMembershipId] : [],
    });
    return null;
  },
});

/**
 * A standing lesson: the same booking every week.
 *
 * Weeks that clash are skipped and reported rather than forced — a booking that
 * quietly overwrote someone else's court would be worse than no feature at all.
 * Every one carries the same `seriesId`, so cancelling the rest of them later is
 * one indexed read instead of a hunt through the calendar.
 */
export const createSeries = mutation({
  args: {
    courtId: v.id("courts"),
    startDate: v.string(),
    weeks: v.number(),
    startMin: v.number(),
    endMin: v.number(),
    label: v.string(),
    proMembershipId: v.optional(v.id("memberships")),
    sessionType: v.optional(v.string()),
    requested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const court = await ctx.db.get("courts", args.courtId);
    if (!court || court.orgId !== membership.orgId) throw new Error("Unknown court");

    const startMin = snap(args.startMin);
    const endMin = snap(args.endMin);
    assertValidSpan(startMin, endMin);

    const label = args.label.trim() || "Booking";
    const weeks = Math.max(2, Math.min(52, Math.round(args.weeks)));
    const seriesId = `series_${Date.now()}_${Math.round(Math.random() * 1e6)}`;

    const booked: string[] = [];
    const skipped: string[] = [];

    for (let week = 0; week < weeks; week += 1) {
      const date = addDaysIso(args.startDate, week * 7);
      const sameDay = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) =>
          q.eq("orgId", membership.orgId).eq("date", date),
        )
        .take(500);
      const clash = sameDay.some(
        (entry) =>
          entry.courtId === args.courtId &&
          startMin < entry.endMin &&
          endMin > entry.startMin,
      );
      if (clash) {
        skipped.push(date);
        continue;
      }

      const entryId = await ctx.db.insert("entries", {
        orgId: membership.orgId,
        courtId: args.courtId,
        date,
        startMin,
        endMin,
        label,
        proMembershipId: args.proMembershipId,
        sessionType: args.sessionType,
        requested: args.requested,
        source: "manual",
        seriesId,
        updatedAt: Date.now(),
      });
      const created = await ctx.db.get("entries", entryId);
      if (created) await linkEntry(ctx, created);
      booked.push(date);
    }

    if (booked.length) {
      await recordChange(ctx, {
        orgId: membership.orgId,
        changeType: "created",
        date: booked[0],
        summary: `${label} added weekly — ${court.name}, ${formatTime(startMin)}, ${booked.length} weeks`,
        affectedMembershipIds: args.proMembershipId ? [args.proMembershipId] : [],
      });
    }

    return { seriesId, booked, skipped };
  },
});

/** Cancel the whole standing lesson from a date forward. */
export const cancelSeries = mutation({
  args: { seriesId: v.string(), fromDate: v.string() },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const rows = await ctx.db
      .query("entries")
      .withIndex("by_series", (q) => q.eq("seriesId", args.seriesId))
      .take(200);

    let removed = 0;
    for (const entry of rows) {
      if (entry.orgId !== membership.orgId || entry.date < args.fromDate) continue;
      await unlinkEntry(ctx, entry._id);
      await ctx.db.delete("entries", entry._id);
      removed += 1;
    }
    return { removed };
  },
});

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
