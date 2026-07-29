/**
 * Which face of Courtime this deployment is.
 *
 * The club and the coach are two products that happen to share a backend: the
 * desk is a wide keyboard-driven console, the coach's is a phone app they
 * install to a home screen. Serving both from one address means a coach carries
 * the desk's entire bundle around to look at six lessons, and it makes the
 * "which app am I in" question real every time either of them opens a link.
 *
 * Nothing about safety depends on this — every query and mutation is gated by
 * membership role on the server, so the face is only ever presentation. That's
 * exactly why it can be a build flag: get it wrong and someone sees the wrong
 * chrome, not the wrong data.
 *
 * Three ways to be the coach app, in order of precedence:
 *   1. `VITE_APP_FACE=coach` at build time — a second Vercel project off this
 *      same repo, which is the real split.
 *   2. A hostname starting `my.` or `coach.` — one deployment, two domains.
 *   3. Neither, in which case this is the club app and `/me` still works, which
 *      is what local development and the demo run on.
 */

export type AppFace = "club" | "coach";

const COACH_HOSTS = ["my.", "coach.", "pro."];

export function appFace(): AppFace {
  const flag = import.meta.env.VITE_APP_FACE;
  if (flag === "coach") return "coach";
  if (flag === "club") return "club";

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (COACH_HOSTS.some((prefix) => host.startsWith(prefix))) return "coach";
  }
  return "club";
}

/** True when this build only ever shows the coach's app. */
export function isCoachApp(): boolean {
  return appFace() === "coach";
}
