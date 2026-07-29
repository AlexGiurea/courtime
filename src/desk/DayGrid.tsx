import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { useGuarded } from "../ui";
import { SLOT_MIN, formatTimeShort, formatTime } from "../lib/time";
import { AsteriskMark } from "./marks";

const ROW_HEIGHT = 34;

export type GridEntry = Doc<"entries">;

type Drag = {
  entryId: Id<"entries">;
  courtId: Id<"courts">;
  startMin: number;
  originalEnd: number;
  pointerY: number;
  endMin: number;
  moved: boolean;
};

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

  const setRequested = useMutation(api.schedule.setRequested);
  const updateEntry = useMutation(api.schedule.updateEntry);
  const guarded = useGuarded();

  // A coach can reach the grid through the club view; nothing on it is theirs to move.
  const canEdit = !readOnly && membership.role !== "pro";

  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

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

  /* ---------- drag the bottom edge to lengthen a booking ---------- */

  function endDrag() {
    dragRef.current = null;
    setDrag(null);
  }

  // Escape gets the desk out of a drag it started by accident.
  useEffect(() => {
    if (!drag) return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      endDrag();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drag]);

  function onGripDown(event: ReactPointerEvent<HTMLDivElement>, entry: GridEntry) {
    if (!canEdit || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that has already been released can't be captured; the drag
      // still works, it just stops tracking if it leaves the chip.
    }
    const next: Drag = {
      entryId: entry._id,
      courtId: entry.courtId,
      startMin: entry.startMin,
      originalEnd: entry.endMin,
      pointerY: event.clientY,
      endMin: entry.endMin,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function onGripMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (!current) return;
    // Snap to the paper's own granularity: one row is one 30-minute slot.
    const rows = Math.round((event.clientY - current.pointerY) / ROW_HEIGHT);
    const endMin = Math.min(
      Math.max(current.originalEnd + rows * SLOT_MIN, current.startMin + SLOT_MIN),
      org.dayEndMin,
    );
    if (endMin === current.endMin) return;
    const next = { ...current, endMin, moved: true };
    dragRef.current = next;
    setDrag(next);
  }

  function onGripUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!current) return;
    if (current.endMin === current.originalEnd) {
      endDrag();
      return;
    }
    // Hold the preview until the server has ruled on it, then let the live
    // query take over — or snap back, with the reason in a toast.
    void guarded(async () => {
      await updateEntry({ entryId: current.entryId, endMin: current.endMin });
      return true;
    }).then(endDrag);
  }

  function toggleRequested(entry: GridEntry) {
    void guarded(async () => {
      await setRequested({ entryId: entry._id, requested: !entry.requested });
      return true;
    });
  }

  /* ---------- keyboard ---------- */

  function onGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
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

    if (!canEdit) return;

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
                if (canEdit) onCreate(court._id, min);
              }}
            />
          )),
        )}

        {entries.map((entry) => {
          const courtIndex = courtIndexById.get(entry.courtId as string);
          if (courtIndex === undefined) return null;
          const startRow = slotRowOf(entry.startMin);
          const dragging = drag?.entryId === entry._id;
          const endMin = dragging ? drag.endMin : entry.endMin;
          const span = Math.max(1, Math.round((endMin - entry.startMin) / SLOT_MIN));
          if (startRow >= slots.length) return null;

          const pro = entry.proMembershipId
            ? memberById.get(entry.proMembershipId as string)
            : undefined;
          const isMine = entry.proMembershipId === membership._id;
          const clash =
            dragging &&
            entries.some(
              (other) =>
                other._id !== entry._id &&
                other.courtId === entry.courtId &&
                entry.startMin < other.endMin &&
                endMin > other.startMin,
            );

          return (
            <div
              key={entry._id as string}
              role="button"
              tabIndex={0}
              className={`entry${isMine ? " mine" : ""}${pro ? "" : " open-play"}${
                dragging ? " resizing" : ""
              }${clash ? " clash" : ""}`}
              style={{
                gridRow: `${startRow + 2} / span ${Math.min(span, slots.length - startRow)}`,
                gridColumn: courtIndex + 2,
                borderLeftColor: pro?.color ?? undefined,
              }}
              onClick={(event) => {
                event.stopPropagation();
                // A drag that ended on the chip must not also open it.
                if (dragRef.current?.moved) return;
                onOpen(entry);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpen(entry);
                }
              }}
              title={`${entry.label} · ${formatTime(entry.startMin)}–${formatTime(endMin)}${
                pro ? ` · ${pro.displayName}` : ""
              }${entry.requested ? " · requested by name" : ""}`}
            >
              <span className="entry-line">
                <span className="entry-label">{entry.label}</span>
                {canEdit ? (
                  <button
                    type="button"
                    className={`entry-req${entry.requested ? " on" : ""}`}
                    aria-pressed={Boolean(entry.requested)}
                    title={
                      entry.requested
                        ? "Requested by name — click to clear"
                        : "Mark: this client asked for this pro by name"
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleRequested(entry);
                    }}
                  >
                    <AsteriskMark />
                  </button>
                ) : entry.requested ? (
                  <span className="entry-star" title="Requested by name">
                    <AsteriskMark />
                  </span>
                ) : null}
              </span>
              <span className="entry-meta">
                {formatTimeShort(entry.startMin)}–{formatTimeShort(endMin)}
                {pro ? ` · ${pro.displayName.split(" ")[0]}` : ""}
                {entry.source === "import" ? " · imported" : ""}
              </span>

              {canEdit ? (
                <div
                  className="entry-grip"
                  role="presentation"
                  onPointerDown={(event) => onGripDown(event, entry)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
