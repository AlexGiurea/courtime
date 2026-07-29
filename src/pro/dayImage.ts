import { SLOT_MIN, formatDateLong, formatSpan, formatTimeShort } from "../lib/time";
import type { Member, ScheduleEntry } from "./data";

/**
 * "Save the day as an image."
 *
 * Drawn onto a canvas from the schedule data rather than screenshotted off the
 * DOM: a screenshot of a phone gives you a phone-shaped crop of a grid that is
 * three courts wide, and no library reproduces sticky headers reliably. Drawing
 * it means the export is the whole day at a readable size on any device, and it
 * looks like the club's day sheet rather than like someone's browser.
 *
 * Delivery is the same call on both platforms: hand the file to the OS share
 * sheet if it will take it — on a phone that offers "Save Image", which puts it
 * in the gallery — and fall back to a download, which is what a desktop wants
 * anyway. We never have to guess which device we're on.
 */

const INK = "#101418";
const MUTED = "#5b6570";
const FAINT = "#8b949e";
const LINE = "#e3e7ec";
const LINE_STRONG = "#cfd6dd";
const WASH = "#f5f7f9";
const ACCENT = "#0e7a5f";
const ACCENT_SOFT = "#e2f3ee";
const PAPER = "#ffffff";

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const PAD = 40;
const HEADER = 96;
const COL_HEAD = 46;
const TIME_COL = 64;
const COL_W = 190;
const ROW_H = 30;
const FOOTER = 40;

export type ImageColumn = { id: string; name: string; sub?: string };

export type DayImageInput = {
  clubName: string;
  /** "The club" or a coach's name — what this sheet is *of*. */
  heading: string;
  date: string;
  columns: ImageColumn[];
  entries: ScheduleEntry[];
  columnOf: (entry: ScheduleEntry) => string | undefined;
  dayStartMin: number;
  dayEndMin: number;
  members?: Map<string, Member>;
  mineId?: string;
};

export function drawDay(input: DayImageInput): HTMLCanvasElement {
  const {
    clubName,
    heading,
    date,
    columns,
    entries,
    columnOf,
    dayStartMin,
    dayEndMin,
    members,
    mineId,
  } = input;

  const slots: number[] = [];
  for (let t = dayStartMin; t < dayEndMin; t += SLOT_MIN) slots.push(t);

  const width = PAD * 2 + TIME_COL + columns.length * COL_W;
  const height = PAD * 2 + HEADER + COL_HEAD + slots.length * ROW_H + FOOTER;

  // Two device pixels per CSS pixel: sharp on a phone screen, and still a
  // sensible file size for something that goes in a camera roll.
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(scale, scale);

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  // ---- header ----
  ctx.fillStyle = INK;
  ctx.font = `650 26px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(clubName, PAD, PAD + 26);

  ctx.fillStyle = MUTED;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(`${heading} · ${formatDateLong(date)}`, PAD, PAD + 50);

  ctx.fillStyle = ACCENT;
  ctx.font = `600 13px ${FONT}`;
  const mark = "Courtime";
  ctx.fillText(mark, width - PAD - ctx.measureText(mark).width, PAD + 26);

  const gridTop = PAD + HEADER;
  const gridLeft = PAD + TIME_COL;

  // ---- column headings ----
  ctx.fillStyle = WASH;
  ctx.fillRect(PAD, gridTop, width - PAD * 2, COL_HEAD);

  columns.forEach((column, index) => {
    const x = gridLeft + index * COL_W;
    ctx.fillStyle = INK;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(clip(ctx, column.name, COL_W - 20), x + 10, gridTop + 20);
    if (column.sub) {
      ctx.fillStyle = FAINT;
      ctx.font = `400 12px ${FONT}`;
      ctx.fillText(clip(ctx, column.sub, COL_W - 20), x + 10, gridTop + 37);
    }
  });

  // ---- rows ----
  const rowsTop = gridTop + COL_HEAD;
  slots.forEach((min, index) => {
    const y = rowsTop + index * ROW_H;
    const onTheHour = min % 60 === 0;

    ctx.strokeStyle = onTheHour ? LINE_STRONG : LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 0.5);
    ctx.lineTo(width - PAD, y + 0.5);
    ctx.stroke();

    if (onTheHour) {
      ctx.fillStyle = MUTED;
      ctx.font = `500 12px ${FONT}`;
      const label = formatTimeShort(min);
      ctx.fillText(label, gridLeft - 10 - ctx.measureText(label).width, y + 14);
    }
  });

  // Column rules, drawn after the rows so they sit on top of them.
  ctx.strokeStyle = LINE;
  for (let index = 0; index <= columns.length; index += 1) {
    const x = gridLeft + index * COL_W;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, gridTop);
    ctx.lineTo(x + 0.5, rowsTop + slots.length * ROW_H);
    ctx.stroke();
  }

  ctx.strokeStyle = LINE_STRONG;
  ctx.strokeRect(PAD + 0.5, gridTop + 0.5, width - PAD * 2 - 1, COL_HEAD + slots.length * ROW_H);

  // ---- bookings ----
  const columnIndex = new Map(columns.map((column, index) => [column.id, index]));
  for (const entry of entries) {
    const key = columnOf(entry);
    const index = key === undefined ? undefined : columnIndex.get(key);
    if (index === undefined) continue;

    const x = gridLeft + index * COL_W + 3;
    const y = rowsTop + ((entry.startMin - dayStartMin) / SLOT_MIN) * ROW_H + 2;
    const w = COL_W - 7;
    const h = Math.max(ROW_H - 4, ((entry.endMin - entry.startMin) / SLOT_MIN) * ROW_H - 4);
    const mine = Boolean(mineId && entry.proMembershipId === mineId);

    roundRect(ctx, x, y, w, h, 5);
    ctx.fillStyle = mine ? ACCENT_SOFT : PAPER;
    ctx.fill();
    ctx.strokeStyle = mine ? ACCENT : LINE_STRONG;
    ctx.lineWidth = mine ? 1.5 : 1;
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `${mine ? 600 : 500} 13px ${FONT}`;
    ctx.fillText(clip(ctx, entry.label, w - 16), x + 8, y + 17);

    if (h > 30) {
      const coach =
        entry.proMembershipId && members
          ? (members.get(entry.proMembershipId)?.displayName.split(/\s+/)[0] ?? null)
          : null;
      ctx.fillStyle = MUTED;
      ctx.font = `400 11.5px ${FONT}`;
      const meta =
        formatSpan(entry.startMin, entry.endMin) + (coach ? ` · ${coach}` : "");
      ctx.fillText(clip(ctx, meta, w - 16), x + 8, y + 33);
    }

    if (entry.requested) {
      ctx.fillStyle = "#8a6d1f";
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText("✳", x + w - 18, y + 17);
    }
  }

  // ---- footer ----
  ctx.fillStyle = FAINT;
  ctx.font = `400 11.5px ${FONT}`;
  ctx.fillText(
    `Saved from Courtime · ${new Date().toLocaleString()}`,
    PAD,
    height - PAD + 6,
  );

  return canvas;
}

export type SaveOutcome = "shared" | "downloaded" | "failed";

export async function saveDayImage(input: DayImageInput): Promise<SaveOutcome> {
  const canvas = drawDay(input);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), "image/png"),
  );
  if (!blob) return "failed";

  const name = `${slug(input.clubName)}-${input.date}.png`;
  const file = new File([blob], name, { type: "image/png" });

  // The share sheet is how an image reaches a phone's gallery. Desktop browsers
  // either don't have it or can't take files, so they fall through to a save.
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      // Some browsers advertise the API and then never settle the promise once
      // the sheet is up. Racing it means the button can't be left spinning; if
      // the timer wins we assume the sheet is open and don't also download,
      // because two copies of the day is worse than none.
      const timedOut = Symbol("timeout");
      const raced = await Promise.race([
        nav
          .share({
            files: [file],
            title: `${input.clubName} — ${formatDateLong(input.date)}`,
          })
          .then(() => "shared" as const),
        new Promise<typeof timedOut>((resolve) =>
          window.setTimeout(() => resolve(timedOut), 20_000),
        ),
      ]);
      return raced === timedOut ? "shared" : raced;
    } catch (error) {
      // A cancelled share sheet is a decision, not a failure — don't then shove
      // a download at someone who just backed out.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked late: Safari reads the blob after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ellipsis rather than overflow — a name running into the next court is worse. */
function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "courtime"
  );
}
