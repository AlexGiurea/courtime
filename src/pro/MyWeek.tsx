import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  addDays,
  durationLabel,
  formatDateMedium,
  relativeDayLabel,
} from "../lib/time";
import SessionRow from "./SessionRow";
import {
  courtNameMap,
  groupByDate,
  type ProData,
  type ScheduleEntry,
  sessionCount,
  totalMinutes,
  useClock,
} from "./data";

const SPAN = 7;

export default function MyWeek({ pro }: { pro: ProData }) {
  const { today } = useClock();
  const days = useMemo(
    () => Array.from({ length: SPAN }, (_, offset) => addDays(today, offset)),
    [today],
  );

  const result = useQuery(api.schedule.mySchedule, {
    startDate: days[0],
    endDate: days[SPAN - 1],
  });
  const entries: ScheduleEntry[] | undefined =
    result === undefined ? undefined : (result?.entries ?? []);

  const courts = useMemo(() => courtNameMap(pro.courts), [pro.courts]);
  // mySchedule returns the whole range in one sorted list, so the day buckets
  // are made here rather than with seven queries.
  const byDate = useMemo(() => groupByDate(entries ?? []), [entries]);

  return (
    <>
      <header className="pro-head">
        <h1>My week</h1>
        <p>The next seven days, updating as the desk works.</p>
      </header>

      {entries === undefined ? (
        <div className="pro-loading">
          <span className="spinner" />
          Loading your week…
        </div>
      ) : (
        <>
          <p className="pro-summary tabular">
            {entries.length === 0
              ? "Nothing on the book this week."
              : `${sessionCount(entries.length)} · ${durationLabel(0, totalMinutes(entries))} on court`}
          </p>

          {days.map((day) => {
            const dayEntries = byDate.get(day) ?? [];
            const heading = relativeDayLabel(day, today) ?? formatDateMedium(day);
            return (
              <section className="daygroup" key={day}>
                <h3>
                  <span>{heading}</span>
                  <span className="total tabular">
                    {dayEntries.length === 0
                      ? "Clear"
                      : `${sessionCount(dayEntries.length)} · ${durationLabel(0, totalMinutes(dayEntries))}`}
                  </span>
                </h3>
                {dayEntries.length === 0 ? (
                  <p className="day-clear">Nothing on the book.</p>
                ) : (
                  <ul className="session-list">
                    {dayEntries.map((entry) => (
                      <SessionRow
                        key={entry._id}
                        entry={entry}
                        courtName={courts.get(entry.courtId) ?? "Court"}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
