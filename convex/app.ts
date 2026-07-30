import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { claimPendingInvite, currentMembership, requireMembership } from "./authz";
import { Id } from "./_generated/dataModel";

// Coach chips need stable, muted colors that survive being printed.
const PRO_COLORS = [
  "#0e7a5f",
  "#2f5d9c",
  "#8a5a2b",
  "#7b3f7d",
  "#1f6f78",
  "#9c4f3f",
  "#4a6741",
  "#6b5b95",
];

export function colorForIndex(index: number): string {
  return PRO_COLORS[index % PRO_COLORS.length];
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "club";
}

/**
 * Everything the shell needs about the current viewer in one reactive read:
 * who they are, which club they belong to, their role, and the club's courts
 * and staff. Returns `authed: false` when signed out.
 */
export const session = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authed: false as const };

    const user = await ctx.db.get("users", userId);
    const membership = await currentMembership(ctx);
    if (!membership) {
      return {
        authed: true as const,
        user: { name: user?.name ?? "", email: user?.email ?? "" },
        membership: null,
        org: null,
        courts: [],
        members: [],
      };
    }

    const org = await ctx.db.get("orgs", membership.orgId);
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);
    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(200);

    return {
      authed: true as const,
      user: { name: user?.name ?? "", email: user?.email ?? "" },
      membership: {
        _id: membership._id,
        role: membership.role,
        displayName: membership.displayName,
        color: membership.color,
      },
      org,
      courts: courts
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      members: members
        .filter((m) => m.active)
        .map((m) => ({
          _id: m._id,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          color: m.color,
          claimed: m.userId !== undefined,
          rateCents: m.rateCents ?? null,
        })),
    };
  },
});

/** Called once after sign-in so an invited coach picks up their seat. */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    await claimPendingInvite(ctx);
    return null;
  },
});

/**
 * The onboarding wizard's single write: club, courts and staff in one
 * transaction so a half-built club can never exist.
 */
export const createClub = mutation({
  args: {
    name: v.string(),
    courtNames: v.array(v.string()),
    dayStartMin: v.number(),
    dayEndMin: v.number(),
    coaches: v.array(v.object({ name: v.string(), email: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) throw new Error("This account already belongs to a club");

    const name = args.name.trim() || "My Club";
    if (args.dayEndMin <= args.dayStartMin) {
      throw new Error("The day must end after it starts");
    }

    const user = await ctx.db.get("users", userId);
    const slug = `${slugify(name)}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const orgId = await ctx.db.insert("orgs", {
      name,
      slug,
      dayStartMin: args.dayStartMin,
      dayEndMin: args.dayEndMin,
      // New clubs start on Pro so the whole product is visible; the plan card
      // in Settings switches tiers.
      plan: "pro",
      prosCanSeeClub: true,
      onboardingComplete: true,
      isDemo: false,
      createdBy: userId,
    });

    const courtNames = args.courtNames
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 40);
    const finalCourts = courtNames.length ? courtNames : ["Court 1"];
    for (let i = 0; i < finalCourts.length; i++) {
      await ctx.db.insert("courts", {
        orgId,
        name: finalCourts[i],
        sortOrder: i,
        active: true,
      });
    }

    await ctx.db.insert("memberships", {
      orgId,
      userId,
      email: (user?.email ?? "").toLowerCase(),
      displayName: user?.name || user?.email || "Front desk",
      role: "admin",
      color: colorForIndex(0),
      active: true,
    });

    let colorIndex = 1;
    for (const coach of args.coaches) {
      const coachName = coach.name.trim();
      if (!coachName) continue;
      await ctx.db.insert("memberships", {
        orgId,
        email: coach.email.trim().toLowerCase(),
        displayName: coachName,
        role: "pro",
        color: colorForIndex(colorIndex++),
        active: true,
      });
    }

    return { orgId };
  },
});

export const updateOrg = mutation({
  args: {
    name: v.optional(v.string()),
    dayStartMin: v.optional(v.number()),
    dayEndMin: v.optional(v.number()),
    prosCanSeeClub: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined && args.name.trim()) patch.name = args.name.trim();
    if (args.dayStartMin !== undefined) patch.dayStartMin = args.dayStartMin;
    if (args.dayEndMin !== undefined) patch.dayEndMin = args.dayEndMin;
    if (args.prosCanSeeClub !== undefined) patch.prosCanSeeClub = args.prosCanSeeClub;
    if (Object.keys(patch).length) {
      await ctx.db.patch("orgs", membership.orgId, patch);
    }
    return null;
  },
});

/** Demo affordance: flip the club between tiers to see what Pro unlocks. */
/**
 * Switching tiers.
 *
 * While there is no billing, this is a development switch that lets a club — or
 * a demo — see both tiers. That is fine now and unacceptable the day someone
 * pays, so the gate is one environment variable rather than a code change:
 * set `BILLING_ENFORCED=true` on the deployment and upgrading stops being
 * self-serve. Downgrading to Free is always allowed; nobody should have to ask
 * permission to stop using a paid feature.
 */
export const setPlan = mutation({
  args: { plan: v.union(v.literal("free"), v.literal("pro")) },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    const org = await ctx.db.get("orgs", membership.orgId);

    if (
      args.plan === "pro" &&
      process.env.BILLING_ENFORCED === "true" &&
      !org?.isDemo
    ) {
      throw new Error(
        "Pro is billed. Get in touch to switch this club over — it takes a minute and there's no contract.",
      );
    }

    await ctx.db.patch("orgs", membership.orgId, { plan: args.plan });
    return null;
  },
});

export const upsertCourt = mutation({
  args: {
    courtId: v.optional(v.id("courts")),
    name: v.string(),
    sortOrder: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    if (args.courtId) {
      const court = await ctx.db.get("courts", args.courtId);
      if (!court || court.orgId !== membership.orgId) throw new Error("Unknown court");
      await ctx.db.patch("courts", args.courtId, {
        name: args.name.trim() || court.name,
        ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
        ...(args.active !== undefined ? { active: args.active } : {}),
      });
      return { courtId: args.courtId };
    }
    const courts = await ctx.db
      .query("courts")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(64);
    const courtId = await ctx.db.insert("courts", {
      orgId: membership.orgId,
      name: args.name.trim() || `Court ${courts.length + 1}`,
      sortOrder: args.sortOrder ?? courts.length,
      active: true,
    });
    return { courtId };
  },
});

export const inviteMember = mutation({
  args: {
    displayName: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("staff"), v.literal("pro")),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    const email = args.email.trim().toLowerCase();
    const displayName = args.displayName.trim();
    if (!displayName) throw new Error("A name is required");

    const existing = email
      ? await ctx.db
          .query("memberships")
          .withIndex("by_org_and_email", (q) =>
            q.eq("orgId", membership.orgId).eq("email", email),
          )
          .first()
      : null;
    if (existing) throw new Error("Someone with that email is already on the staff list");

    const members = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", membership.orgId))
      .take(200);

    const memberId = await ctx.db.insert("memberships", {
      orgId: membership.orgId,
      email,
      displayName,
      role: args.role,
      color: colorForIndex(members.length),
      active: true,
    });
    return { memberId: memberId as Id<"memberships"> };
  },
});

export const updateMember = mutation({
  args: {
    memberId: v.id("memberships"),
    displayName: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("staff"), v.literal("pro"))),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    const target = await ctx.db.get("memberships", args.memberId);
    if (!target || target.orgId !== membership.orgId) throw new Error("Unknown member");
    if (target._id === membership._id && args.role && args.role !== "admin") {
      throw new Error("You cannot remove your own admin access");
    }
    await ctx.db.patch("memberships", args.memberId, {
      ...(args.displayName !== undefined && args.displayName.trim()
        ? { displayName: args.displayName.trim() }
        : {}),
      ...(args.role !== undefined ? { role: args.role } : {}),
      ...(args.active !== undefined ? { active: args.active } : {}),
    });
    return null;
  },
});

/**
 * What the club pays a coach an hour, in cents. Nothing is hard-coded and
 * nothing is assumed: a coach with no rate on file shows as "not set" in the
 * payroll view rather than as zero, because zero is a number a club might
 * believe.
 */
export const setMemberRate = mutation({
  args: {
    membershipId: v.id("memberships"),
    rateCents: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, "admin");
    const target = await ctx.db.get("memberships", args.membershipId);
    if (!target || target.orgId !== membership.orgId) throw new Error("Unknown member");
    await ctx.db.patch("memberships", args.membershipId, {
      rateCents:
        args.rateCents === null ? undefined : Math.max(0, Math.round(args.rateCents)),
    });
    return null;
  },
});
