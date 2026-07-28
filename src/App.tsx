import { useState } from "react";

// Static demo data standing in for one captured day at the club.
// The real app replaces this with entries from the API (see docs/PRODUCT.md).
const COURTS = ["Court 1", "Court 2", "Court 3", "Court 4"];
const HOURS = ["8:00", "9:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00", "5:00"];

type Entry = { court: string; hour: string; pro: string; label: string };

const DAY: Entry[] = [
  { court: "Court 1", hour: "8:00", pro: "Alex", label: "Alex — Private (J. Miller)" },
  { court: "Court 1", hour: "9:00", pro: "Alex", label: "Alex — Private (S. Grant)" },
  { court: "Court 2", hour: "9:00", pro: "Danny", label: "Danny — Junior clinic" },
  { court: "Court 2", hour: "10:00", pro: "Danny", label: "Danny — Junior clinic" },
  { court: "Court 3", hour: "10:00", pro: "Alex", label: "Alex — Cardio group" },
  { court: "Court 1", hour: "11:00", pro: "Marta", label: "Marta — Private (K. Ellis)" },
  { court: "Court 4", hour: "2:00", pro: "Danny", label: "Danny — Private (R. Hayes)" },
  { court: "Court 2", hour: "3:00", pro: "Alex", label: "Alex — Private (T. Brooks)" },
  { court: "Court 3", hour: "4:00", pro: "Marta", label: "Marta — Ladies drill" },
];

const ME = "Alex";

function DeskView() {
  return (
    <section className="card">
      <h2>Front desk — full day grid</h2>
      <p className="sub">
        Everything on today's paper page, in one glance. Capture happens here: photo import or quick manual entry.
      </p>
      <div className="grid">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              {COURTS.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <th>{h}</th>
                {COURTS.map((c) => {
                  const entry = DAY.find((e) => e.court === c && e.hour === h);
                  return (
                    <td key={c}>
                      {entry ? <span className={entry.pro === ME ? "slot" : "slot other"}>{entry.label}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProView() {
  const mine = DAY.filter((e) => e.pro === ME);
  return (
    <section className="card">
      <h2>My day — {ME}</h2>
      <p className="sub">What a pro opens on their phone: just their hours, always current.</p>
      <ul className="mine-list">
        {mine.map((e) => (
          <li key={e.court + e.hour}>
            <span className="time">{e.hour}</span>
            <span className="what">{e.label.replace(`${ME} — `, "")}</span>
            <span className="where">{e.court}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function App() {
  const [role, setRole] = useState<"desk" | "pro">("desk");
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Courtime</h1>
          <span>the club's paper schedule, on every phone</span>
        </div>
        <nav className="role-toggle">
          <button className={role === "desk" ? "active" : ""} onClick={() => setRole("desk")}>
            Front desk
          </button>
          <button className={role === "pro" ? "active" : ""} onClick={() => setRole("pro")}>
            Pro
          </button>
        </nav>
      </header>

      {role === "desk" ? <DeskView /> : <ProView />}

      <p className="note">
        Concept shell with demo data — the two surfaces of the product. See docs/SPEC.md for the full design.
      </p>
    </div>
  );
}
