import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { addDays, durationLabel, formatDateLong, relativeDayLabel } from "../lib/time";
import DayNav from "./DayNav";
import NotificationsCard from "./NotificationsCard";
import RecentChanges from "./RecentChanges";
import SessionRow from "./SessionRow";
import {
  courtNameMap,
  type ProData,
  type ScheduleEntry,
  sessionCount,
  totalMinutes,
  useClock,
  useSwipeDays,
} from "./data";

export default function MyDay({ pro }: { pro: ProData }) {
  const { today, nowMin } = useClock();
  const [date, setDate] = useState(today);

  const result = useQuery(api.schedule.mySchedule, {
    startDate: date,
    endDate: date,
  });
  const entries: ScheduleEntry[] | undefined =
    result === undefined ? undefined : (result?.entries ?? []);

  const courts = useMemo(() => courtNameMap(pro.courts), [pro.courts]);
  const swipe = useSwipeDays(
    () => setDate((current) => addDays(current, -1)),
    () => setDate((current) => addDays(current, 1)),
  );

  // Only today has a "next" — on any other date every session is equally future.
  const liveId =
    date === today && entries
      ? entries.find((entry) => entry.endMin > nowMin)?._id
      : undefined;

  return (
    <>
      <header className="pro-head">
        <h1>My day</h1>
        <p>{greeting(nowMin, pro.displayName)}</p>
      </header>

      <NotificationsCard />
      <DayNav date={date} today={today} onChange={setDate} />

      <div {...swipe}>
        {entries === undefined ? (
          <div className="pro-loading">
            <span className="spinner" />
            Loading your day…
          </div>
        ) : entries.length === 0 ? (
          <EmptyDay date={date} today={today} />
        ) : (
          <>
            <p className="pro-summary tabular">
              {sessionCount(entries.length)} · {durationLabel(0, totalMinutes(entries))}{" "}
              on court
            </p>
            <ul className="session-list">
              {entries.map((entry) => (
                <SessionRow
                  key={entry._id}
                  entry={entry}
                  courtName={courts.get(entry.courtId) ?? "Court"}
                  state={
                    entry._id === liveId
                      ? entry.startMin <= nowMin
                        ? "now"
                        : "next"
                      : null
                  }
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <RecentChanges today={today} />
    </>
  );
}

function greeting(nowMin: number, name: string): string {
  const firstName = name.trim().split(/\s+/)[0] || name;
  const part = nowMin < 12 * 60 ? "morning" : nowMin < 17 * 60 ? "afternoon" : "evening";
  return `Good ${part}, ${firstName}.`;
}

function EmptyDay({ date, today }: { date: string; today: string }) {
  const relative = relativeDayLabel(date, today);
  const weekday = formatDateLong(date).split(",")[0];
  const line =
    relative === "Today"
      ? "Nothing on the book today."
      : relative === "Tomorrow"
        ? "Nothing on the book tomorrow."
        : relative === "Yesterday"
          ? "Nothing was on the book yesterday."
          : `Nothing on the book for ${weekday}.`;

  return (
    <div className="empty">
      <p className="empty-line">{line}</p>
      <p className="empty-sub">
        If that doesn't look right, the front desk can check the paper page.
      </p>
    </div>
  );
}
