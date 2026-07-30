"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * The club's outbound email. One sender, two jobs: telling a coach they've been
 * added to a club, and getting somebody back into their account.
 *
 * Deliberately plain text with one line of markup. A racquet club's coach opens
 * this on a phone between lessons; a designed email with a header image reads as
 * marketing and gets swiped away, and it can't be read at all in the preview
 * pane, which is where this will actually be read.
 *
 * With no `RESEND_API_KEY` the app still works end to end — invites just have to
 * be passed on by hand, which is what happened before this file existed. The
 * failure is logged and never thrown: a coach's seat is created whether or not
 * the email got out, and a mutation that rolled back because an email bounced
 * would be worse than a missing email.
 */

const ENDPOINT = "https://api.resend.com/emails";

function sender(): string {
  return process.env.RESEND_FROM || "Courtime <onboarding@resend.dev>";
}

function appUrl(): string {
  return process.env.SITE_URL || "https://courtime.vercel.app";
}

async function send(to: string, subject: string, lines: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return false;

  const text = lines.join("\n\n");
  const html = lines
    .map(
      (line) =>
        `<p style="margin:0 0 16px;font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;color:#2b333c">${line}</p>`,
    )
    .join("");

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: sender(),
        to: [to],
        subject,
        text,
        html: `<div style="max-width:34em;padding:8px 0">${html}</div>`,
      }),
    });
    if (!response.ok) {
      console.error("resend failed", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("resend threw", error);
    return false;
  }
}

/** A coach has been added to a club's staff list. */
export const sendInvite = internalAction({
  args: {
    to: v.string(),
    coachName: v.string(),
    clubName: v.string(),
    invitedBy: v.string(),
    role: v.string(),
  },
  handler: async (_ctx, args): Promise<{ sent: boolean }> => {
    const what =
      args.role === "pro"
        ? "your lessons will show up there automatically — you don't have to enter anything"
        : "you'll be able to work the schedule from there";

    const sent = await send(
      args.to,
      `${args.invitedBy} added you to ${args.clubName} on Courtime`,
      [
        `Hi ${args.coachName.split(/\s+/)[0] || "there"},`,
        `${args.invitedBy} has added you to <strong>${args.clubName}</strong> on Courtime — it's how the club's schedule book gets onto everyone's phone, and ${what}.`,
        `Set your password here, using this email address: <a href="${appUrl()}" style="color:#0e7a5f">${appUrl()}</a>`,
        `Choose "Set one up" and sign up with <strong>${args.to}</strong> — your place at the club is already waiting on that address.`,
        `On a phone, add it to your home screen and it behaves like an app, including telling you when something on your day moves.`,
      ],
    );
    return { sent };
  },
});

/** The six digits that let somebody set a new password. */
export const sendPasswordReset = internalAction({
  args: { to: v.string(), code: v.string() },
  handler: async (_ctx, args): Promise<{ sent: boolean }> => {
    const sent = await send(args.to, `Your Courtime reset code: ${args.code}`, [
      `Your code to set a new Courtime password is <strong style="font-size:20px;letter-spacing:2px">${args.code}</strong>`,
      `It's good for the next hour. Type it back into the page you started on.`,
      `If you didn't ask for this, nothing has happened to your account and you can ignore this email.`,
    ]);
    return { sent };
  },
});
