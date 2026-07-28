import { type TouchEvent, useEffect, useRef, useState } from "react";
import { todayIso } from "../lib/time";

/**
 * Structural shapes for everything the pro screens read. They mirror the Convex
 * documents rather than importing their generated types, so the pro side stays
 * compilable while the backend's generated api is being regenerated next door.
 */

export type ScheduleEntry = {
  _id: string;
  courtId: string;
  date: string;
  startMin: number;
  endMin: number;
  label: string;
  sessionType?: string;
  notes?: string;
  proMembershipId?: string;
};

export type Court = { _id: string; name: string; sortOrder: number };

export type Member = {
  _id: string;
  displayName: string;
  role: string;
  color: string;
};

export type ChangeAlert = {
  _id: string;
  summary: string;
  changeType: string;
  date: string;
  _creationTime: number;
};

/** Everything the shell already knows, handed down so each screen reads one query. */
export type ProData = {
  membershipId: string;
  displayName: string;
  orgName: string;
  courts: Court[];
  members: Member[];
};

export function courtNameMap(courts: Court[]): Map<string, string> {
  return new Map(courts.map((court) => [court._id, court.name]));
}

export function memberMap(members: Member[]): Map<string, Member> {
  return new Map(members.map((member) => [member._id, member]));
}

export function groupByDate(entries: ScheduleEntry[]): Map<string, ScheduleEntry[]> {
  const groups = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.date);
    if (bucket) bucket.push(entry);
    else groups.set(entry.date, [entry]);
  }
  return groups;
}

export function totalMinutes(entries: ScheduleEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.endMin - entry.startMin), 0);
}

export function sessionCount(count: number): string {
  return `${count} session${count === 1 ? "" : "s"}`;
}

/**
 * One shared heartbeat for "what day is it" and "what time is it" — the next-up
 * highlight moves on its own without the coach touching anything.
 */
export function useClock(): { today: string; nowMin: number } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return {
    today: todayIso(),
    nowMin: now.getHours() * 60 + now.getMinutes(),
  };
}

/**
 * Horizontal swipe to step days, the way a native calendar behaves. Nothing is
 * ever prevented, so vertical scrolling is untouched — a swipe only counts when
 * it is clearly sideways.
 */
export function useSwipeDays(
  onPrev: () => void,
  onNext: () => void,
): {
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLDivElement>) => void;
} {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event) => {
      const touch = event.touches[0];
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event) => {
      const origin = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}

/** "12m ago" / "3h ago" / "Yesterday" for the change feed. */
export function sinceLabel(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const CHANGE_WORDS: Record<string, string> = {
  created: "Added",
  moved: "Moved",
  edited: "Updated",
  deleted: "Cancelled",
  imported: "Imported",
};

export function changeWord(changeType: string): string {
  return CHANGE_WORDS[changeType] ?? "Changed";
}

export function changeTone(changeType: string): string {
  if (changeType === "deleted") return "tag danger";
  if (changeType === "moved") return "tag warn";
  return "tag accent";
}
