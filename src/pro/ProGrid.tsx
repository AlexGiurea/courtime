import { useMemo } from "react";
import { SLOT_MIN, formatSpan, formatTimeShort } from "../lib/time";
import { type Member, type ScheduleEntry } from "./data";

/**
 * The desk's grid, read-only and sized for a hand.
 *
 * Both coach calendar screens are this component: "My week" gives it one column
 * (the coach), "The club" gives it every court. Keeping one grid means a lesson
 * looks and reads the same whichever screen the coach is on, and the print and
 * image exports only ever have one layout to reproduce.
 */

export type GridColumn = {
  id: string;
  name: string;
  /** Second line under the heading — the coach on a court, or the date. */
  sub?: string;
};

/** 34px is the desk's row. A phone needs the same 30 minutes to stay tappable. */
const BASE_ROW = 34;
const BASE_COL = 132;
const TIME_COL = 46;

export default function ProGrid({
  columns,
  entries,
  columnOf,
  dayStartMin,
  dayEndMin,
  members,
  mineId,
  zoom = 1,
  gridRef,
}: {
  columns: GridColumn[];
  entries: ScheduleEntry[];
  /** Which column an entry belongs in — court id here, coach id on My week. */
  columnOf: (entry: ScheduleEntry) => string | undefined;
  dayStartMin: number;
  dayEndMin: number;
  members?: Map<string, Member>;
  mineId?: string;
  zoom?: number;
  gridRef?: React.Ref<HTMLDivElement>;
}) {
  const slots = useMemo(() => {
    const out: number[] = [];
    for (let t = dayStartMin; t < dayEndMin; t += SLOT_MIN) out.push(t);
    return out;
  }, [dayStartMin, dayEndMin]);

  const columnIndex = useMemo(
    () => new Map(columns.map((column, index) => [column.id, index])),
    [columns],
  );

  const row = Math.round(BASE_ROW * zoom);
  const col = Math.round(BASE_COL * zoom);
  const timeCol = Math.round(TIME_COL * zoom);

  return (
    <div className="pro-grid-wrap">
      <div
        className="pro-grid"
        ref={gridRef}
        style={{
          gridTemplateColumns: `${timeCol}px repeat(${columns.length}, minmax(${col}px, 1fr))`,
          gridTemplateRows: `auto repeat(${slots.length}, ${row}px)`,
          fontSize: `${Math.round(12 * Math.min(zoom, 1.25))}px`,
        }}
      >
        <div className="pro-grid-head corner" style={{ gridRow: 1, gridColumn: 1 }} />
        {columns.map((column, index) => (
          <div
            className="pro-grid-head"
            key={column.id}
            style={{ gridRow: 1, gridColumn: index + 2 }}
          >
            {column.name}
            {column.sub ? <span className="coach">{column.sub}</span> : null}
          </div>
        ))}

        {slots.map((min, slotIndex) => (
          <div
            key={`t-${min}`}
            className={`pro-grid-time${min % 60 === 0 ? " hour" : ""}`}
            style={{ gridRow: slotIndex + 2, gridColumn: 1 }}
          >
            {min % 60 === 0 ? formatTimeShort(min) : ""}
          </div>
        ))}

        {slots.map((min, slotIndex) =>
          columns.map((column, index) => (
            <div
              key={`c-${column.id}-${min}`}
              className={`pro-grid-cell${min % 60 === 30 ? " half" : ""}`}
              style={{ gridRow: slotIndex + 2, gridColumn: index + 2 }}
            />
          )),
        )}

        {entries.map((entry) => {
          const key = columnOf(entry);
          const index = key === undefined ? undefined : columnIndex.get(key);
          if (index === undefined) return null;

          const startRow = Math.round((entry.startMin - dayStartMin) / SLOT_MIN) + 2;
          const span = Math.max(1, Math.round((entry.endMin - entry.startMin) / SLOT_MIN));
          const coach =
            entry.proMembershipId && members
              ? (members.get(entry.proMembershipId)?.displayName ?? null)
              : null;
          const mine = Boolean(mineId && entry.proMembershipId === mineId);

          return (
            <div
              key={entry._id}
              className={`pro-entry${mine ? " mine" : ""}${entry.proMembershipId ? "" : " open-play"}`}
              style={{
                gridColumn: index + 2,
                gridRow: `${startRow} / span ${span}`,
              }}
            >
              <span className="pro-entry-label">
                {entry.label}
                {entry.requested ? <span className="pro-entry-star">✳</span> : null}
              </span>
              <span className="pro-entry-meta tabular">
                {formatSpan(entry.startMin, entry.endMin)}
                {coach ? ` · ${coach.split(/\s+/)[0]}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
