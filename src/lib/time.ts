/** Dates are "YYYY-MM-DD" in the club's own local time; times are minutes from midnight. */

export const SLOT_MIN = 30;

export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Day arithmetic runs through UTC so a DST boundary can't skip or repeat a day. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekdayIndex(iso: string): number {
  return isoToDate(iso).getUTCDay();
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatDateLong(iso: string): string {
  const date = isoToDate(iso);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export function formatDateMedium(iso: string): string {
  const date = isoToDate(iso);
  return `${WEEKDAYS[date.getUTCDay()].slice(0, 3)} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}

export function relativeDayLabel(iso: string, today: string): string | null {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  return null;
}

export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Compact form for dense grids: "3:00" with the meridiem left implicit. */
export function formatTimeShort(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`;
}

export function formatSpan(startMin: number, endMin: number): string {
  return `${formatTime(startMin)} – ${formatTime(endMin)}`;
}

export function durationLabel(startMin: number, endMin: number): string {
  const total = endMin - startMin;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function timeOptions(startMin: number, endMin: number): number[] {
  const out: number[] = [];
  for (let t = startMin; t <= endMin; t += SLOT_MIN) out.push(t);
  return out;
}

/**
 * Free-text date parsing for the command palette. Accepts "today", "tomorrow",
 * "next tuesday", "nov 12", "12/25", "2026-08-03" — whatever a front desk
 * actually types when a member is on the phone.
 */
export function parseDateQuery(input: string, today: string): string | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;

  if (q === "today" || q === "t") return today;
  if (q === "tomorrow" || q === "tmr") return addDays(today, 1);
  if (q === "yesterday") return addDays(today, -1);

  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;

  const inDays = q.match(/^in (\d{1,3}) days?$/);
  if (inDays) return addDays(today, Number(inDays[1]));

  const weekdayMatch = q.match(/^(next |this )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
  if (weekdayMatch) {
    const target = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(
      weekdayMatch[2],
    );
    const current = weekdayIndex(today);
    let delta = (target - current + 7) % 7;
    if (delta === 0) delta = 7;
    if (weekdayMatch[1]?.trim() === "next" && delta < 7) delta += 0;
    return addDays(today, delta);
  }

  const monthNames = MONTHS.map((m) => m.toLowerCase());
  const monthDay = q.match(/^([a-z]{3,9})\.?\s+(\d{1,2})$/);
  if (monthDay) {
    const monthIndex = monthNames.findIndex((m) => m.startsWith(monthDay[1]));
    const day = Number(monthDay[2]);
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const year = isoToDate(today).getUTCFullYear();
      const candidate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // A month that has already passed almost always means next year.
      return candidate < addDays(today, -120)
        ? `${year + 1}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : candidate;
    }
  }

  const slash = q.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : isoToDate(today).getUTCFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
