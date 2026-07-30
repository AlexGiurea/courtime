import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { formatTime } from "./schedule";

/**
 * The evening note.
 *
 * One push, once a day, to coaches who are actually teaching tomorrow: how many
 * lessons and when the day runs. That's it.
 *
 * The restraint is the feature. A coach who gets pinged every evening whether
 * or not anything is happening turns notifications off within a week, and then
 * the change alerts — the ones that genuinely matter — go with them. So: nothing
 * on a day off, nothing about the club as a whole, and nothing a coach could
 * have worked out by looking at a screen they already have open.
 */

const HOUR_UTC = 22; // roughly early evening across the US clubs we care about

export const tomorrowForEveryone = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const orgs = await ctx.db.query("orgs").take(500);
    const out: {
      membershipId: string;
      name: string;
      count: number;
      firstMin: number;
      lastMin: number;
    }[] = [];

    for (const org of orgs) {
      const entries = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) =>
          q.eq("orgId", org._id).eq("date", tomorrow),
        )
        .take(500);

      const byCoach = new Map<string, { count: number; first: number; last: number }>();
      for (const entry of entries) {
        if (!entry.proMembershipId) continue;
        const key = entry.proMembershipId as string;
        const current = byCoach.get(key);
        byCoach.set(key, {
          count: (current?.count ?? 0) + 1,
          first: Math.min(current?.first ?? entry.startMin, entry.startMin),
          last: Math.max(current?.last ?? entry.endMin, entry.endMin),
        });
      }

      for (const [membershipId, stats] of byCoach) {
        const member = await ctx.db.get("memberships", membershipId as never);
        if (!member || !member.active || !member.userId) continue;
        out.push({
          membershipId,
          name: member.displayName,
          count: stats.count,
          firstMin: stats.first,
          lastMin: stats.last,
        });
      }
    }

    return { date: tomorrow, coaches: out };
  },
});

export const sendEvening = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number }> => {
    const { coaches } = await ctx.runQuery(internal.digest.tomorrowForEveryone, {});

    for (const coach of coaches) {
      const lessons = coach.count === 1 ? "1 lesson" : `${coach.count} lessons`;
      await ctx.runAction(internal.pushNode.deliver, {
        membershipIds: [coach.membershipId as never],
        title: "Tomorrow",
        body: `${lessons}, ${formatTime(coach.firstMin)} to ${formatTime(coach.lastMin)}.`,
      });
    }

    return { sent: coaches.length };
  },
});

export const EVENING_HOUR_UTC = HOUR_UTC;
