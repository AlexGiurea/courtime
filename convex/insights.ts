import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { currentMembership } from "./authz";
import { recordSpend } from "./budget";
import { SLOT_MIN, formatTime } from "./schedule";

/**
 * The line that rotates at the top of Insights.
 *
 * The design decision that matters: **the model never does arithmetic.** Every
 * number is computed here, in code, from the club's own rows, and the model is
 * handed the finished figures and asked only to say them like a person would.
 * That is what makes it both cheap — a few hundred tokens, once a day, on the
 * cheapest model in the table — and trustworthy, because a director reading
 * "Court 6 sat empty all week" can go and check it.
 *
 * Cached per club per day. Roughly a fifth of a cent a club a day.
 */

const DEFAULT_MODEL = "gpt-5.6-luna";

/** Same table as the importer keeps, per million tokens. */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

const WANTED = 6;

/** Anything older than this and the day has moved on enough to be worth redoing. */
const STALE_MS = 6 * 60 * 60 * 1000;

function isoDay(at: number, offsetDays = 0): string {
  const date = new Date(at + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

export const facts = internalQuery({
  args: { orgId: v.id("orgs"), today: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db.get("orgs", args.orgId);
    if (!org) return null;

    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(60);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);

    // Monday of the week `today` falls in, so the numbers match the week a club
    // actually runs and pays on.
    const day = new Date(`${args.today}T00:00:00Z`).getUTCDay();
    const backToMonday = day === 0 ? 6 : day - 1;
    const start = new Date(`${args.today}T00:00:00Z`).getTime() - backToMonday * 86400000;
    const week: string[] = [];
    for (let i = 0; i < 7; i += 1) week.push(isoDay(start, i));

    const perDay: { date: string; count: number; minutes: number }[] = [];
    const courtMinutes = new Map<string, number>();
    const coachMinutes = new Map<string, number>();
    let requested = 0;
    let coachedCount = 0;
    let weekCount = 0;

    for (const date of week) {
      const rows = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId).eq("date", date))
        .take(500);
      let minutes = 0;
      for (const row of rows) {
        const span = row.endMin - row.startMin;
        minutes += span;
        courtMinutes.set(row.courtId, (courtMinutes.get(row.courtId) ?? 0) + span);
        if (row.proMembershipId) {
          coachedCount += 1;
          coachMinutes.set(
            row.proMembershipId,
            (coachMinutes.get(row.proMembershipId) ?? 0) + span,
          );
        }
        if (row.requested) requested += 1;
      }
      perDay.push({ date, count: rows.length, minutes });
      weekCount += rows.length;
    }

    const todayRows = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId).eq("date", args.today))
      .take(500);

    // The first stretch of the day with nothing on any court — the thing a
    // director would actually act on.
    const openWindow = findLongestGap(
      todayRows.map((r) => [r.startMin, r.endMin] as const),
      org.dayStartMin,
      org.dayEndMin,
      courts.length,
    );

    const clinics = await ctx.db
      .query("clinicRosters")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId).eq("date", args.today))
      .take(60);

    const nameOf = new Map(members.map((m) => [m._id as string, m.displayName]));
    const courtName = new Map(courts.map((c) => [c._id as string, c.name]));

    const busiest = [...perDay].sort((a, b) => b.count - a.count)[0] ?? null;
    const quietest = [...perDay].sort((a, b) => a.count - b.count)[0] ?? null;

    const coachTable = [...coachMinutes.entries()]
      .map(([id, minutes]) => ({ name: nameOf.get(id) ?? "A coach", hours: minutes / 60 }))
      .sort((a, b) => b.hours - a.hours);

    const courtTable = courts
      .map((court) => ({
        name: court.name,
        hours: (courtMinutes.get(court._id) ?? 0) / 60,
      }))
      .sort((a, b) => b.hours - a.hours);

    return {
      clubName: org.name,
      today: args.today,
      weekStart: week[0],
      weekEnd: week[6],
      todayCount: todayRows.length,
      todayHours: todayRows.reduce((sum, r) => sum + (r.endMin - r.startMin), 0) / 60,
      weekCount,
      weekHours: perDay.reduce((sum, d) => sum + d.minutes, 0) / 60,
      coachedShare: weekCount ? Math.round((coachedCount / weekCount) * 100) : 0,
      requestedShare: weekCount ? Math.round((requested / weekCount) * 100) : 0,
      busiest: busiest ? { date: busiest.date, count: busiest.count } : null,
      quietest: quietest ? { date: quietest.date, count: quietest.count } : null,
      coaches: coachTable.slice(0, 5),
      courts: courtTable,
      emptyCourts: courtTable.filter((c) => c.hours === 0).map((c) => c.name),
      clinics: clinics.map((c) => ({
        title: c.title,
        signedUp: c.participants.filter((p) => !p.waitlisted).length,
        waitlisted: c.participants.filter((p) => p.waitlisted).length,
        capacity: c.capacity ?? null,
      })),
      openWindow,
      courtNames: [...courtName.values()],
    };
  },
});

/** The longest stretch where every court was free at once. */
function findLongestGap(
  spans: readonly (readonly [number, number])[],
  dayStart: number,
  dayEnd: number,
  courtCount: number,
): { startMin: number; endMin: number; label: string } | null {
  if (courtCount === 0) return null;
  const busy = new Set<number>();
  for (const [start, end] of spans) {
    for (let t = start; t < end; t += SLOT_MIN) busy.add(t);
  }
  let best: { startMin: number; endMin: number } | null = null;
  let runStart: number | null = null;
  for (let t = dayStart; t <= dayEnd; t += SLOT_MIN) {
    const free = t < dayEnd && !busy.has(t);
    if (free && runStart === null) runStart = t;
    if (!free && runStart !== null) {
      const candidate = { startMin: runStart, endMin: t };
      if (!best || candidate.endMin - candidate.startMin > best.endMin - best.startMin) {
        best = candidate;
      }
      runStart = null;
    }
  }
  if (!best || best.endMin - best.startMin < 90) return null;
  return {
    ...best,
    label: `${formatTime(best.startMin)} to ${formatTime(best.endMin)}`,
  };
}

export const cached = query({
  args: {},
  handler: async (ctx) => {
    const membership = await currentMembership(ctx);
    if (!membership || membership.role === "pro") return null;
    const today = isoDay(Date.now());
    const row = await ctx.db
      .query("insightCards")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", membership.orgId).eq("date", today),
      )
      .first();
    return row ? { lines: row.lines, generatedAt: row.generatedAt } : null;
  },
});

export const store = internalMutation({
  args: {
    orgId: v.id("orgs"),
    date: v.string(),
    lines: v.array(v.string()),
    model: v.string(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("insightCards")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", args.orgId).eq("date", args.date),
      )
      .first();
    const doc = { ...args, generatedAt: Date.now() };
    if (existing) await ctx.db.patch("insightCards", existing._id, doc);
    else await ctx.db.insert("insightCards", doc);
    await recordSpend(ctx, args.orgId, "insight", args.costUsd, Date.now());
  },
});

/**
 * Called once when the Insights page mounts. Returns immediately from cache on
 * every load but the first of the day.
 */
export const refresh = action({
  args: {},
  handler: async (ctx): Promise<{ lines: string[]; cached: boolean }> => {
    const membership = await ctx.runQuery(internal.insights.me, {});
    if (!membership) return { lines: [], cached: true };

    const today = isoDay(Date.now());
    const existing = await ctx.runQuery(internal.insights.peek, {
      orgId: membership.orgId,
      date: today,
    });
    if (existing && Date.now() - existing.generatedAt < STALE_MS) {
      return { lines: existing.lines, cached: true };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const data = await ctx.runQuery(internal.insights.facts, {
      orgId: membership.orgId,
      today,
    });
    if (!data) return { lines: [], cached: true };

    // Something useful even with no key and no budget — the numbers are real
    // either way, the model only ever changed the wording.
    const fallback = plainLines(data);
    if (!apiKey) return { lines: fallback, cached: false };

    try {
      await ctx.runQuery(internal.budget.check, {
        orgId: membership.orgId,
        kind: "insight",
        at: Date.now(),
      });
    } catch {
      return { lines: fallback, cached: false };
    }

    const model = process.env.OPENAI_INSIGHT_MODEL || DEFAULT_MODEL;
    let lines = fallback;
    let costUsd = 0;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          reasoning_effort: "none",
          messages: [
            {
              role: "system",
              content: [
                "You write the one-line notes that rotate at the top of a racquet club's schedule dashboard.",
                `Write exactly ${WANTED} lines as a JSON array of strings, nothing else.`,
                "Each line is one sentence, under 100 characters, in plain English, the way a sharp club manager would say it to a colleague in passing.",
                "Use ONLY the numbers given. Never invent a figure, a name or a court. Never round a number into a different one.",
                "Mix them up: what today looks like, what the week looks like, which court or coach stands out, something quietly useful to act on.",
                "Warm and direct. No exclamation marks, no emoji, no corporate words like 'leverage', 'optimize' or 'utilization'.",
                "Never start a line with the club's name.",
              ].join("\n"),
            },
            { role: "user", content: JSON.stringify(data) },
          ],
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const parsed = parseLines(json.choices?.[0]?.message?.content ?? "");
        if (parsed.length) lines = parsed.slice(0, WANTED);

        const pricing = PRICING[model] ?? PRICING[DEFAULT_MODEL];
        costUsd =
          ((json.usage?.prompt_tokens ?? 0) / 1e6) * pricing.input +
          ((json.usage?.completion_tokens ?? 0) / 1e6) * pricing.output;
      }
    } catch {
      // A dashboard line is never worth failing a page load over.
    }

    await ctx.runMutation(internal.insights.store, {
      orgId: membership.orgId,
      date: today,
      lines,
      model,
      costUsd,
    });
    return { lines, cached: false };
  },
});

export const me = internalQuery({
  args: {},
  handler: async (ctx) => {
    const membership = await currentMembership(ctx);
    if (!membership || membership.role === "pro") return null;
    return { orgId: membership.orgId as Id<"orgs"> };
  },
});

export const peek = internalQuery({
  args: { orgId: v.id("orgs"), date: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("insightCards")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", args.orgId).eq("date", args.date),
      )
      .first();
    return row ? { lines: row.lines, generatedAt: row.generatedAt } : null;
  },
});

function parseLines(content: string): string[] {
  const text = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
    }
  } catch {
    /* fall through to line splitting */
  }
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s"]+/, "").replace(/"$/, "").trim())
    .filter((line) => line.length > 8);
}

/** The subset of the facts the fallback wording needs. */
type FactsForWording = {
  todayCount: number;
  todayHours: number;
  weekCount: number;
  coaches: { name: string; hours: number }[];
  courts: { name: string; hours: number }[];
  emptyCourts: string[];
  openWindow: { label: string } | null;
  requestedShare: number;
};

/** What the ticker says when there's no key, no budget, or the call failed. */
function plainLines(data: FactsForWording): string[] {
  const lines: string[] = [];
  lines.push(
    data.todayCount === 0
      ? "Nothing on the book today yet."
      : `${data.todayCount} bookings today, ${data.todayHours.toFixed(1)} hours of court time.`,
  );
  lines.push(`${data.weekCount} bookings so far this week.`);
  if (data.coaches[0]) {
    lines.push(`${data.coaches[0].name} has the most hours this week at ${data.coaches[0].hours.toFixed(1)}.`);
  }
  if (data.courts[0]) {
    lines.push(`${data.courts[0].name} is the busiest court this week.`);
  }
  if (data.emptyCourts.length) {
    lines.push(`${data.emptyCourts.join(", ")} went unbooked all week.`);
  }
  if (data.openWindow) {
    lines.push(`Every court is free ${data.openWindow.label} today.`);
  }
  if (data.requestedShare > 0) {
    lines.push(`${data.requestedShare}% of this week's lessons asked for their pro by name.`);
  }
  return lines.slice(0, WANTED);
}

