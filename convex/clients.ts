import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, mutation, query } from "./_generated/server";
import { currentMembership, requireMembership } from "./authz";
import { formatTime } from "./schedule";

/**
 * Client profiles, built out of a paper book.
 *
 * A client is not a user and never will be — they are a name someone wrote in a
 * column. So identity is *derived*, and the two rules that keep that honest are:
 *
 *   1. **Nothing is ever rewritten.** A booking's label stays exactly as the
 *      desk wrote it. The association lives in `clientLinks` beside it, so a
 *      wrong guess is one row to delete rather than a corrupted booking.
 *   2. **Resolution is a pure function, not a model call.** Normalise, match on
 *      surname plus initial, and only claim a link when it is unambiguous.
 *      Cheap, explainable when it is wrong, and no model in the write path of
 *      a club's schedule.
 *
 * Clinic sheets are the seed population: they already carry a name, a phone and
 * an NTRP rating, so those links are `high` confidence by construction. Grid
 * bookings are matched against that population afterwards.
 */

/** "Private — P. Nguyen", "P. Nguyen vs L. Castellanos", "Rising Stars". */
const SESSION_WORDS =
  /^(private|lesson|clinic|group|drill|cardio|squad|semi|match|court hold|hold|open play|ball machine)\b/i;

/** Names the book uses that aren't people. */
const NOT_A_NAME = /^(open play|court hold|maintenance|blocked|hold|closed)$/i;

/**
 * Pull the people out of a booking label. The book writes one of a few shapes:
 * "Private — P. Nguyen", "P. Nguyen vs L. Castellanos", "Private (R. Hayes)".
 */
export function namesFromLabel(label: string): string[] {
  let text = label.trim();

  // Drop a leading session word and its separator: "Private — ", "Clinic: ".
  text = text.replace(/^[^—\-:(]+[—\-:(]\s*/, (match) =>
    SESSION_WORDS.test(match) ? "" : match,
  );
  text = text.replace(/\)$/, "");

  const parts = text
    .split(/\s+(?:vs\.?|v\.|&|and|\+)\s+/i)
    .map((part) => part.replace(/[()]/g, "").trim())
    .filter(Boolean);

  return parts.filter(
    (part) =>
      part.length >= 3 &&
      !NOT_A_NAME.test(part) &&
      !SESSION_WORDS.test(part) &&
      /[a-z]/i.test(part),
  );
}

/**
 * Surname plus first initial, lowercased. "P. Nguyen", "Nguyen, P" and
 * "Phuong Nguyen" all land on "nguyen|p"; a bare "Nguyen" lands on "nguyen|",
 * which matches a single Nguyen and stays ambiguous when there are two.
 */
export function matchKeyFor(name: string): string {
  const cleaned = name
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "";
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 1) return `${words[0]}|`;
  const surname = words[words.length - 1];
  const initial = words[0][0] ?? "";
  return `${surname}|${initial}`;
}

async function findOrCreateClient(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  name: string,
  extras: { phone?: string; rating?: string },
): Promise<Id<"clients"> | null> {
  const key = matchKeyFor(name);
  if (!key || key === "|") return null;

  const candidates = await ctx.db
    .query("clients")
    .withIndex("by_org_and_key", (q) => q.eq("orgId", orgId).eq("matchKey", key))
    .take(10);

  const live = candidates.filter((c) => !c.mergedInto);
  if (live.length === 1) {
    const client = live[0];
    const patch: Partial<Doc<"clients">> = {};
    if (!client.aliases.includes(name)) {
      patch.aliases = [...client.aliases, name].slice(0, 12);
    }
    // A phone or rating from a sign-up sheet is better than nothing on file.
    if (!client.phone && extras.phone) patch.phone = extras.phone;
    if (!client.rating && extras.rating) patch.rating = extras.rating;
    if (Object.keys(patch).length) await ctx.db.patch("clients", client._id, patch);
    return client._id;
  }

  // Two people share a key. Don't guess — leave the booking unlinked and let
  // the desk say which one it is.
  if (live.length > 1) return null;

  return await ctx.db.insert("clients", {
    orgId,
    displayName: name,
    aliases: [name],
    matchKey: key,
    phone: extras.phone,
    rating: extras.rating,
    createdAt: Date.now(),
  });
}

/**
 * Link one booking to whoever is named on it. Called from the entry mutations,
 * so a profile is current the moment the desk writes a booking.
 */
export async function linkEntry(
  ctx: MutationCtx,
  entry: Doc<"entries">,
): Promise<void> {
  const existing = await ctx.db
    .query("clientLinks")
    .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
    .take(10);
  for (const link of existing) await ctx.db.delete("clientLinks", link._id);

  for (const name of namesFromLabel(entry.label)) {
    const clientId = await findOrCreateClient(ctx, entry.orgId, name, {});
    if (!clientId) continue;
    await ctx.db.insert("clientLinks", {
      orgId: entry.orgId,
      clientId,
      entryId: entry._id,
      date: entry.date,
      source: "matched",
      confidence: "high",
    });
  }
}

export async function unlinkEntry(
  ctx: MutationCtx,
  entryId: Id<"entries">,
): Promise<void> {
  const existing = await ctx.db
    .query("clientLinks")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .take(10);
  for (const link of existing) await ctx.db.delete("clientLinks", link._id);
}

/** Everyone on a clinic sheet, which is the structured half of the data. */
export async function linkRoster(
  ctx: MutationCtx,
  roster: Doc<"clinicRosters">,
): Promise<void> {
  for (const person of roster.participants) {
    const clientId = await findOrCreateClient(ctx, roster.orgId, person.name, {
      phone: person.phone ?? undefined,
      rating: person.rating ?? undefined,
    });
    if (!clientId) continue;
    const already = await ctx.db
      .query("clientLinks")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .take(400);
    if (already.some((link) => link.rosterId === roster._id)) continue;
    await ctx.db.insert("clientLinks", {
      orgId: roster.orgId,
      clientId,
      rosterId: roster._id,
      date: roster.date,
      source: "roster",
      confidence: "high",
    });
  }
}

/* ------------------------------ reading ------------------------------ */

export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership || membership.role === "pro") return null;

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(2000);

    const needle = (args.search ?? "").trim().toLowerCase();
    const matching = clients
      .filter((client) => !client.mergedInto)
      .filter(
        (client) =>
          !needle ||
          client.displayName.toLowerCase().includes(needle) ||
          client.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
          (client.phone ?? "").includes(needle),
      );

    const links = await ctx.db
      .query("clientLinks")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", membership.orgId))
      .take(8000);

    const counts = new Map<string, { visits: number; last: string }>();
    for (const link of links) {
      const current = counts.get(link.clientId as string);
      counts.set(link.clientId as string, {
        visits: (current?.visits ?? 0) + 1,
        last: current && current.last > link.date ? current.last : link.date,
      });
    }

    return matching
      .map((client) => ({
        _id: client._id,
        displayName: client.displayName,
        phone: client.phone ?? null,
        rating: client.rating ?? null,
        visits: counts.get(client._id as string)?.visits ?? 0,
        lastSeen: counts.get(client._id as string)?.last ?? null,
      }))
      .sort((a, b) => b.visits - a.visits || a.displayName.localeCompare(b.displayName))
      .slice(0, 300);
  },
});

/**
 * One client, everything the club knows. The relationship numbers — who they
 * ask for, how often they come — are the part no system a club already owns
 * can produce, because they come off the asterisk on the paper page.
 */
export const profile = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership || membership.role === "pro") return null;

    const client = await ctx.db.get("clients", args.clientId);
    if (!client || client.orgId !== membership.orgId) return null;

    const links = await ctx.db
      .query("clientLinks")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .take(1000);

    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(200);
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);
    const coachName = new Map(members.map((m) => [m._id as string, m.displayName]));
    const courtName = new Map(courts.map((c) => [c._id as string, c.name]));

    const sessions: {
      date: string;
      label: string;
      court: string | null;
      coach: string | null;
      coachId: string | null;
      time: string | null;
      requested: boolean;
      kind: "booking" | "clinic";
    }[] = [];

    for (const link of links) {
      if (link.entryId) {
        const entry = await ctx.db.get("entries", link.entryId);
        if (!entry) continue;
        sessions.push({
          date: entry.date,
          label: entry.label,
          court: courtName.get(entry.courtId as string) ?? null,
          coach: entry.proMembershipId
            ? (coachName.get(entry.proMembershipId as string) ?? null)
            : null,
          coachId: (entry.proMembershipId as string) ?? null,
          time: formatTime(entry.startMin),
          requested: Boolean(entry.requested),
          kind: "booking",
        });
      } else if (link.rosterId) {
        const roster = await ctx.db.get("clinicRosters", link.rosterId);
        if (!roster) continue;
        sessions.push({
          date: roster.date,
          label: roster.title,
          court: null,
          coach: null,
          coachId: null,
          time: roster.startMin !== undefined ? formatTime(roster.startMin) : null,
          requested: false,
          kind: "clinic",
        });
      }
    }

    sessions.sort((a, b) => b.date.localeCompare(a.date));

    const withCoach = sessions.filter((s) => s.coachId);
    const byCoach = new Map<string, { name: string; count: number; requested: number }>();
    for (const session of withCoach) {
      const current = byCoach.get(session.coachId!) ?? {
        name: session.coach ?? "A coach",
        count: 0,
        requested: 0,
      };
      current.count += 1;
      if (session.requested) current.requested += 1;
      byCoach.set(session.coachId!, current);
    }

    const coaches = [...byCoach.values()].sort((a, b) => b.count - a.count);

    return {
      client: {
        _id: client._id,
        displayName: client.displayName,
        aliases: client.aliases,
        phone: client.phone ?? null,
        rating: client.rating ?? null,
        note: client.note ?? null,
      },
      sessions: sessions.slice(0, 200),
      totals: {
        visits: sessions.length,
        bookings: sessions.filter((s) => s.kind === "booking").length,
        clinics: sessions.filter((s) => s.kind === "clinic").length,
        requested: sessions.filter((s) => s.requested).length,
        firstSeen: sessions.length ? sessions[sessions.length - 1].date : null,
        lastSeen: sessions.length ? sessions[0].date : null,
      },
      coaches,
    };
  },
});

export const update = mutation({
  args: {
    clientId: v.id("clients"),
    displayName: v.optional(v.string()),
    phone: v.optional(v.string()),
    rating: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const client = await ctx.db.get("clients", args.clientId);
    if (!client || client.orgId !== membership.orgId) throw new Error("Unknown client");
    const { clientId, ...rest } = args;
    await ctx.db.patch("clients", clientId, {
      ...rest,
      ...(rest.displayName ? { matchKey: matchKeyFor(rest.displayName) } : {}),
    });
    return null;
  },
});

/**
 * Fold one record into another when the book turns out to have been writing two
 * spellings of the same person. Links move; nothing is deleted.
 */
export const merge = mutation({
  args: { keepId: v.id("clients"), mergeId: v.id("clients") },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    if (args.keepId === args.mergeId) return null;
    const keep = await ctx.db.get("clients", args.keepId);
    const gone = await ctx.db.get("clients", args.mergeId);
    if (!keep || !gone || keep.orgId !== membership.orgId || gone.orgId !== membership.orgId) {
      throw new Error("Unknown client");
    }

    const links = await ctx.db
      .query("clientLinks")
      .withIndex("by_client", (q) => q.eq("clientId", args.mergeId))
      .take(1000);
    for (const link of links) {
      await ctx.db.patch("clientLinks", link._id, { clientId: args.keepId });
    }

    await ctx.db.patch("clients", args.keepId, {
      aliases: [...new Set([...keep.aliases, ...gone.aliases])].slice(0, 20),
      phone: keep.phone ?? gone.phone,
      rating: keep.rating ?? gone.rating,
    });
    await ctx.db.patch("clients", args.mergeId, { mergedInto: args.keepId });
    return null;
  },
});

/**
 * Build the population from what the club already has. Idempotent — running it
 * twice links the same rows to the same people.
 */
export const backfill = mutation({
  args: {},
  handler: async (ctx) => {
    const membership = await requireMembership(ctx, "staff");

    // Sheets first: they carry phone numbers and ratings, so the people they
    // create are the richest records, and the grid matches against them.
    const rosters = await ctx.db
      .query("clinicRosters")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", membership.orgId))
      .take(2000);
    for (const roster of rosters) await linkRoster(ctx, roster);

    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) => q.eq("orgId", membership.orgId))
      .take(4000);
    for (const entry of entries) await linkEntry(ctx, entry);

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(2000);
    return { clients: clients.filter((c) => !c.mergedInto).length };
  },
});
