import { KeyboardEvent, useMemo, useRef, useState } from "react";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { SLOT_MIN, formatTimeShort, formatTime } from "../lib/time";

const ROW_HEIGHT = 34;

export type GridEntry = Doc<"entries">;

export default function DayGrid({
  session,
  entries,
  readOnly,
  onCreate,
  onOpen,
}: {
  session: SessionWithClub;
  entries: GridEntry[];
  readOnly?: boolean;
  onCreate: (courtId: Id<"courts">, startMin: number, seedText?: string) => void;
  onOpen: (entry: GridEntry) => void;
}) {
  const { org, courts, members, membership } = session;
  const [focus, setFocus] = useState<{ court: number; slot: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let t = org.dayStartMin; t < org.dayEndMin; t += SLOT_MIN) out.push(t);
    return out;
  }, [org.dayStartMin, org.dayEndMin]);

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof members)[number]>();
    for (const member of members) map.set(member._id as string, member);
    return map;
  }, [members]);

  // The paper book writes the day's coach at the top of each court column;
  // mirror that by showing whoever holds the most hours on that court today.
  const coachByCourt = useMemo(() => {
    const tally = new Map<string, Map<string, number>>();
    for (const entry of entries) {
      if (!entry.proMembershipId) continue;
      const court = entry.courtId as string;
      const inner = tally.get(court) ?? new Map<string, number>();
      const pro = entry.proMembershipId as string;
      inner.set(pro, (inner.get(pro) ?? 0) + (entry.endMin - entry.startMin));
      tally.set(court, inner);
    }
    const out = new Map<string, string>();
    for (const [court, inner] of tally) {
      let best: string | null = null;
      let bestMinutes = 0;
      for (const [pro, minutes] of inner) {
        if (minutes > bestMinutes) {
          best = pro;
          bestMinutes = minutes;
        }
      }
      if (best) out.set(court, memberById.get(best)?.displayName ?? "");
    }
    return out;
  }, [entries, memberById]);

  const courtIndexById = useMemo(() => {
    const map = new Map<string, number>();
    courts.forEach((court, index) => map.set(court._id as string, index));
    return map;
  }, [courts]);

  function slotRowOf(min: number): number {
    return Math.max(0, Math.round((min - org.dayStartMin) / SLOT_MIN));
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!focus) return;
    const { key } = event;

    if (key === "Escape") {
      setFocus(null);
      gridRef.current?.blur();
      return;
    }

    const move = (dCourt: number, dSlot: number) => {
      event.preventDefault();
      event.stopPropagation();
      setFocus({
        court: Math.min(Math.max(focus.court + dCourt, 0), courts.length - 1),
        slot: Math.min(Math.max(focus.slot + dSlot, 0), slots.length - 1),
      });
    };

    if (key === "ArrowLeft") return move(-1, 0);
    if (key === "ArrowRight") return move(1, 0);
    if (key === "ArrowUp") return move(0, -1);
    if (key === "ArrowDown") return move(0, 1);

    if (readOnly) return;

    if (key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onCreate(courts[focus.court]._id, slots[focus.slot]);
      return;
    }

    // Typing straight into a cell is how a busy desk actually books a court.
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      onCreate(courts[focus.court]._id, slots[focus.slot], key);
    }
  }

  if (!courts.length) {
    return (
      <div className="card">
        <p className="empty">
          This club has no courts yet. Add them in Settings and the grid appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid-wrap">
      <div
        ref={gridRef}
        className="grid"
        tabIndex={-1}
        onKeyDown={onGridKeyDown}
        style={{
          gridTemplateColumns: `60px repeat(${courts.length}, minmax(150px, 1fr))`,
          gridTemplateRows: `auto repeat(${slots.length}, ${ROW_HEIGHT}px)`,
        }}
      >
        <div className="grid-head corner" style={{ gridRow: 1, gridColumn: 1 }} />
        {courts.map((court, index) => (
          <div
            className="grid-head"
            key={court._id as string}
            style={{ gridRow: 1, gridColumn: index + 2 }}
          >
            {court.name}
            <span className="coach">{coachByCourt.get(court._id as string) || "Open play"}</span>
          </div>
        ))}

        {slots.map((min, slotIndex) => (
          <div
            key={`t-${min}`}
            className={`grid-time${min % 60 === 0 ? " hour" : ""}`}
            style={{ gridRow: slotIndex + 2, gridColumn: 1 }}
          >
            {min % 60 === 0 ? formatTimeShort(min) : ""}
          </div>
        ))}

        {slots.map((min, slotIndex) =>
          courts.map((court, courtIndex) => (
            <button
              key={`c-${court._id as string}-${min}`}
              type="button"
              tabIndex={-1}
              aria-label={`${court.name} at ${formatTime(min)}`}
              className={`grid-cell${min % 60 === 30 ? " half" : ""}${
                focus && focus.court === courtIndex && focus.slot === slotIndex
                  ? " focused"
                  : ""
              }`}
              style={{ gridRow: slotIndex + 2, gridColumn: courtIndex + 2 }}
              onClick={() => {
                setFocus({ court: courtIndex, slot: slotIndex });
                gridRef.current?.focus();
                if (!readOnly) onCreate(court._id, min);
              }}
            />
          )),
        )}

        {entries.map((entry) => {
          const courtIndex = courtIndexById.get(entry.courtId as string);
          if (courtIndex === undefined) return null;
          const startRow = slotRowOf(entry.startMin);
          const span = Math.max(
            1,
            Math.round((entry.endMin - entry.startMin) / SLOT_MIN),
          );
          if (startRow >= slots.length) return null;

          const pro = entry.proMembershipId
            ? memberById.get(entry.proMembershipId as string)
            : undefined;
          const isMine = entry.proMembershipId === membership._id;

          return (
            <button
              key={entry._id as string}
              type="button"
              className={`entry${isMine ? " mine" : ""}${pro ? "" : " open-play"}`}
              style={{
                gridRow: `${startRow + 2} / span ${Math.min(span, slots.length - startRow)}`,
                gridColumn: courtIndex + 2,
                borderLeftColor: pro?.color ?? undefined,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onOpen(entry);
              }}
              title={`${entry.label} · ${formatTime(entry.startMin)}–${formatTime(entry.endMin)}${
                pro ? ` · ${pro.displayName}` : ""
              }`}
            >
              <span className="entry-label">{entry.label}</span>
              <span className="entry-meta">
                {formatTimeShort(entry.startMin)}–{formatTimeShort(entry.endMin)}
                {pro ? ` · ${pro.displayName.split(" ")[0]}` : ""}
                {entry.source === "import" ? " · imported" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
