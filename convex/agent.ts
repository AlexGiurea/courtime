import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  ActionCtx,
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { currentMembership } from "./authz";
import { formatTime } from "./schedule";

const SLOT = 30;

function minutesFrom(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Internal data access. The action has no ctx.db, so every tool goes through
// one of these — which also means every tool inherits the same role checks the
// rest of the app uses.
// ---------------------------------------------------------------------------

export const context = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!membership || !membership.active) return null;
    const org = await ctx.db.get("orgs", membership.orgId);
    if (!org) return null;
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(200);
    return {
      membership,
      org,
      courts: courts
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ id: c._id as string, name: c.name })),
      members: members
        .filter((m) => m.active && m.role !== "staff")
        .map((m) => ({ id: m._id as string, name: m.displayName })),
    };
  },
});

export const bookingsOn = internalQuery({
  args: {
    orgId: v.id("orgs"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q
          .eq("orgId", args.orgId)
          .gte("date", args.startDate)
          .lte("date", args.endDate),
      )
      .take(600);
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(64);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(200);
    const courtName = new Map(courts.map((c) => [c._id as string, c.name]));
    const memberName = new Map(members.map((m) => [m._id as string, m.displayName]));

    return entries
      .sort((a, b) =>
        a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1,
      )
      .map((entry) => ({
        bookingId: entry._id as string,
        date: entry.date,
        court: courtName.get(entry.courtId as string) ?? "?",
        start: formatTime(entry.startMin),
        end: formatTime(entry.endMin),
        startMin: entry.startMin,
        endMin: entry.endMin,
        label: entry.label,
        coach: entry.proMembershipId
          ? (memberName.get(entry.proMembershipId as string) ?? null)
          : null,
        coachId: (entry.proMembershipId as string | undefined) ?? null,
      }));
  },
});

export const applyCreate = internalMutation({
  args: {
    orgId: v.id("orgs"),
    userId: v.id("users"),
    date: v.string(),
    courtId: v.id("courts"),
    startMin: v.number(),
    endMin: v.number(),
    label: v.string(),
    proMembershipId: v.optional(v.id("memberships")),
  },
  handler: async (ctx, args) => {
    const sameDay = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", args.orgId).eq("date", args.date),
      )
      .take(500);
    const clash = sameDay.find(
      (entry) =>
        entry.courtId === args.courtId &&
        args.startMin < entry.endMin &&
        args.endMin > entry.startMin,
    );
    if (clash) {
      return { ok: false as const, error: `That court is already booked (${clash.label}).` };
    }

    const court = await ctx.db.get("courts", args.courtId);
    const entryId = await ctx.db.insert("entries", {
      orgId: args.orgId,
      courtId: args.courtId,
      date: args.date,
      startMin: args.startMin,
      endMin: args.endMin,
      label: args.label,
      proMembershipId: args.proMembershipId,
      source: "manual",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("entryChanges", {
      orgId: args.orgId,
      entryId,
      changeType: "created",
      summary: `${args.label} added — ${court?.name ?? "court"}, ${formatTime(args.startMin)}`,
      date: args.date,
      affectedMembershipIds: args.proMembershipId ? [args.proMembershipId] : [],
      byUserId: args.userId,
    });

    if (args.proMembershipId) {
      await ctx.scheduler.runAfter(0, internal.pushNode.deliver, {
        membershipIds: [args.proMembershipId],
        title: "Schedule updated",
        body: `${args.label} added — ${court?.name ?? "court"}, ${formatTime(args.startMin)}`,
      });
    }

    return { ok: true as const, bookingId: entryId as string };
  },
});

export const applyUpdate = internalMutation({
  args: {
    orgId: v.id("orgs"),
    userId: v.id("users"),
    entryId: v.id("entries"),
    courtId: v.optional(v.id("courts")),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    label: v.optional(v.string()),
    proMembershipId: v.optional(v.union(v.id("memberships"), v.null())),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== args.orgId) {
      return { ok: false as const, error: "That booking no longer exists." };
    }

    const courtId = args.courtId ?? entry.courtId;
    const startMin = args.startMin ?? entry.startMin;
    const endMin = args.endMin ?? entry.endMin;
    if (endMin <= startMin) {
      return { ok: false as const, error: "A booking has to end after it starts." };
    }

    const sameDay = await ctx.db
      .query("entries")
      .withIndex("by_org_and_date", (q) =>
        q.eq("orgId", args.orgId).eq("date", entry.date),
      )
      .take(500);
    const clash = sameDay.find(
      (other) =>
        other._id !== entry._id &&
        other.courtId === courtId &&
        startMin < other.endMin &&
        endMin > other.startMin,
    );
    if (clash) {
      return { ok: false as const, error: `That slot is taken (${clash.label}).` };
    }

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
      ...(args.label ? { label: args.label } : {}),
      proMembershipId: nextPro,
      updatedAt: Date.now(),
    });

    const court = await ctx.db.get("courts", courtId);
    const label = args.label ?? entry.label;
    const affected = new Set<Id<"memberships">>();
    if (entry.proMembershipId) affected.add(entry.proMembershipId);
    if (nextPro) affected.add(nextPro);
    const summary = `${label} moved to ${court?.name ?? "court"}, ${formatTime(startMin)}`;

    await ctx.db.insert("entryChanges", {
      orgId: args.orgId,
      entryId: args.entryId,
      changeType: "moved",
      summary,
      date: entry.date,
      affectedMembershipIds: [...affected],
      byUserId: args.userId,
    });

    if (affected.size) {
      await ctx.scheduler.runAfter(0, internal.pushNode.deliver, {
        membershipIds: [...affected],
        title: "Schedule updated",
        body: summary,
      });
    }

    return { ok: true as const, summary };
  },
});

export const applyDelete = internalMutation({
  args: {
    orgId: v.id("orgs"),
    userId: v.id("users"),
    entryId: v.id("entries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get("entries", args.entryId);
    if (!entry || entry.orgId !== args.orgId) {
      return { ok: false as const, error: "That booking no longer exists." };
    }
    const court = await ctx.db.get("courts", entry.courtId);
    await ctx.db.delete("entries", args.entryId);

    const summary = `${entry.label} cancelled — ${court?.name ?? "court"}, ${formatTime(entry.startMin)}`;
    await ctx.db.insert("entryChanges", {
      orgId: args.orgId,
      changeType: "deleted",
      summary,
      date: entry.date,
      affectedMembershipIds: entry.proMembershipId ? [entry.proMembershipId] : [],
      byUserId: args.userId,
    });

    if (entry.proMembershipId) {
      await ctx.scheduler.runAfter(0, internal.pushNode.deliver, {
        membershipIds: [entry.proMembershipId],
        title: "Schedule updated",
        body: summary,
      });
    }

    return { ok: true as const, summary };
  },
});

/** What the launcher reads to decide whether to show itself, and as what. */
export const availability = query({
  args: {},
  handler: async (ctx) => {
    const membership = await currentMembership(ctx);
    if (!membership) {
      return {
        signedIn: false,
        pro: false,
        canWrite: false,
        firstName: "",
        voice: false,
      };
    }
    const org = await ctx.db.get("orgs", membership.orgId);
    return {
      signedIn: true,
      pro: org?.plan === "pro",
      canWrite: membership.role !== "pro",
      firstName: membership.displayName.split(/\s+/)[0] ?? "",
      // Voice needs the same key the text agent uses; deployments without it
      // simply don't offer the mic rather than failing on the first tap.
      voice: Boolean(process.env.OPENAI_API_KEY),
    };
  },
});

// ---------------------------------------------------------------------------
// Tools. One definition list, one executor — the text loop and the realtime
// voice session both go through them, so behaviour can't drift between the two.
// ---------------------------------------------------------------------------

export type AgentTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const READ_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "list_bookings",
      description:
        "List bookings between two dates. Always call this before moving or cancelling anything, so you have the bookingId.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "YYYY-MM-DD" },
          endDate: { type: "string", description: "YYYY-MM-DD" },
          coachName: {
            type: "string",
            description: "Optional: only bookings taught by this coach.",
          },
        },
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_open_slots",
      description:
        "Find gaps on a given day where a court is free for a given number of minutes.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          durationMin: { type: "number", description: "Length needed, in minutes." },
          courtName: { type: "string", description: "Optional: restrict to one court." },
        },
        required: ["date", "durationMin"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "coach_hours",
      description: "Total taught hours and session counts per coach across a date range.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["startDate", "endDate"],
        additionalProperties: false,
      },
    },
  },
];

export const WRITE_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Put a new booking on the schedule.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          courtName: { type: "string" },
          startTime: { type: "string", description: "24-hour HH:MM, on a 30-minute boundary" },
          endTime: { type: "string", description: "24-hour HH:MM, on a 30-minute boundary" },
          label: { type: "string", description: "What the booking is, e.g. 'Private — J. Miller'" },
          coachName: {
            type: "string",
            description: "Optional. Leave empty for member self-play with no coach.",
          },
        },
        required: ["date", "courtName", "startTime", "endTime", "label"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_booking",
      description:
        "Change an existing booking's court, time, coach or name. Get bookingId from list_bookings first.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string" },
          courtName: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          label: { type: "string" },
          coachName: { type: "string", description: "Use 'none' to remove the coach." },
        },
        required: ["bookingId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Remove a booking. Get bookingId from list_bookings first.",
      parameters: {
        type: "object",
        properties: { bookingId: { type: "string" } },
        required: ["bookingId"],
        additionalProperties: false,
      },
    },
  },
];

/** The tools a caller is allowed to see at all. A coach never gets the writes. */
export function toolsFor(canWrite: boolean): AgentTool[] {
  return canWrite ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
}

export type ClubContext = {
  membership: Doc<"memberships">;
  org: Doc<"orgs">;
  courts: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

/**
 * Everything a tool call needs, all of it derived server-side from the session.
 * Nothing in here is ever taken from the client — the browser only says which
 * tool to run and with what arguments.
 */
export type ToolSession = {
  userId: Id<"users">;
  club: ClubContext;
  canWrite: boolean;
  todayIso: string;
};

export type SessionResult =
  | { ok: true; session: ToolSession }
  | { ok: false; error: string };

/**
 * Identity, club and role for the caller. Both entry points (the text `chat`
 * loop and the voice session) start here, so the Pro gate and the role rules
 * are stated exactly once.
 */
export async function loadSession(
  ctx: ActionCtx,
  todayIso: string,
): Promise<SessionResult> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return { ok: false, error: "You're signed out." };

  const club = await ctx.runQuery(internal.agent.context, { userId });
  if (!club) return { ok: false, error: "You're not part of a club yet." };
  if (club.org.plan !== "pro") {
    return { ok: false, error: "The assistant is part of the Pro plan." };
  }

  return {
    ok: true,
    session: {
      userId,
      club,
      canWrite: club.membership.role !== "pro",
      todayIso,
    },
  };
}

function courtByName(club: ClubContext, name: unknown) {
  if (typeof name !== "string") return undefined;
  const norm = normalize(name);
  return (
    club.courts.find((c) => normalize(c.name) === norm) ??
    club.courts.find((c) => normalize(c.name) === `court${norm}`) ??
    club.courts.find((c) => normalize(c.name).includes(norm) && norm.length > 1)
  );
}

function coachByName(club: ClubContext, name: unknown) {
  if (typeof name !== "string" || !name.trim()) return undefined;
  const norm = normalize(name);
  return (
    club.members.find((m) => normalize(m.name) === norm) ??
    club.members.find((m) => normalize(m.name.split(/\s+/)[0]) === norm) ??
    club.members.find((m) => normalize(m.name).startsWith(norm) && norm.length >= 3)
  );
}

export type ToolOutcome = { result: unknown; changed: boolean };

/**
 * The single implementation of "run tool X with args Y". The text loop feeds it
 * parsed tool_call arguments; the voice client feeds it the realtime model's
 * function-call arguments through `invokeTool`. There is deliberately no second
 * copy of this dispatch anywhere.
 */
export async function executeTool(
  ctx: ActionCtx,
  session: ToolSession,
  name: string,
  parsed: Record<string, unknown>,
): Promise<ToolOutcome> {
  const { club, userId, canWrite, todayIso } = session;
  const orgId = club.org._id;

  if (name === "list_bookings") {
    const rows = await ctx.runQuery(internal.agent.bookingsOn, {
      orgId,
      startDate: String(parsed.startDate ?? todayIso),
      endDate: String(parsed.endDate ?? parsed.startDate ?? todayIso),
    });
    const coach = coachByName(club, parsed.coachName);
    const filtered = parsed.coachName
      ? rows.filter((r) => r.coachId === coach?.id)
      : rows;
    // A coach only ever sees their own column through the assistant.
    const scoped = canWrite
      ? filtered
      : filtered.filter((r) => r.coachId === (club.membership._id as string));
    return { result: { bookings: scoped.slice(0, 120) }, changed: false };
  }

  if (name === "find_open_slots") {
    const date = String(parsed.date ?? todayIso);
    const duration = Math.max(SLOT, Number(parsed.durationMin) || 60);
    const rows = await ctx.runQuery(internal.agent.bookingsOn, {
      orgId,
      startDate: date,
      endDate: date,
    });
    const only = courtByName(club, parsed.courtName);
    const courts = only ? [only] : club.courts;
    const open: { court: string; from: string; to: string }[] = [];

    for (const court of courts) {
      const taken = rows
        .filter((r) => r.court === court.name)
        .sort((a, b) => a.startMin - b.startMin);
      let cursor = club.org.dayStartMin;
      for (const booking of [
        ...taken,
        { startMin: club.org.dayEndMin, endMin: club.org.dayEndMin },
      ]) {
        if (booking.startMin - cursor >= duration) {
          open.push({
            court: court.name,
            from: formatTime(cursor),
            to: formatTime(booking.startMin),
          });
        }
        cursor = Math.max(cursor, booking.endMin);
      }
    }
    return { result: { date, openWindows: open.slice(0, 40) }, changed: false };
  }

  if (name === "coach_hours") {
    const rows = await ctx.runQuery(internal.agent.bookingsOn, {
      orgId,
      startDate: String(parsed.startDate ?? todayIso),
      endDate: String(parsed.endDate ?? todayIso),
    });
    const tally = new Map<string, { sessions: number; minutes: number }>();
    for (const row of rows) {
      if (!row.coach) continue;
      const current = tally.get(row.coach) ?? { sessions: 0, minutes: 0 };
      tally.set(row.coach, {
        sessions: current.sessions + 1,
        minutes: current.minutes + (row.endMin - row.startMin),
      });
    }
    return {
      result: {
        coaches: [...tally.entries()].map(([coach, value]) => ({
          coach,
          sessions: value.sessions,
          hours: Number((value.minutes / 60).toFixed(1)),
        })),
      },
      changed: false,
    };
  }

  if (!canWrite) {
    return {
      result: { error: "Only the front desk can change the schedule." },
      changed: false,
    };
  }

  if (name === "create_booking") {
    const court = courtByName(club, parsed.courtName);
    if (!court) {
      return {
        result: { error: `There is no court called "${parsed.courtName}".` },
        changed: false,
      };
    }
    const startMin = minutesFrom(parsed.startTime);
    const endMin = minutesFrom(parsed.endTime);
    if (startMin === null || endMin === null) {
      return { result: { error: "Times must look like 14:30." }, changed: false };
    }
    const coach = coachByName(club, parsed.coachName);
    const result = await ctx.runMutation(internal.agent.applyCreate, {
      orgId,
      userId,
      date: String(parsed.date ?? todayIso),
      courtId: court.id as Id<"courts">,
      startMin,
      endMin,
      label: String(parsed.label ?? "Booking"),
      proMembershipId: coach ? (coach.id as Id<"memberships">) : undefined,
    });
    return { result, changed: result.ok };
  }

  if (name === "move_booking") {
    const bookingId = String(parsed.bookingId ?? "");
    if (!bookingId) {
      return {
        result: { error: "Which booking? Call list_bookings first." },
        changed: false,
      };
    }
    const court = courtByName(club, parsed.courtName);
    const startMin = minutesFrom(parsed.startTime);
    const endMin = minutesFrom(parsed.endTime);
    const coachRaw = typeof parsed.coachName === "string" ? parsed.coachName : undefined;
    const clearCoach = coachRaw && /^(none|no coach|nobody)$/i.test(coachRaw.trim());
    const coach = clearCoach ? undefined : coachByName(club, coachRaw);

    const result = await ctx.runMutation(internal.agent.applyUpdate, {
      orgId,
      userId,
      entryId: bookingId as Id<"entries">,
      ...(court ? { courtId: court.id as Id<"courts"> } : {}),
      ...(startMin !== null ? { startMin } : {}),
      ...(endMin !== null ? { endMin } : {}),
      ...(typeof parsed.label === "string" && parsed.label
        ? { label: parsed.label }
        : {}),
      ...(clearCoach
        ? { proMembershipId: null }
        : coach
          ? { proMembershipId: coach.id as Id<"memberships"> }
          : {}),
    });
    return { result, changed: result.ok };
  }

  if (name === "cancel_booking") {
    const bookingId = String(parsed.bookingId ?? "");
    if (!bookingId) {
      return {
        result: { error: "Which booking? Call list_bookings first." },
        changed: false,
      };
    }
    const result = await ctx.runMutation(internal.agent.applyDelete, {
      orgId,
      userId,
      entryId: bookingId as Id<"entries">,
    });
    return { result, changed: result.ok };
  }

  return { result: { error: `Unknown tool ${name}` }, changed: false };
}

/** Parse-then-dispatch, so both entry points fail the same way on bad JSON. */
export async function runToolCall(
  ctx: ActionCtx,
  session: ToolSession,
  name: string,
  rawArgs: string,
): Promise<ToolOutcome> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    return {
      result: { error: "Could not read the tool arguments." },
      changed: false,
    };
  }
  return executeTool(ctx, session, name, parsed);
}

/** Shared preamble: the same club facts whether Tempo is read or spoken. */
export function clubBriefing(session: ToolSession): string[] {
  const { club, todayIso, canWrite } = session;
  return [
    `You are Tempo, the scheduling assistant inside Courtime, used by ${club.org.name}.`,
    `Today is ${todayIso}. Resolve relative dates like "tomorrow" or "next Tuesday" against it.`,
    `Courts: ${club.courts.map((c) => c.name).join(", ")}.`,
    `Coaches: ${club.members.map((m) => m.name).join(", ") || "none on file"}.`,
    `The club's day runs ${formatTime(club.org.dayStartMin)} to ${formatTime(club.org.dayEndMin)} and everything sits on a 30-minute grid.`,
    `You are talking to ${club.membership.displayName}, whose role is ${club.membership.role}.`,
    canWrite
      ? "You may change the schedule. Make the change, then say plainly what you did."
      : "You can only read the schedule. If asked to change something, say the front desk has to make that change.",
    "Always call list_bookings to get a bookingId before moving or cancelling anything. Never invent a bookingId.",
    "If a request is ambiguous about which booking is meant, ask one short clarifying question instead of guessing.",
  ];
}

// ---------------------------------------------------------------------------
// The assistant itself.
// ---------------------------------------------------------------------------

export const chat = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    todayIso: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ reply: string; changed: boolean; error?: string }> => {
    const loaded = await loadSession(ctx, args.todayIso);
    if (!loaded.ok) return { reply: "", changed: false, error: loaded.error };
    const session = loaded.session;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        reply: "",
        changed: false,
        error: "The assistant isn't configured on this deployment.",
      };
    }

    const tools = toolsFor(session.canWrite);
    const system = [
      ...clubBriefing(session),
      "Be brief and concrete — one or two sentences, no preamble, no bullet lists unless you are listing bookings.",
    ].join("\n");

    type ChatMessage = {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }[];
      tool_call_id?: string;
    };

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...args.messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
    ];

    let changed = false;
    const model = process.env.OPENAI_AGENT_MODEL || "gpt-5.6-luna";

    // Tool loop. Bounded so a confused model can't spend the club's money.
    for (let turn = 0; turn < 6; turn++) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // reasoning_effort must be "none" to use function tools on
        // /v1/chat/completions with this model family; any other value is
        // rejected outright. (vision.ts keeps "low" — that call has no tools.)
        body: JSON.stringify({
          model,
          reasoning_effort: "none",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          reply: "",
          changed,
          error: `The assistant is unavailable (${response.status}). ${text.slice(0, 140)}`,
        };
      }

      const data = await response.json();
      const choice = data?.choices?.[0]?.message;
      if (!choice) return { reply: "", changed, error: "Empty response." };

      const toolCalls = choice.tool_calls ?? [];
      messages.push({
        role: "assistant",
        content: choice.content ?? null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });

      if (!toolCalls.length) {
        return {
          reply: (choice.content ?? "").trim() || "Done.",
          changed,
        };
      }

      for (const call of toolCalls) {
        const outcome = await runToolCall(
          ctx,
          session,
          call.function.name,
          call.function.arguments,
        );
        changed = changed || outcome.changed;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(outcome.result),
        });
      }
    }

    return {
      reply: "",
      changed,
      error: "That took more steps than expected — try asking for one thing at a time.",
    };
  },
});

/**
 * The voice path's way into the tools. The realtime model runs in the browser,
 * so the browser is what tells us a function was called — but it never tells us
 * *who* is calling. Identity, club, role and the tool allow-list are all
 * re-derived here from the session cookie, exactly as `chat` does.
 */
export const invokeTool = action({
  args: {
    name: v.string(),
    /** Raw JSON arguments as the realtime model emitted them. */
    args: v.string(),
    todayIso: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ output: string; changed: boolean }> => {
    const loaded = await loadSession(ctx, args.todayIso);
    if (!loaded.ok) {
      return { output: JSON.stringify({ error: loaded.error }), changed: false };
    }
    const session = loaded.session;

    const allowed = toolsFor(session.canWrite).some(
      (tool) => tool.function.name === args.name,
    );
    if (!allowed) {
      return {
        output: JSON.stringify({ error: `Unknown tool ${args.name}` }),
        changed: false,
      };
    }

    const outcome = await runToolCall(ctx, session, args.name, args.args);
    return {
      output: JSON.stringify(outcome.result).slice(0, 16000),
      changed: outcome.changed,
    };
  },
});
