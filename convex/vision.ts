import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

// Per-million-token rates, mirroring Breakpoint's telemetry so a club can see
// exactly what an archive session costs.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

const DEFAULT_MODEL = "gpt-5.6-luna";

// Ported from Breakpoint's schedule importer: every rule in here was earned by
// a real page that the model previously got wrong.
const SYSTEM_PROMPT = `You are a precise data-extraction engine for Courtime, a racquet club scheduling app.
You are given a PHOTO of a hand-written daily court schedule (a grid). Read it slowly and carefully, then return STRICTLY valid JSON.

LAYOUT
- The grid has one COLUMN per court, numbered 1, 2, 3, … There may be extra columns such as "Stadium" or "Special Events" — treat their name as the court.
- The FAR-LEFT and FAR-RIGHT columns are TIME GUTTERS. Every ROW is a 30-MINUTE slot: 7:00, 7:30, 8:00, 8:30, 9:00 … Read each row's time from the LEFT gutter.
- On the FIRST line of a court column (above the first time slot) there may be a COACH NAME for that court.

COACHES — read this carefully
- The name at the TOP of a numbered court column is the coach who runs EVERY booking on that court that day. List these in "courtCoaches" (one entry per court that HAS a name).
- If a court column has NO name at the top, that court has NO coach: the bookings are players who reserved the court themselves (self-play). For every booking on a court with no coach, set "coach" to null. NEVER invent, guess, or borrow a coach for these.
- Inside a cell, "w/ <name>" or "w/ pro" only re-states that court's coach. Do NOT make a new coach from it — set the booking's "coach" to null so it inherits the court coach.
- Short letters in circles/boxes (RS, T, M, C, ER, PS, H, …) are STATUS CODES — never a coach, never a title. Put them in "notes".

TIMES & DURATION — read this carefully
- A booking starts in the slot where its writing begins; read that row's time from the LEFT gutter.
- DURATION = how many 30-minute slots the booking covers. A downward arrow, a long vertical line, or the entry visibly extending into the rows below means it CONTINUES through those slots. Count the starting slot PLUS each continued slot. endTime = startTime + 30 min x (slots covered).
    - one slot starting at 8:00 -> 08:00-08:30
    - "Clinic" with a down-arrow covering the 8:00 and 8:30 rows -> 08:00-09:00 (one hour)
    - an entry covering 8:30, 9:00, 9:30 -> 08:30-10:00
- Two SEPARATE entries stacked in one column are SEPARATE bookings — NEVER merge them. e.g. "Clinic" 08:00-09:00 and another "Clinic" 09:00-10:00 are TWO one-hour clinics.
- "BREAK" rows are not bookings — skip them.

Return ONLY this JSON object (no prose, no code fences):
{
  "date": "YYYY-MM-DD or null",
  "dayOfWeek": "e.g. Monday, or null",
  "courtCoaches": [ { "court": "1", "coach": "Valentina" } ],
  "sessions": [
    {
      "court": "1",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "title": "the player or clinic name",
      "coach": null,
      "sessionType": "Private | Group | Clinic | Camp | null",
      "notes": "status codes / extra text, or null",
      "legible": true
    }
  ],
  "warnings": [ "anything ambiguous or unreadable" ]
}

RULES
- 24-hour times ("8:00 AM" -> "08:00", "2:30 PM" -> "14:30"). ALWAYS fill endTime from the slots covered.
- "Clinic" -> Clinic; "Group" / "Rising Stars" / "Elites" -> Group; "Camp" -> Camp; a person's name with no group word -> Private.
- "coach" is null on every coach-less court and whenever the cell only says "w/ pro" or "w/ <the court coach>". Only put a name in "coach" if a DIFFERENT, explicitly-named coach runs that one booking.
- Set "legible" to false for any booking you had to guess at, so a human can check it.
- Do NOT invent bookings. Skip empty cells and BREAK rows. If a name is unreadable, still include the booking with title "(unreadable)" and add a warning.
- If a provided known-coach name clearly matches a scribbled top-of-column name, use the known spelling.
- Output ONLY the JSON object.`;

function parseJsonLoose(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    /* recover below */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const braces = text.match(/\{[\s\S]*\}/);
  if (braces) {
    try {
      return JSON.parse(braces[0]);
    } catch {
      /* give up */
    }
  }
  return {};
}

function toMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "3" should match "Court 3"; "Stadium" should match "Stadium Court". */
function matchCourt(
  courtName: string,
  courts: { _id: Id<"courts">; name: string }[],
): Id<"courts"> | undefined {
  const raw = courtName.trim();
  if (!raw) return undefined;
  const norm = normalize(raw);
  const exact = courts.find((c) => normalize(c.name) === norm);
  if (exact) return exact._id;
  if (/^\d+$/.test(raw)) {
    const numbered = courts.find((c) => normalize(c.name) === `court${raw}`);
    if (numbered) return numbered._id;
  }
  const contains = courts.find(
    (c) => normalize(c.name).includes(norm) || norm.includes(normalize(c.name)),
  );
  return contains?._id;
}

function matchCoach(
  coachName: string | null,
  members: { _id: Id<"memberships">; displayName: string }[],
): Id<"memberships"> | undefined {
  if (!coachName) return undefined;
  const norm = normalize(coachName);
  if (!norm) return undefined;
  const exact = members.find((m) => normalize(m.displayName) === norm);
  if (exact) return exact._id;
  const firstName = members.find(
    (m) => normalize(m.displayName.split(/\s+/)[0]) === norm,
  );
  if (firstName) return firstName._id;
  const partial = members.find(
    (m) => normalize(m.displayName).startsWith(norm) && norm.length >= 3,
  );
  return partial?._id;
}

/**
 * Read one photographed page into draft bookings.
 *
 * Verification is deliberately deterministic rather than a second model call:
 * the failure modes that matter here (a court that does not exist, a time
 * outside the club's day, a span that ends before it starts, two bookings on
 * one court at once, handwriting the model itself flagged) are all decidable in
 * code. That is cheaper, faster, and — unlike an LLM critic — cannot itself
 * hallucinate. Anything it flags becomes a highlighted cell for the human
 * reviewer; nothing here publishes on its own.
 */
export const processPage = internalAction({
  args: { pageId: v.id("importPages"), model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    try {
      const context = await ctx.runQuery(internal.imports.pageContext, {
        pageId: args.pageId,
      });
      if (!context || !context.page) return null;
      if (!context.photoUrl) {
        await ctx.runMutation(internal.imports.saveError, {
          pageId: args.pageId,
          error: "The uploaded photo could not be read back from storage.",
        });
        return null;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        await ctx.runMutation(internal.imports.saveError, {
          pageId: args.pageId,
          error:
            "AI import is not configured on this deployment (missing OPENAI_API_KEY).",
        });
        return null;
      }

      await ctx.runMutation(internal.imports.markStatus, {
        pageId: args.pageId,
        status: "extracting",
      });

      const model = args.model ?? DEFAULT_MODEL;
      const coachNames = context.members
        .filter((m) => m.role === "pro" || m.role === "admin")
        .map((m) => m.displayName);

      const userText = [
        context.page.dateHint
          ? `This page is believed to be for ${context.page.dateHint} — use it to resolve the year.`
          : "Read the date written on the page if there is one.",
        `This club has ${context.courts.length} courts named: ${context.courts
          .map((c) => c.name)
          .join(", ")}.`,
        coachNames.length
          ? `Known coaches (prefer these spellings when a scribble matches one): ${coachNames.join(", ")}.`
          : null,
        "Reminders: a court with NO name at the top has NO coach (self-play) — leave those coaches null. A label with a down-arrow is one session covering two 30-minute slots (one hour); two separate labels are two separate sessions.",
        "Extract the full schedule from this image as JSON.",
      ]
        .filter(Boolean)
        .join("\n");

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning_effort: process.env.OPENAI_VISION_REASONING_EFFORT || "low",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                {
                  type: "image_url",
                  image_url: { url: context.photoUrl, detail: "high" },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await ctx.runMutation(internal.imports.saveError, {
          pageId: args.pageId,
          error: `Vision model error ${response.status}: ${errorText.slice(0, 300)}`,
        });
        return null;
      }

      await ctx.runMutation(internal.imports.markStatus, {
        pageId: args.pageId,
        status: "verifying",
      });

      const data = await response.json();
      const parsed = parseJsonLoose(data?.choices?.[0]?.message?.content ?? "{}");

      const courtCoachesRaw = Array.isArray(parsed.courtCoaches)
        ? (parsed.courtCoaches as { court?: unknown; coach?: unknown }[])
        : [];
      const courtCoaches = courtCoachesRaw
        .filter((c) => typeof c.court === "string" && typeof c.coach === "string")
        .map((c) => ({ court: String(c.court), coach: String(c.coach) }));
      const coachByCourt = new Map(
        courtCoaches.map((c) => [normalize(c.court), c.coach]),
      );

      const dayStart = context.org?.dayStartMin ?? 0;
      const dayEnd = context.org?.dayEndMin ?? 24 * 60;

      const sessionsRaw = Array.isArray(parsed.sessions)
        ? (parsed.sessions as Record<string, unknown>[])
        : [];

      const drafts: {
        courtName: string;
        startMin: number;
        endMin: number;
        label: string;
        coachName: string | null;
        sessionType: string | null;
        notes: string | null;
        confidence: "high" | "low";
        issue: string | null;
        suggestedCourtId?: Id<"courts">;
        suggestedProId?: Id<"memberships">;
      }[] = [];

      const claimed: { courtKey: string; startMin: number; endMin: number }[] = [];

      for (const session of sessionsRaw) {
        const courtName =
          typeof session.court === "string" ? session.court.trim() : "";
        const startMin = toMinutes(session.startTime);
        let endMin = toMinutes(session.endTime);
        const label =
          typeof session.title === "string" && session.title.trim()
            ? session.title.trim()
            : "(unreadable)";

        if (startMin === null) continue;
        if (endMin === null || endMin <= startMin) endMin = startMin + 30;

        const explicitCoach =
          typeof session.coach === "string" && session.coach.trim()
            ? session.coach.trim()
            : null;
        const inheritedCoach = coachByCourt.get(normalize(courtName)) ?? null;
        const coachName = explicitCoach ?? inheritedCoach;

        const suggestedCourtId = matchCourt(courtName, context.courts);
        const suggestedProId = matchCoach(coachName, context.members);

        // Deterministic verification — every branch here becomes a highlighted
        // cell the reviewer must look at before the page can publish.
        const issues: string[] = [];
        if (!suggestedCourtId) issues.push(`No court named "${courtName || "?"}"`);
        if (startMin < dayStart || endMin > dayEnd) {
          issues.push("Outside the club's hours");
        }
        if (startMin % 30 !== 0 || endMin % 30 !== 0) {
          issues.push("Not on the 30-minute grid");
        }
        if (label === "(unreadable)") issues.push("Handwriting unclear");
        if (session.legible === false) issues.push("Model was unsure");
        if (coachName && !suggestedProId) {
          issues.push(`"${coachName}" is not on the staff list`);
        }

        const courtKey = suggestedCourtId
          ? (suggestedCourtId as string)
          : normalize(courtName);
        const overlap = claimed.find(
          (c) =>
            c.courtKey === courtKey && startMin < c.endMin && endMin > c.startMin,
        );
        if (overlap) issues.push("Overlaps another booking on this court");
        claimed.push({ courtKey, startMin, endMin });

        drafts.push({
          courtName: courtName || "?",
          startMin,
          endMin,
          label,
          coachName,
          sessionType:
            typeof session.sessionType === "string" ? session.sessionType : null,
          notes: typeof session.notes === "string" ? session.notes : null,
          confidence: issues.length ? "low" : "high",
          issue: issues.length ? issues.join(" · ") : null,
          suggestedCourtId,
          suggestedProId,
        });
      }

      const usage = data?.usage ?? {};
      const inputTokens = Number(usage.prompt_tokens) || 0;
      const outputTokens = Number(usage.completion_tokens) || 0;
      const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_MODEL];
      const costUsd =
        (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

      const warnings = Array.isArray(parsed.warnings)
        ? (parsed.warnings as unknown[]).filter(
            (w): w is string => typeof w === "string",
          )
        : [];

      const detectedDate =
        typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
          ? parsed.date
          : context.page.dateHint;

      await ctx.runMutation(internal.imports.saveExtraction, {
        pageId: args.pageId,
        detectedDate,
        draftEntries: drafts,
        courtCoaches,
        warnings,
        model,
        costUsd: Number(costUsd.toFixed(6)),
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
      });

      return null;
    } catch (error) {
      await ctx.runMutation(internal.imports.saveError, {
        pageId: args.pageId,
        error: error instanceof Error ? error.message : "Unknown import error",
      });
      return null;
    }
  },
});
