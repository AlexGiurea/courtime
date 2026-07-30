import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Times are minutes-from-midnight, snapped to 30-minute slots (the paper grid's
// granularity). Dates are "YYYY-MM-DD" strings so a day is a single index key.

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("staff"),
  v.literal("pro"),
);

export const pageStatusValidator = v.union(
  v.literal("queued"),
  v.literal("extracting"),
  v.literal("verifying"),
  v.literal("needs_review"),
  v.literal("confirmed"),
  v.literal("failed"),
);

/** The book has two kinds of page: the court grid, and the clinic sign-up sheet. */
export const pageKindValidator = v.union(
  v.literal("schedule"),
  v.literal("clinics"),
);

/** One person signed up for a clinic, as written on the sheet. */
export const clinicParticipantValidator = v.object({
  name: v.string(),
  phone: v.union(v.string(), v.null()),
  // NTRP rating written in the left margin, e.g. "4.0".
  rating: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  // Past the clinic's capacity. Kept in the same list, in order, because the
  // paper sheet works the same way — names below the line are still names on
  // the sheet, and someone dropping out promotes the next one.
  waitlisted: v.optional(v.boolean()),
});

export const clinicDraftValidator = v.object({
  title: v.string(),
  startMin: v.union(v.number(), v.null()),
  endMin: v.union(v.number(), v.null()),
  participants: v.array(clinicParticipantValidator),
  issue: v.union(v.string(), v.null()),
});

// One parsed booking as the vision model returns it, before a human confirms it.
// `suggested*` are the server's best match against the club's real courts and
// staff; the review UI shows them as pre-filled pickers the human can correct.
export const draftEntryValidator = v.object({
  courtName: v.string(),
  startMin: v.number(),
  endMin: v.number(),
  label: v.string(),
  coachName: v.union(v.string(), v.null()),
  sessionType: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  // The asterisk beside the booking: this client asked for this pro.
  requested: v.optional(v.boolean()),
  confidence: v.union(v.literal("high"), v.literal("low")),
  issue: v.union(v.string(), v.null()),
  suggestedCourtId: v.optional(v.id("courts")),
  suggestedProId: v.optional(v.id("memberships")),
});

export default defineSchema({
  ...authTables,

  orgs: defineTable({
    name: v.string(),
    slug: v.string(),
    dayStartMin: v.number(),
    dayEndMin: v.number(),
    plan: v.union(v.literal("free"), v.literal("pro")),
    /**
     * IANA zone, e.g. "America/New_York". Everything a club reads is already in
     * its own local dates, but anything the *server* starts — the evening
     * digest — needs to know when evening is there rather than in UTC.
     */
    timeZone: v.optional(v.string()),
    prosCanSeeClub: v.boolean(),
    onboardingComplete: v.boolean(),
    isDemo: v.boolean(),
    createdBy: v.optional(v.id("users")),
  }).index("by_slug", ["slug"]),

  courts: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    sortOrder: v.number(),
    active: v.boolean(),
  }).index("by_org", ["orgId"]),

  // userId is null until an invited member first signs in and claims the seat.
  memberships: defineTable({
    orgId: v.id("orgs"),
    userId: v.optional(v.id("users")),
    email: v.string(),
    displayName: v.string(),
    role: roleValidator,
    color: v.string(),
    active: v.boolean(),
    // What the club pays this coach per hour, in whole cents, set by the club
    // itself. Absent means "we haven't told Courtime", and the payroll view
    // says so rather than inventing a number.
    rateCents: v.optional(v.number()),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_org_and_email", ["orgId", "email"]),

  entries: defineTable({
    orgId: v.id("orgs"),
    courtId: v.id("courts"),
    date: v.string(),
    startMin: v.number(),
    endMin: v.number(),
    // Which coach works this booking. Null on coach-less courts (member self-play).
    proMembershipId: v.optional(v.id("memberships")),
    label: v.string(),
    sessionType: v.optional(v.string()),
    notes: v.optional(v.string()),
    // The asterisk on the paper: this client asked for this pro by name.
    requested: v.optional(v.boolean()),
    source: v.union(v.literal("manual"), v.literal("import")),
    sourcePageId: v.optional(v.id("importPages")),
    // Shared by every booking created from one standing lesson, so "cancel the
    // rest of these" is one query rather than a hunt.
    seriesId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_org_and_date", ["orgId", "date"])
    .index("by_org_and_pro_and_date", ["orgId", "proMembershipId", "date"])
    .index("by_series", ["seriesId"])
    .index("by_source_page", ["sourcePageId"]),

  importBatches: defineTable({
    orgId: v.id("orgs"),
    createdBy: v.optional(v.id("users")),
    model: v.string(),
    pageCount: v.number(),
    confirmedCount: v.number(),
    costUsd: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  }).index("by_org", ["orgId"]),

  importPages: defineTable({
    batchId: v.id("importBatches"),
    orgId: v.id("orgs"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    dateHint: v.optional(v.string()),
    status: pageStatusValidator,
    // Clinic sheets carry no date of their own; they inherit one from the
    // court-grid page they were photographed alongside (see uploadIndex).
    pageKind: v.optional(pageKindValidator),
    uploadIndex: v.optional(v.number()),
    pairedPageId: v.optional(v.id("importPages")),
    clinicDrafts: v.optional(v.array(clinicDraftValidator)),
    // Filled in by the extraction action.
    detectedDate: v.optional(v.string()),
    draftEntries: v.optional(v.array(draftEntryValidator)),
    dayNotes: v.optional(v.string()),
    courtCoaches: v.optional(
      v.array(v.object({ court: v.string(), coach: v.string() })),
    ),
    warnings: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_batch", ["batchId"])
    .index("by_org", ["orgId"]),

  // Audit trail + the trigger for pro push alerts.
  entryChanges: defineTable({
    orgId: v.id("orgs"),
    entryId: v.optional(v.id("entries")),
    changeType: v.union(
      v.literal("created"),
      v.literal("moved"),
      v.literal("edited"),
      v.literal("deleted"),
      v.literal("imported"),
    ),
    summary: v.string(),
    date: v.string(),
    affectedMembershipIds: v.array(v.id("memberships")),
    byUserId: v.optional(v.id("users")),
  }).index("by_org", ["orgId"]),

  /** The back of the paper: who actually signed up for each clinic. */
  clinicRosters: defineTable({
    orgId: v.id("orgs"),
    date: v.string(),
    title: v.string(),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    // Set when the roster has been matched to a booking on the court grid.
    entryId: v.optional(v.id("entries")),
    participants: v.array(clinicParticipantValidator),
    sourcePageId: v.optional(v.id("importPages")),
    // How many the club will take. Absent means no limit, which is how the
    // paper sheet behaves until someone draws a line.
    capacity: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_org_and_date", ["orgId", "date"])
    .index("by_entry", ["entryId"]),

  /** The NOTES column down the right-hand side of the paper page. */
  dayNotes: defineTable({
    orgId: v.id("orgs"),
    date: v.string(),
    body: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_org_and_date", ["orgId", "date"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  /**
   * A coach asking for a day off or a cover. It is a request, not a change —
   * the desk still owns the book, so this lands as something to action rather
   * than as a hole in the schedule.
   */
  timeOffRequests: defineTable({
    orgId: v.id("orgs"),
    membershipId: v.id("memberships"),
    date: v.string(),
    startMin: v.optional(v.number()),
    endMin: v.optional(v.number()),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
  })
    .index("by_org_and_status", ["orgId", "status"])
    .index("by_org_and_date", ["orgId", "date"]),

  /**
   * Every paid model call, one row, so a club's month has a hard ceiling
   * instead of an open tab. Written by the same actions that spend the money.
   */
  aiUsage: defineTable({
    orgId: v.id("orgs"),
    // "YYYY-MM", so a month is one index key.
    month: v.string(),
    kind: v.union(
      v.literal("vision"),
      v.literal("agent"),
      v.literal("voice"),
      v.literal("insight"),
    ),
    costUsd: v.number(),
    at: v.number(),
  })
    .index("by_org_and_month", ["orgId", "month"])
    .index("by_org", ["orgId"]),

  /**
   * A person the club teaches — not a user, and never one. They exist because
   * their name is written on a paper page, so identity here is derived rather
   * than registered.
   */
  clients: defineTable({
    orgId: v.id("orgs"),
    displayName: v.string(),
    /** Every spelling the book has used: "P. Nguyen", "Nguyen", "Phuong Nguyen". */
    aliases: v.array(v.string()),
    /** Lowercased surname + first initial. The key the resolver matches on. */
    matchKey: v.string(),
    phone: v.optional(v.string()),
    rating: v.optional(v.string()),
    note: v.optional(v.string()),
    /** Set when two records turn out to be the same person. */
    mergedInto: v.optional(v.id("clients")),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_and_key", ["orgId", "matchKey"]),

  /**
   * The edge, and the whole design.
   *
   * A booking's label is never rewritten — the link sits beside it. That keeps
   * the paper record exactly as the desk wrote it, makes a wrong guess one row
   * to delete rather than a corrupted booking, and turns "everything about this
   * client" into an indexed read instead of a text search.
   */
  clientLinks: defineTable({
    orgId: v.id("orgs"),
    clientId: v.id("clients"),
    entryId: v.optional(v.id("entries")),
    rosterId: v.optional(v.id("clinicRosters")),
    date: v.string(),
    source: v.union(
      v.literal("roster"),
      v.literal("matched"),
      v.literal("manual"),
    ),
    confidence: v.union(v.literal("high"), v.literal("low")),
  })
    .index("by_client", ["clientId"])
    .index("by_entry", ["entryId"])
    .index("by_org_and_date", ["orgId", "date"]),

  /**
   * The rotating line on the Insights page. Generated once per club per day and
   * cached — the whole point is that it costs about a hundredth of a cent, so
   * regenerating it on every page load would be the only way to get that wrong.
   */
  insightCards: defineTable({
    orgId: v.id("orgs"),
    date: v.string(),
    lines: v.array(v.string()),
    model: v.string(),
    costUsd: v.number(),
    generatedAt: v.number(),
  }).index("by_org_and_date", ["orgId", "date"]),
});
