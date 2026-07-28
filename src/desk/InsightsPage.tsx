import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SessionWithClub } from "../App";
import { Loading, useGuarded, useToast } from "../ui";
import { addDays, formatDateMedium, todayIso } from "../lib/time";

const PERIODS = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
];

function hours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export default function InsightsPage({ session }: { session: SessionWithClub }) {
  const [periodId, setPeriodId] = useState("30");
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[1];
  const today = todayIso();
  const startDate = addDays(today, -(period.days - 1));

  const data = useQuery(api.schedule.range, { startDate, endDate: today });
  const setPlan = useMutation(api.app.setPlan);
  const guarded = useGuarded();
  const notify = useToast();

  const memberById = useMemo(() => {
    const map = new Map<string, (typeof session.members)[number]>();
    for (const member of session.members) map.set(member._id as string, member);
    return map;
  }, [session.members]);

  const summary = useMemo(() => {
    const entries = data && !data.locked ? data.entries : [];

    const byPro = new Map<string, { minutes: number; sessions: number }>();
    const byCourt = new Map<string, number>();
    const byHour = new Map<number, number>();
    let coachedMinutes = 0;

    for (const entry of entries) {
      const minutes = entry.endMin - entry.startMin;
      const courtKey = entry.courtId as string;
      byCourt.set(courtKey, (byCourt.get(courtKey) ?? 0) + minutes);

      const hour = Math.floor(entry.startMin / 60);
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);

      if (entry.proMembershipId) {
        const key = entry.proMembershipId as string;
        const current = byPro.get(key) ?? { minutes: 0, sessions: 0 };
        byPro.set(key, {
          minutes: current.minutes + minutes,
          sessions: current.sessions + 1,
        });
        coachedMinutes += minutes;
      }
    }

    const proRows = [...byPro.entries()]
      .map(([id, value]) => ({
        id,
        name: memberById.get(id)?.displayName ?? "Former staff",
        color: memberById.get(id)?.color ?? "#8b949e",
        ...value,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const courtRows = session.courts.map((court) => ({
      id: court._id as string,
      name: court.name,
      minutes: byCourt.get(court._id as string) ?? 0,
    }));
    const busiestCourt = Math.max(1, ...courtRows.map((c) => c.minutes));

    const hourRows = [...byHour.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, count }));
    const busiestHour = Math.max(1, ...hourRows.map((h) => h.count));

    return {
      entries,
      proRows,
      courtRows,
      busiestCourt,
      hourRows,
      busiestHour,
      coachedMinutes,
    };
  }, [data, memberById, session.courts]);

  function exportCsv() {
    const lines = [["Coach", "Sessions", "Hours", "Period start", "Period end"].join(",")];
    for (const row of summary.proRows) {
      lines.push(
        [
          `"${row.name.replace(/"/g, '""')}"`,
          row.sessions,
          hours(row.minutes),
          startDate,
          today,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `courtime-hours-${startDate}-to-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Hours exported");
  }

  if (data === undefined) return <Loading label="Adding up the period" />;

  if (data === null) {
    return (
      <div className="page narrow">
        <p className="empty">Insights are available to the front desk and directors.</p>
      </div>
    );
  }

  if (data.locked) {
    return (
      <div className="page narrow">
        <div className="page-head">
          <div>
            <h1>Insights</h1>
            <p>Court use, coach load, and hours for payroll.</p>
          </div>
        </div>
        <div className="card card-pad" style={{ textAlign: "center", padding: 44 }}>
          <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>
            Pro
          </span>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
            This is where the month adds itself up
          </h2>
          <p className="muted" style={{ maxWidth: "48ch", margin: "0 auto 18px", fontSize: 13 }}>
            Which courts actually get used, how the teaching load falls across your
            coaches, and every coach's hours as a CSV your bookkeeper can open. The
            schedule itself stays free — this is the part that saves the office a
            morning.
          </p>
          {session.membership.role === "admin" ? (
            <button
              className="btn primary"
              onClick={() =>
                void guarded(() => setPlan({ plan: "pro" }), "Pro features unlocked")
              }
            >
              Switch this club to Pro
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>
              Ask your director to switch the club to Pro.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p>
            {formatDateMedium(startDate)} – {formatDateMedium(today)} ·{" "}
            {summary.entries.length} bookings · {hours(summary.coachedMinutes)} coached
            hours
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            className="select"
            style={{ width: 160 }}
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={exportCsv} disabled={!summary.proRows.length}>
            Export hours
          </button>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Coach hours</h2>
              <p>What each coach actually taught over the period — the payroll view.</p>
            </div>
          </div>
          {summary.proRows.length ? (
            <div className="rows">
              {summary.proRows.map((row) => (
                <div className="row" key={row.id}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: row.color,
                      flex: "none",
                    }}
                  />
                  <span className="grow">
                    <span className="title">{row.name}</span>
                    <span className="sub">{row.sessions} sessions</span>
                  </span>
                  <span className="tabular" style={{ fontWeight: 600 }}>
                    {hours(row.minutes)} h
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">No coached sessions in this period.</p>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Court use</h2>
              <p>Where the hours land. Empty columns are the ones worth selling.</p>
            </div>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {summary.courtRows.map((court) => (
              <div key={court.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 92, fontSize: 13 }}>{court.name}</span>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: "var(--wash-deep)",
                    borderRadius: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(court.minutes / summary.busiestCourt) * 100}%`,
                      height: "100%",
                      background: "var(--accent)",
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
                <span className="tabular muted" style={{ width: 62, textAlign: "right", fontSize: 12 }}>
                  {hours(court.minutes)} h
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>When the club is busy</h2>
              <p>Bookings by start time across the period.</p>
            </div>
          </div>
          <div className="card-pad">
            {summary.hourRows.length ? (
              <div style={{ display: "flex", gap: 5, height: 150 }}>
                {summary.hourRows.map((row) => (
                  <div
                    key={row.hour}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
                    title={`${row.count} bookings starting at ${row.hour}:00`}
                  >
                    {/* This wrapper resolves to a definite height, which is what
                        lets the bar's percentage height mean anything. */}
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                      <div
                        style={{
                          width: "100%",
                          height: `${(row.count / summary.busiestHour) * 100}%`,
                          minHeight: 3,
                          background: "var(--accent)",
                          borderRadius: "3px 3px 0 0",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: "var(--faint)", marginTop: 6 }}>
                      {row.hour % 12 === 0 ? 12 : row.hour % 12}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">Nothing booked in this period yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
