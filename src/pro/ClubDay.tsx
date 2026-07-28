import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { addDays, formatDateLong, relativeDayLabel } from "../lib/time";
import DayNav from "./DayNav";
import SessionRow from "./SessionRow";
import {
  memberMap,
  type ProData,
  type ScheduleEntry,
  sessionCount,
  useClock,
  useSwipeDays,
} from "./data";

/**
 * The whole club's day, read-only. Grouped by court because that is the shape of
 * the page on the desk — the question a coach is answering is usually "who has
 * court 3 at four?".
 */
export default function ClubDay({ pro }: { pro: ProData }) {
  const { today } = useClock();
  const [date, setDate] = useState(today);

  const result = useQuery(api.schedule.clubDay, { date });
  const members = useMemo(() => memberMap(pro.members), [pro.members]);
  const swipe = useSwipeDays(
    () => setDate((current) => addDays(current, -1)),
    () => setDate((current) => addDays(current, 1)),
  );

  const byCourt = useMemo(() => {
    const groups = new Map<string, ScheduleEntry[]>();
    for (const court of pro.courts) groups.set(court._id, []);
    const loose: ScheduleEntry[] = [];
    const all: ScheduleEntry[] = result?.entries ?? [];
    for (const entry of all) {
      const bucket = groups.get(entry.courtId);
      if (bucket) bucket.push(entry);
      else loose.push(entry);
    }
    return { groups, loose };
  }, [result, pro.courts]);

  return (
    <>
      <header className="pro-head">
        <h1>The club</h1>
        <p>Everyone's courts, so you know who's out there.</p>
      </header>

      <DayNav date={date} today={today} onChange={setDate} />

      <div {...swipe}>
        {result === undefined ? (
          <div className="pro-loading">
            <span className="spinner" />
            Loading the club's day…
          </div>
        ) : result === null || result.allowed === false ? (
          <Restricted />
        ) : result.entries.length === 0 ? (
          <div className="empty">
            <p className="empty-line">
              No courts booked{" "}
              {relativeDayLabel(date, today)?.toLowerCase() ??
                `on ${formatDateLong(date).split(",")[0]}`}
              .
            </p>
            <p className="empty-sub">The whole club is open — for now.</p>
          </div>
        ) : (
          <>
            <p className="pro-summary tabular">
              {sessionCount(result.entries.length)} across the club
            </p>

            {pro.courts.map((court) => {
              const entries = byCourt.groups.get(court._id) ?? [];
              return (
                <section className="daygroup" key={court._id}>
                  <h3>
                    <span>{court.name}</span>
                    <span className="total tabular">
                      {entries.length === 0 ? "Open all day" : sessionCount(entries.length)}
                    </span>
                  </h3>
                  {entries.length === 0 ? (
                    <p className="day-clear">Nothing booked.</p>
                  ) : (
                    <ul className="session-list">
                      {entries.map((entry) => (
                        <SessionRow
                          key={entry._id}
                          entry={entry}
                          courtName={court.name}
                          showCoach
                          coach={
                            entry.proMembershipId
                              ? (members.get(entry.proMembershipId) ?? null)
                              : null
                          }
                          mine={entry.proMembershipId === pro.membershipId}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            {byCourt.loose.length > 0 ? (
              <section className="daygroup">
                <h3>
                  <span>Other courts</span>
                </h3>
                <ul className="session-list">
                  {byCourt.loose.map((entry) => (
                    <SessionRow
                      key={entry._id}
                      entry={entry}
                      courtName="Court"
                      showCoach
                      coach={
                        entry.proMembershipId
                          ? (members.get(entry.proMembershipId) ?? null)
                          : null
                      }
                      mine={entry.proMembershipId === pro.membershipId}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function Restricted() {
  return (
    <div className="card card-pad">
      <h4 className="restricted-title">This club keeps the full day private</h4>
      <p className="restricted-copy">
        Your own hours are always here and always current. If you need to see the
        rest of the club's courts, an admin can switch it on in the club's
        settings.
      </p>
    </div>
  );
}
