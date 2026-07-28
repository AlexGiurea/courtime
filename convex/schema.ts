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
    source: v.union(v.literal("manual"), v.literal("import")),
    sourcePageId: v.optional(v.id("importPages")),
    updatedAt: v.number(),
  })
    .index("by_org_and_date", ["orgId", "date"])
    .index("by_org_and_pro_and_date", ["orgId", "proMembershipId", "date"])
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
    // Filled in by the extraction action.
    detectedDate: v.optional(v.string()),
    draftEntries: v.optional(v.array(draftEntryValidator)),
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

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),
});
