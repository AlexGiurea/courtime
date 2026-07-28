import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { currentMembership, requireMembership } from "./authz";
import { draftEntryValidator } from "./schema";
import { formatTime } from "./schedule";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireMembership(ctx, "staff");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Queue a stack of photographed pages. Each page is processed by its own
 * scheduled action so one unreadable page can never stall the batch.
 */
export const createBatch = mutation({
  args: {
    pages: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        dateHint: v.optional(v.string()),
      }),
    ),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    if (!args.pages.length) throw new Error("Add at least one page");
    if (args.pages.length > 60) throw new Error("Import at most 60 pages at a time");

    const userId = await getAuthUserId(ctx);
    const model = args.model ?? "gpt-5.6-luna";

    const batchId = await ctx.db.insert("importBatches", {
      orgId: membership.orgId,
      createdBy: userId ?? undefined,
      model,
      pageCount: args.pages.length,
      confirmedCount: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    });

    for (const page of args.pages) {
      const pageId = await ctx.db.insert("importPages", {
        batchId,
        orgId: membership.orgId,
        storageId: page.storageId,
        fileName: page.fileName,
        dateHint: page.dateHint,
        status: "queued",
      });
      await ctx.scheduler.runAfter(0, internal.vision.processPage, {
        pageId,
        model,
      });
    }

    return { batchId };
  },
});

export const batch = query({
  args: { batchId: v.id("importBatches") },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const found = await ctx.db.get("importBatches", args.batchId);
    if (!found || found.orgId !== membership.orgId) return null;
    const pages = await ctx.db
      .query("importPages")
      .withIndex("by_batch", (q) => q.eq("batchId", args.batchId))
      .take(100);
    return { batch: found, pages };
  },
});

export const listBatches = query({
  args: {},
  handler: async (ctx) => {
    const membership = await currentMembership(ctx);
    if (!membership) return [];
    return await ctx.db
      .query("importBatches")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .order("desc")
      .take(20);
  },
});

/** One page plus its photo — everything the review screen needs in one read. */
export const page = query({
  args: { pageId: v.id("importPages") },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const found = await ctx.db.get("importPages", args.pageId);
    if (!found || found.orgId !== membership.orgId) return null;
    return { page: found, photoUrl: await ctx.storage.getUrl(found.storageId) };
  },
});

/** Signed URL for the original page photo — the audit trail behind every entry. */
export const pagePhotoUrl = query({
  args: { pageId: v.id("importPages") },
  handler: async (ctx, args) => {
    const membership = await currentMembership(ctx);
    if (!membership) return null;
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page || page.orgId !== membership.orgId) return null;
    return await ctx.storage.getUrl(page.storageId);
  },
});

/**
 * Publish a reviewed page. The client sends the final, human-corrected rows —
 * nothing the model produced reaches the calendar without passing through here.
 */
export const confirmPage = mutation({
  args: {
    pageId: v.id("importPages"),
    date: v.string(),
    entries: v.array(
      v.object({
        courtId: v.id("courts"),
        startMin: v.number(),
        endMin: v.number(),
        label: v.string(),
        proMembershipId: v.optional(v.id("memberships")),
        sessionType: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page || page.orgId !== membership.orgId) throw new Error("Unknown page");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Pick a date for this page");

    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);
    const courtIds = new Set(courts.map((c) => c._id as string));

    if (args.replaceExisting) {
      const existing = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) =>
          q.eq("orgId", membership.orgId).eq("date", args.date),
        )
        .take(500);
      for (const entry of existing) {
        await ctx.db.delete("entries", entry._id);
      }
    }

    const taken: { courtId: string; startMin: number; endMin: number }[] = [];
    if (!args.replaceExisting) {
      const existing = await ctx.db
        .query("entries")
        .withIndex("by_org_and_date", (q) =>
          q.eq("orgId", membership.orgId).eq("date", args.date),
        )
        .take(500);
      for (const entry of existing) {
        taken.push({
          courtId: entry.courtId as string,
          startMin: entry.startMin,
          endMin: entry.endMin,
        });
      }
    }

    const affected = new Set<Id<"memberships">>();
    let created = 0;
    let skipped = 0;

    for (const row of args.entries) {
      if (!courtIds.has(row.courtId as string)) continue;
      if (row.endMin <= row.startMin) continue;
      const label = row.label.trim();
      if (!label) continue;

      const clash = taken.some(
        (t) =>
          t.courtId === (row.courtId as string) &&
          row.startMin < t.endMin &&
          row.endMin > t.startMin,
      );
      if (clash) {
        skipped++;
        continue;
      }

      await ctx.db.insert("entries", {
        orgId: membership.orgId,
        courtId: row.courtId,
        date: args.date,
        startMin: row.startMin,
        endMin: row.endMin,
        label,
        proMembershipId: row.proMembershipId,
        sessionType: row.sessionType,
        notes: row.notes,
        source: "import",
        sourcePageId: args.pageId,
        updatedAt: Date.now(),
      });
      taken.push({
        courtId: row.courtId as string,
        startMin: row.startMin,
        endMin: row.endMin,
      });
      if (row.proMembershipId) affected.add(row.proMembershipId);
      created++;
    }

    await ctx.db.patch("importPages", args.pageId, {
      status: "confirmed",
      detectedDate: args.date,
    });

    const parentBatch = await ctx.db.get("importBatches", page.batchId);
    if (parentBatch) {
      await ctx.db.patch("importBatches", page.batchId, {
        confirmedCount: parentBatch.confirmedCount + 1,
      });
    }

    const userId = await getAuthUserId(ctx);
    await ctx.db.insert("entryChanges", {
      orgId: membership.orgId,
      changeType: "imported",
      summary: `${created} booking${created === 1 ? "" : "s"} published from ${page.fileName}`,
      date: args.date,
      affectedMembershipIds: [...affected],
      byUserId: userId ?? undefined,
    });

    if (affected.size) {
      await ctx.scheduler.runAfter(0, internal.pushNode.deliver, {
        membershipIds: [...affected],
        title: "Your schedule was updated",
        body: `${created} booking${created === 1 ? "" : "s"} published for ${args.date}`,
      });
    }

    return { created, skipped };
  },
});

export const retryPage = mutation({
  args: { pageId: v.id("importPages"), model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page || page.orgId !== membership.orgId) throw new Error("Unknown page");
    await ctx.db.patch("importPages", args.pageId, {
      status: "queued",
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.vision.processPage, {
      pageId: args.pageId,
      model: args.model ?? "gpt-5.6-luna",
    });
    return null;
  },
});

export const discardPage = mutation({
  args: { pageId: v.id("importPages") },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "staff");
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page || page.orgId !== membership.orgId) throw new Error("Unknown page");
    await ctx.db.delete("importPages", args.pageId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internal: called by the vision action.
// ---------------------------------------------------------------------------

export const pageContext = internalQuery({
  args: { pageId: v.id("importPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page) return null;
    const org = await ctx.db.get("orgs", page.orgId);
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", page.orgId))
      .take(64);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", page.orgId))
      .take(200);
    const photoUrl = await ctx.storage.getUrl(page.storageId);
    return {
      page,
      org,
      photoUrl,
      courts: courts
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ _id: c._id, name: c.name })),
      members: members
        .filter((m) => m.active)
        .map((m) => ({ _id: m._id, displayName: m.displayName, role: m.role })),
    };
  },
});

export const markStatus = internalMutation({
  args: {
    pageId: v.id("importPages"),
    status: v.union(
      v.literal("queued"),
      v.literal("extracting"),
      v.literal("verifying"),
      v.literal("needs_review"),
      v.literal("confirmed"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("importPages", args.pageId, { status: args.status });
    return null;
  },
});

export const saveExtraction = internalMutation({
  args: {
    pageId: v.id("importPages"),
    detectedDate: v.optional(v.string()),
    draftEntries: v.array(draftEntryValidator),
    courtCoaches: v.array(v.object({ court: v.string(), coach: v.string() })),
    warnings: v.array(v.string()),
    model: v.string(),
    costUsd: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.get("importPages", args.pageId);
    if (!page) return null;

    await ctx.db.patch("importPages", args.pageId, {
      status: "needs_review",
      detectedDate: args.detectedDate,
      draftEntries: args.draftEntries,
      courtCoaches: args.courtCoaches,
      warnings: args.warnings,
      model: args.model,
      costUsd: args.costUsd,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      durationMs: args.durationMs,
      error: undefined,
    });

    const parentBatch = await ctx.db.get("importBatches", page.batchId);
    if (parentBatch) {
      await ctx.db.patch("importBatches", page.batchId, {
        costUsd: parentBatch.costUsd + args.costUsd,
        inputTokens: parentBatch.inputTokens + args.inputTokens,
        outputTokens: parentBatch.outputTokens + args.outputTokens,
      });
    }
    return null;
  },
});

export const saveError = internalMutation({
  args: { pageId: v.id("importPages"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("importPages", args.pageId, {
      status: "failed",
      error: args.error.slice(0, 500),
    });
    return null;
  },
});

/** Human-readable summary used by the review screen's header. */
export function describeSpan(startMin: number, endMin: number): string {
  return `${formatTime(startMin)} – ${formatTime(endMin)}`;
}
