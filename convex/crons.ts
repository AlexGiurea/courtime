import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The only scheduled work in the app, and deliberately so. Everything else
 * happens because someone did something.
 */
const crons = cronJobs();

crons.daily(
  "evening digest to coaches teaching tomorrow",
  { hourUTC: 22, minuteUTC: 0 },
  internal.digest.sendEvening,
);

export default crons;
