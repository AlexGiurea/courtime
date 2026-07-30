import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The only scheduled work in the app, and deliberately so. Everything else
 * happens because someone did something.
 *
 * It runs every hour rather than once a day because "evening" is a local idea:
 * the job wakes up hourly and only mails the clubs where it is currently early
 * evening in that club's own time zone.
 */
const crons = cronJobs();

crons.hourly(
  "evening digest to coaches teaching tomorrow",
  { minuteUTC: 0 },
  internal.digest.sendEvening,
);

export default crons;
