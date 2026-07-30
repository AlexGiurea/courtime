/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as app from "../app.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as budget from "../budget.js";
import type * as clients from "../clients.js";
import type * as clinics from "../clinics.js";
import type * as crons from "../crons.js";
import type * as digest from "../digest.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as insights from "../insights.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as pushNode from "../pushNode.js";
import type * as realtime from "../realtime.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as vision from "../vision.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  app: typeof app;
  auth: typeof auth;
  authz: typeof authz;
  budget: typeof budget;
  clients: typeof clients;
  clinics: typeof clinics;
  crons: typeof crons;
  digest: typeof digest;
  http: typeof http;
  imports: typeof imports;
  insights: typeof insights;
  notes: typeof notes;
  notifications: typeof notifications;
  pushNode: typeof pushNode;
  realtime: typeof realtime;
  schedule: typeof schedule;
  seed: typeof seed;
  vision: typeof vision;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
