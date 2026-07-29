import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { MutationCtx, internalMutation, mutation } from "./_generated/server";
import { colorForIndex } from "./app";

export const DEMO_SLUG = "sea-island-demo";
export const DEMO_PASSWORD = "courtime-demo";

/** Seats the demo club ships with. Sign-in claims one of these by email. */
export const DEMO_MEMBERS = [
  { email: "alex@courtime.demo", displayName: "Alex Giurea", role: "admin" as const },
  { email: "desk@courtime.demo", displayName: "Front Desk", role: "staff" as const },
  { email: "danny@courtime.demo", displayName: "Danny Whitfield", role: "pro" as const },
  { email: "marta@courtime.demo", displayName: "Marta Reyes", role: "pro" as const },
  { email: "ben@courtime.demo", displayName: "Ben Okafor", role: "pro" as const },
];

const COURT_NAMES = [
  "Court 1",
  "Court 2",
  "Court 3",
  "Court 4",
  "Court 5",
  "Court 6",
  "Stadium",
];

const MEMBER_NAMES = [
  "J. Miller",
  "S. Grant",
  "K. Ellis",
  "R. Hayes",
  "T. Brooks",
  "P. Nguyen",
  "L. Castellanos",
  "D. Whitmore",
  "A. Fitzgerald",
  "M. Okonkwo",
  "C. Bianchi",
  "H. Lindqvist",
  "W. Ashford",
  "N. Petrova",
];

const GROUP_SESSIONS = [
  { label: "Junior clinic", type: "Clinic" },
  { label: "Cardio tennis", type: "Group" },
  { label: "Rising Stars", type: "Group" },
  { label: "Ladies drill", type: "Group" },
  { label: "Adult beginners", type: "Clinic" },
  { label: "Elites squad", type: "Group" },
];

function formatClock(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Deterministic PRNG so a reseed reproduces the same demo week. */
function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const RATINGS = ["3.0", "3.5", "3.5", "4.0", "4.0", "4.5"];

const DAY_NOTES = [
  "Humbert would like Ct. 5 whenever it's open.",
  "JPMC account 1000456 — bill the Tuesday clinics here.",
  "Stadium resurfaced Thursday, no play after 2.",
  "Ball machine on Court 4 all morning.",
];

type SeedEntry = {
  courtIndex: number;
  startMin: number;
  endMin: number;
  label: string;
  sessionType: string;
  proIndex: number | null;
  requested: boolean;
};

/**
 * A believable club day: coaches own courts, mornings are private lessons,
 * mid-morning is group work, juniors take the courts after school, and a
 * couple of courts stay open for members to book themselves.
 */
function buildDay(iso: string, proCount: number): SeedEntry[] {
  const rng = makeRng(iso);
  const weekday = weekdayOf(iso);
  const isWeekend = weekday === 0 || weekday === 6;
  const out: SeedEntry[] = [];

  // Coach-owned courts for the day (courts 0..2 get a coach, rest are open play).
  const coachedCourts = [0, 1, 2].map((courtIndex, i) => ({
    courtIndex,
    proIndex: i % proCount,
  }));

  for (const { courtIndex, proIndex } of coachedCourts) {
    let cursor = isWeekend ? 8 * 60 : 7 * 60 + 30;
    const lastStart = isWeekend ? 13 * 60 : 18 * 60;

    while (cursor < lastStart) {
      const roll = rng();

      // Leave the occasional gap — a real book is never wall-to-wall.
      if (roll < 0.18) {
        cursor += 30;
        continue;
      }

      const midMorning = cursor >= 9 * 60 && cursor < 11 * 60 + 30;
      const afterSchool = cursor >= 15 * 60 + 30 && cursor < 18 * 60;
      const wantsGroup = (midMorning || afterSchool) && roll > 0.45;

      if (wantsGroup) {
        const session = GROUP_SESSIONS[Math.floor(rng() * GROUP_SESSIONS.length)];
        const duration = rng() > 0.4 ? 90 : 60;
        out.push({
          courtIndex,
          startMin: cursor,
          endMin: cursor + duration,
          label: session.label,
          sessionType: session.type,
          proIndex,
          requested: false,
        });
        cursor += duration + (rng() > 0.6 ? 30 : 0);
      } else {
        const member = MEMBER_NAMES[Math.floor(rng() * MEMBER_NAMES.length)];
        const duration = rng() > 0.75 ? 90 : 60;
        out.push({
          courtIndex,
          startMin: cursor,
          endMin: cursor + duration,
          label: `Private — ${member}`,
          sessionType: "Private",
          proIndex,
          // Roughly a third of privates are booked with a named pro.
          requested: rng() > 0.66,
        });
        cursor += duration;
      }
    }
  }

  // Coach-less courts: members who booked the court themselves.
  for (const courtIndex of [3, 4]) {
    let cursor = 8 * 60;
    while (cursor < 17 * 60) {
      if (rng() > 0.55) {
        const a = MEMBER_NAMES[Math.floor(rng() * MEMBER_NAMES.length)];
        const b = MEMBER_NAMES[Math.floor(rng() * MEMBER_NAMES.length)];
        out.push({
          courtIndex,
          startMin: cursor,
          endMin: cursor + 60,
          label: a === b ? `${a} — court hold` : `${a} vs ${b}`,
          sessionType: "Member play",
          proIndex: null,
          requested: false,
        });
        cursor += 60;
      }
      cursor += 60;
    }
  }

  return out;
}

async function ensureDemoOrg(ctx: MutationCtx): Promise<Id<"orgs">> {
  const existing = await ctx.db
    .query("orgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
    .first();
  if (existing) return existing._id;

  const orgId = await ctx.db.insert("orgs", {
    // Not the name of a real club. The demo is open to anyone with the URL and
    // is writable by whoever walks in, so it must never be mistaken for — or
    // share a name with — a club that has actual bookings in it.
    name: "Lakeside Racquet Club (demo)",
    slug: DEMO_SLUG,
    dayStartMin: 7 * 60,
    dayEndMin: 19 * 60,
    // The demo lands on Pro so every surface is visible; Settings flips it
    // back to Free to show exactly what the free tier withholds.
    plan: "pro",
    prosCanSeeClub: true,
    onboardingComplete: true,
    isDemo: true,
  });

  for (let i = 0; i < COURT_NAMES.length; i++) {
    await ctx.db.insert("courts", {
      orgId,
      name: COURT_NAMES[i],
      sortOrder: i,
      active: true,
    });
  }

  for (let i = 0; i < DEMO_MEMBERS.length; i++) {
    const member = DEMO_MEMBERS[i];
    await ctx.db.insert("memberships", {
      orgId,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      color: colorForIndex(i),
      active: true,
    });
  }

  return orgId;
}

/**
 * Idempotent: safe to call on every app load. Creates the demo club if it is
 * missing and tops up the rolling window of scheduled days.
 */
export const ensureDemo = mutation({
  args: { todayIso: v.string() },
  handler: async (ctx, args) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.todayIso)) {
      throw new Error("Invalid date");
    }
    const orgId = await ensureDemoOrg(ctx);

    // Already populated for today — nothing to do. Keeps this cheap to call on
    // every visit to the sign-in screen.
    const seededToday = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", orgId).eq("date", args.todayIso),
      )
      .first();
    if (seededToday) return { orgId };

    // Seed a window around today, a few days per transaction.
    const firstDay = addDays(args.todayIso, -3);
    await ctx.scheduler.runAfter(0, internal.seed.seedDays, {
      orgId,
      startIso: firstDay,
      dayCount: 24,
      offset: 0,
    });

    return { orgId };
  },
});

/**
 * Wipe and regenerate the demo club's schedule. Only ever touches the org
 * flagged `isDemo`, which exists to be thrown away — a real club's data is
 * unreachable from here.
 */
export const resetDemo = mutation({
  args: { todayIso: v.string() },
  handler: async (ctx, args) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.todayIso)) throw new Error("Invalid date");
    const org = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
      .first();
    if (!org || !org.isDemo) throw new Error("No demo club to reset");

    await ctx.scheduler.runAfter(0, internal.seed.clearDemoData, {
      orgId: org._id,
      todayIso: args.todayIso,
    });
    return { orgId: org._id };
  },
});

/** Deletes in bounded batches so one transaction can't blow its limits. */
export const clearDemoData = internalMutation({
  args: { orgId: v.id("orgs"), todayIso: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId))
      .take(400);
    for (const entry of entries) await ctx.db.delete("entries", entry._id);

    const rosters = await ctx.db
      .query("clinicRosters")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId))
      .take(400);
    for (const roster of rosters) await ctx.db.delete("clinicRosters", roster._id);

    const notes = await ctx.db
      .query("dayNotes")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", args.orgId))
      .take(200);
    for (const note of notes) await ctx.db.delete("dayNotes", note._id);

    if (entries.length || rosters.length || notes.length) {
      await ctx.scheduler.runAfter(0, internal.seed.clearDemoData, args);
      return null;
    }

    await ctx.scheduler.runAfter(0, internal.seed.seedDays, {
      orgId: args.orgId,
      startIso: addDays(args.todayIso, -3),
      dayCount: 24,
      offset: 0,
    });
    return null;
  },
});

export const seedDays = internalMutation({
  args: {
    orgId: v.id("orgs"),
    startIso: v.string(),
    dayCount: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    const CHUNK = 4;
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(64);
    courts.sort((a, b) => a.sortOrder - b.sortOrder);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);
    const pros = members.filter((m) => m.role === "pro" || m.role === "admin");
    if (!courts.length || !pros.length) return null;

    const end = Math.min(args.offset + CHUNK, args.dayCount);
    for (let i = args.offset; i < end; i++) {
      const iso = addDays(args.startIso, i);

      const already = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) =>
          q.eq("orgId", args.orgId).eq("date", iso),
        )
        .first();
      if (already) continue;

      const rng = makeRng(`${iso}-rosters`);

      for (const seedEntry of buildDay(iso, pros.length)) {
        const court = courts[seedEntry.courtIndex];
        if (!court) continue;
        const entryId = await ctx.db.insert("entries", {
          orgId: args.orgId,
          courtId: court._id,
          date: iso,
          startMin: seedEntry.startMin,
          endMin: seedEntry.endMin,
          label: seedEntry.label,
          sessionType: seedEntry.sessionType,
          requested: seedEntry.requested || undefined,
          proMembershipId:
            seedEntry.proIndex === null ? undefined : pros[seedEntry.proIndex]._id,
          source: "manual",
          updatedAt: Date.now(),
        });

        // The back of the paper: a sign-up sheet behind every group session.
        if (seedEntry.sessionType === "Clinic" || seedEntry.sessionType === "Group") {
          const size = 2 + Math.floor(rng() * 6);
          const participants: {
            name: string;
            phone: string | null;
            rating: string | null;
            note: string | null;
          }[] = [];
          const used = new Set<string>();
          for (let i = 0; i < size; i++) {
            const name = MEMBER_NAMES[Math.floor(rng() * MEMBER_NAMES.length)];
            if (used.has(name)) continue;
            used.add(name);
            participants.push({
              name,
              phone: `${Math.floor(rng() * 800) + 200}-${Math.floor(rng() * 800) + 200}-${String(Math.floor(rng() * 10000)).padStart(4, "0")}`,
              rating: RATINGS[Math.floor(rng() * RATINGS.length)],
              note: null,
            });
          }
          await ctx.db.insert("clinicRosters", {
            orgId: args.orgId,
            date: iso,
            title: `${seedEntry.label} — ${formatClock(seedEntry.startMin)}`,
            startMin: seedEntry.startMin,
            endMin: seedEntry.endMin,
            entryId,
            participants,
            updatedAt: Date.now(),
          });
        }
      }

      // Not every day has something written in the notes column.
      if (rng() > 0.55) {
        await ctx.db.insert("dayNotes", {
          orgId: args.orgId,
          date: iso,
          body: DAY_NOTES[Math.floor(rng() * DAY_NOTES.length)],
          updatedAt: Date.now(),
        });
      }
    }

    if (end < args.dayCount) {
      await ctx.scheduler.runAfter(0, internal.seed.seedDays, {
        orgId: args.orgId,
        startIso: args.startIso,
        dayCount: args.dayCount,
        offset: end,
      });
    }
    return null;
  },
});
