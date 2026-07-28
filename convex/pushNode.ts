"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Fan a schedule change out to the affected coaches' devices. Push is a
 * best-effort courtesy on top of the live-updating app: if VAPID keys are not
 * configured, or a device has gone stale, the schedule itself is unaffected.
 */
export const deliver = internalAction({
  args: {
    membershipIds: v.array(v.id("memberships")),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return null;

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@courtime.app",
      publicKey,
      privateKey,
    );

    const subs = await ctx.runQuery(
      internal.notifications.subscriptionsForMemberships,
      { membershipIds: args.membershipIds },
    );

    const payload = JSON.stringify({ title: args.title, body: args.body });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away for good.
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.notifications.dropSubscription, {
            endpoint: sub.endpoint,
          });
        }
      }
    }
    return null;
  },
});
