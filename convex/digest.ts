import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { formatTime } from "./schedule";

/**
 * The evening note.
 *
 * One push, once a day, to coaches who are actually teaching tomorrow: how many
 * lessons and when the day runs. That's it.
 *
 * The restraint is the feature. A coach who gets pinged every evening whether or
 * not anything is happening turns notifications off within a week, and then the
 * change alerts — the ones that genuinely matter — go with them. So: nothing on
 * a day off, nothing about the club as a whole, and nothing a coach could have
 * worked out by looking at a screen they already have open.
 *
 * "Evening" is local. The job wakes hourly and only picks up the clubs where it
 * is currently the right hour in *that club's* time zone — a club in Georgia and
 * a club in Spain both get theirs at six, not one of them at two in the morning.
 */

const SEND_HOUR = 18;
const FALLBACK_ZONE = "America/New_York";

/** The hour and the date it currently is in a given IANA zone. */
function localNow(zone: string): { hour: number; today: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hour: Number(get("hour")),
    today: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const dueThisHour = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("orgs").take(500);
    const out: {
      membershipId: string;
      count: number;
      firstMin: number;
      lastMin: number;
    }[] = [];

    for (const org of orgs) {
      let local;
      try {
        local = localNow(org.timeZone || FALLBACK_ZONE);
      } catch {
        // A club with a mistyped zone still gets its digest, on the default.
        local = localNow(FALLBACK_ZONE);
      }
      if (local.hour !== SEND_HOUR) continue;

      const tomorrow = addDaysIso(local.today, 1);
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
          count: stats.count,
          firstMin: stats.first,
          lastMin: stats.last,
        });
      }
    }

    return out;
  },
});

export const sendEvening = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number }> => {
    const coaches = await ctx.runQuery(internal.digest.dueThisHour, {});

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
