import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { BrandMark, useGuarded } from "../ui";
import { formatTime } from "../lib/time";

type Coach = { name: string; email: string };

const HOUR_CHOICES = Array.from({ length: 19 }, (_, i) => (i + 5) * 60); // 5:00 → 23:00

export default function Onboarding() {
  const createClub = useMutation(api.app.createClub);
  const { signOut } = useAuthActions();
  const guarded = useGuarded();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [dayStartMin, setDayStartMin] = useState(7 * 60);
  const [dayEndMin, setDayEndMin] = useState(19 * 60);
  const [courtCount, setCourtCount] = useState(4);
  const [courtNames, setCourtNames] = useState<string[]>([
    "Court 1",
    "Court 2",
    "Court 3",
    "Court 4",
  ]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");

  function resizeCourts(count: number) {
    const next = Math.max(1, Math.min(40, count));
    setCourtCount(next);
    setCourtNames((prev) => {
      const out = prev.slice(0, next);
      for (let i = out.length; i < next; i++) out.push(`Court ${i + 1}`);
      return out;
    });
  }

  function addCoach() {
    const trimmed = coachName.trim();
    if (!trimmed) return;
    setCoaches((prev) => [...prev, { name: trimmed, email: coachEmail.trim() }]);
    setCoachName("");
    setCoachEmail("");
  }

  async function finish() {
    setSaving(true);
    const result = await guarded(
      () =>
        createClub({
          name: name.trim(),
          courtNames,
          dayStartMin,
          dayEndMin,
          coaches,
        }),
      "Your club is set up",
    );
    if (!result) setSaving(false);
  }

  const canContinue =
    step === 0 ? name.trim().length > 1 && dayEndMin > dayStartMin : true;

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <span className="brand" style={{ color: "#fff" }}>
          <BrandMark />
          Courtime
        </span>
        <div>
          <h2>Three questions and your club is on the board.</h2>
          <p>
            Courts and coaches are all Courtime needs to draw your day. You can
            rename anything later — nothing here is permanent.
          </p>
        </div>
        <span />
      </aside>

      <main className="auth-main">
        <div className="auth-card" style={{ maxWidth: 440 }}>
          <div className="steps" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={`step-dot${index <= step ? " done" : ""}`}
              />
            ))}
          </div>

          {step === 0 ? (
            <>
              <h1>Your club</h1>
              <p className="sub">What should we put at the top of the schedule?</p>
              <div className="auth-form">
                <div className="field">
                  <label htmlFor="club">Club name</label>
                  <input
                    id="club"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Sea Island Club"
                    autoFocus
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="start">Day starts</label>
                    <select
                      id="start"
                      className="select"
                      value={dayStartMin}
                      onChange={(e) => setDayStartMin(Number(e.target.value))}
                    >
                      {HOUR_CHOICES.map((min) => (
                        <option key={min} value={min}>
                          {formatTime(min)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="end">Day ends</label>
                    <select
                      id="end"
                      className="select"
                      value={dayEndMin}
                      onChange={(e) => setDayEndMin(Number(e.target.value))}
                    >
                      {HOUR_CHOICES.map((min) => (
                        <option key={min} value={min}>
                          {formatTime(min)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {dayEndMin <= dayStartMin ? (
                  <span className="issue">The day has to end after it starts.</span>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1>Your courts</h1>
              <p className="sub">
                These become the columns of the grid, in this order.
              </p>
              <div className="auth-form">
                <div className="field">
                  <label htmlFor="count">How many courts?</label>
                  <input
                    id="count"
                    className="input"
                    type="number"
                    min={1}
                    max={40}
                    value={courtCount}
                    onChange={(e) => resizeCourts(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Names</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {courtNames.map((court, index) => (
                      <input
                        key={index}
                        className="input"
                        value={court}
                        onChange={(e) =>
                          setCourtNames((prev) =>
                            prev.map((c, i) => (i === index ? e.target.value : c)),
                          )
                        }
                      />
                    ))}
                  </div>
                  <span className="hint">
                    Rename any of these — "Stadium" and "Har-Tru 3" work fine.
                  </span>
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1>Your coaches</h1>
              <p className="sub">
                Each one gets their own phone view. Add an email and they can sign in
                with it; leave it blank and you can invite them later.
              </p>
              <div className="auth-form">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="coach">Name</label>
                    <input
                      id="coach"
                      className="input"
                      value={coachName}
                      placeholder="Danny Whitfield"
                      onChange={(e) => setCoachName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCoach();
                        }
                      }}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="coachEmail">Email (optional)</label>
                    <input
                      id="coachEmail"
                      className="input"
                      type="email"
                      value={coachEmail}
                      onChange={(e) => setCoachEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCoach();
                        }
                      }}
                    />
                  </div>
                  <button className="btn" type="button" onClick={addCoach}>
                    Add
                  </button>
                </div>

                {coaches.length ? (
                  <div className="chip-row">
                    {coaches.map((coach, index) => (
                      <span className="chip" key={`${coach.name}-${index}`}>
                        {coach.name}
                        <button
                          type="button"
                          aria-label={`Remove ${coach.name}`}
                          onClick={() =>
                            setCoaches((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="hint">
                    No coaches yet — you can run the desk on your own and add them
                    whenever.
                  </span>
                )}
              </div>
            </>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            {step > 0 ? (
              <button className="btn" onClick={() => setStep(step - 1)} disabled={saving}>
                Back
              </button>
            ) : null}
            <div style={{ flex: 1 }} />
            {step < 2 ? (
              <button
                className="btn primary"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue}
              >
                Continue
              </button>
            ) : (
              <button className="btn primary" onClick={() => void finish()} disabled={saving}>
                {saving ? <span className="spinner" /> : null}
                Open my schedule
              </button>
            )}
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: "var(--faint)" }}>
            Wrong account?{" "}
            <button className="btn ghost sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
