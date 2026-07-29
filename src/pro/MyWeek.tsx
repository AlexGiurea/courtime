import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  addDays,
  durationLabel,
  formatDateMedium,
  relativeDayLabel,
} from "../lib/time";
import DayNav from "./DayNav";
import ProGrid from "./ProGrid";
import {
  courtNameMap,
  groupByDate,
  type ProData,
  type ScheduleEntry,
  sessionCount,
  totalMinutes,
  useClock,
  useSwipeDays,
  weekRange,
} from "./data";

const DAY_OFF = [
  "A day off. Enjoy it.",
  "Nothing on the book — the day is yours.",
  "No lessons today. Go hit some balls for yourself.",
  "Clear all day. Somebody else is on court.",
];

/**
 * The coach's own day, in the same calendar shape the desk uses — one column,
 * because a coach has one body and can only be on one court at a time. Arrows
 * walk through the week a day at a time; the strip above always totals the
 * business week the day falls in, which is the number that matters at payroll.
 */
export default function MyWeek({ pro }: { pro: ProData }) {
  const { today } = useClock();
  const [date, setDate] = useState(today);

  const week = useMemo(() => weekRange(date), [date]);
  const result = useQuery(api.schedule.mySchedule, {
    startDate: week.start,
    endDate: week.end,
  });
  const entries: ScheduleEntry[] | undefined =
    result === undefined ? undefined : (result?.entries ?? []);

  const courts = useMemo(() => courtNameMap(pro.courts), [pro.courts]);
  const byDate = useMemo(() => groupByDate(entries ?? []), [entries]);
  const dayEntries = useMemo(() => byDate.get(date) ?? [], [byDate, date]);

  const swipe = useSwipeDays(
    () => setDate((current) => addDays(current, -1)),
    () => setDate((current) => addDays(current, 1)),
  );

  // One column, so every lesson lands in it whatever court it is on. The court
  // name rides on the chip instead of being the column heading.
  const columns = useMemo(
    () => [
      {
        id: "me",
        name: pro.displayName.split(/\s+/)[0] ?? "My day",
        sub: relativeDayLabel(date, today) ?? formatDateMedium(date),
      },
    ],
    [pro.displayName, date, today],
  );

  const labelled = useMemo(
    () =>
      dayEntries.map((entry) => ({
        ...entry,
        label: `${entry.label} · ${courts.get(entry.courtId) ?? "Court"}`,
      })),
    [dayEntries, courts],
  );

  const weekMinutes = totalMinutes(entries ?? []);
  const dayOff = DAY_OFF[stableHash(date) % DAY_OFF.length];

  return (
    <>
      <header className="pro-head">
        <h1>My week</h1>
        <p>Your lessons, day by day, updating as the desk works.</p>
      </header>

      {/* Monday to Sunday, not seven days from wherever you happen to be. */}
      <div className="week-total">
        <div>
          <span className="week-total-label">
            {formatDateMedium(week.start)} – {formatDateMedium(week.end)}
          </span>
          <strong className="tabular">
            {entries === undefined
              ? "—"
              : weekMinutes === 0
                ? "No hours booked"
                : `${durationLabel(0, weekMinutes)} this week`}
          </strong>
        </div>
        <span className="week-total-sub tabular">
          {entries === undefined ? "" : sessionCount(entries.length)}
        </span>
      </div>

      <DayNav date={date} today={today} onChange={setDate} />

      {entries === undefined ? (
        <div className="pro-loading">
          <span className="spinner" />
          Loading your week…
        </div>
      ) : (
        <div {...swipe}>
          <p className="pro-summary tabular">
            {dayEntries.length === 0
              ? "Clear"
              : `${sessionCount(dayEntries.length)} · ${durationLabel(0, totalMinutes(dayEntries))} on court`}
          </p>

          {dayEntries.length === 0 ? (
            <DayOff line={dayOff} />
          ) : (
            <ProGrid
              columns={columns}
              entries={labelled}
              columnOf={() => "me"}
              dayStartMin={pro.dayStartMin}
              dayEndMin={pro.dayEndMin}
              mineId={pro.membershipId}
            />
          )}
        </div>
      )}
    </>
  );
}

function DayOff({ line }: { line: string }) {
  return (
    <div className="day-off">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="2" opacity="0.35" />
        <path
          d="M22 33.5c3.6 3.4 7 5 10 5s6.4-1.6 10-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="25.5" cy="27" r="1.8" fill="currentColor" />
        <circle cx="38.5" cy="27" r="1.8" fill="currentColor" />
      </svg>
      <h3>{line}</h3>
      <p>Nothing is booked with you. If that changes, your phone will say so.</p>
    </div>
  );
}

/** Stable per date, so the message doesn't reshuffle on every render. */
function stableHash(iso: string): number {
  let total = 0;
  for (const char of iso) total += char.charCodeAt(0);
  return total;
}
