import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Avatar, useGuarded } from "../ui";
import { formatTime } from "../lib/time";
import { ShortcutTable } from "./ShortcutsOverlay";

const HOUR_CHOICES = Array.from({ length: 19 }, (_, i) => (i + 5) * 60);

/** Enough of the world for racquet clubs, plus whatever this browser is in. */
const BASE_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Bucharest",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const guessedZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

const ZONES = [...new Set([guessedZone, ...BASE_ZONES])];

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0 — the complete calendar, forever",
    features: [
      "Day grid, keyboard navigation, printable day sheets",
      "Photo import with human review",
      "Every coach on their phone, live",
      "Change alerts when a booking moves",
      "Today-at-a-glance counts",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$19 per club each month — flat, never per coach",
    features: [
      "Court utilisation and coach load over any period",
      "Hours export for payroll, as a CSV",
      "Everything in Free",
    ],
  },
];

export default function SettingsPage({ session }: { session: SessionWithClub }) {
  const { org, courts, members, membership } = session;
  const setPlan = useMutation(api.app.setPlan);
  const updateOrg = useMutation(api.app.updateOrg);
  const upsertCourt = useMutation(api.app.upsertCourt);
  const inviteMember = useMutation(api.app.inviteMember);
  const setMemberRate = useMutation(api.app.setMemberRate);
  const updateMember = useMutation(api.app.updateMember);
  const guarded = useGuarded();

  const isAdmin = membership.role === "admin";
  const canEdit = membership.role !== "pro";
  const [name, setName] = useState(org.name);
  const [dayStartMin, setDayStartMin] = useState(org.dayStartMin);
  const [dayEndMin, setDayEndMin] = useState(org.dayEndMin);
  const [newCourt, setNewCourt] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff" | "pro">("pro");

  const dirty =
    name !== org.name || dayStartMin !== org.dayStartMin || dayEndMin !== org.dayEndMin;

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Club settings</h1>
          <p>Courts, staff and hours. Everything here is safe to change later.</p>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Plan</h2>
              <p>
                Switch tiers to see exactly what each one includes — this demo lets you
                move freely between them.
              </p>
            </div>
            <span className={`tag${org.plan === "pro" ? " accent" : ""}`}>
              {org.plan === "pro" ? "Pro" : "Free"}
            </span>
          </div>
          <div className="card-pad">
            <div className="plan-grid">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  className="plan-card"
                  data-active={org.plan === plan.id}
                  disabled={!isAdmin}
                  onClick={() =>
                    void guarded(
                      () => setPlan({ plan: plan.id }),
                      plan.id === "pro"
                        ? "Pro features unlocked"
                        : "Switched to the free tier",
                    )
                  }
                >
                  <h4>
                    {plan.name}
                    {org.plan === plan.id ? " · current" : ""}
                  </h4>
                  <div className="price">{plan.price}</div>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>The club</h2>
              <p>The hours here set the first and last row of the grid.</p>
            </div>
          </div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label htmlFor="club-name">Name</label>
              <input
                id="club-name"
                className="input"
                value={name}
                disabled={!isAdmin}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="s-start">Day starts</label>
                <select
                  id="s-start"
                  className="select"
                  value={dayStartMin}
                  disabled={!isAdmin}
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
                <label htmlFor="s-end">Day ends</label>
                <select
                  id="s-end"
                  className="select"
                  value={dayEndMin}
                  disabled={!isAdmin}
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

            <div className="field">
              <label htmlFor="s-zone">Time zone</label>
              <select
                id="s-zone"
                className="select"
                value={org.timeZone ?? guessedZone}
                disabled={!isAdmin}
                onChange={(e) =>
                  void guarded(() => updateOrg({ timeZone: e.target.value }), "Time zone saved")
                }
              >
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <span className="hint">
                Only used for things Courtime starts on its own — the evening note to
                coaches goes out at six here, not six in London.
              </span>
            </div>

            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={org.prosCanSeeClub}
                disabled={!isAdmin}
                onChange={(e) =>
                  void guarded(() => updateOrg({ prosCanSeeClub: e.target.checked }))
                }
                style={{ marginTop: 3 }}
              />
              <span>
                Coaches can see the whole club's day
                <span className="hint" style={{ display: "block" }}>
                  Off means each coach sees only their own hours.
                </span>
              </span>
            </label>

            {isAdmin ? (
              <div>
                <button
                  className="btn primary"
                  disabled={!dirty || dayEndMin <= dayStartMin}
                  onClick={() =>
                    void guarded(
                      () => updateOrg({ name, dayStartMin, dayEndMin }),
                      "Club updated",
                    )
                  }
                >
                  Save changes
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Courts</h2>
              <p>These are the columns of the grid, left to right.</p>
            </div>
          </div>
          <div className="rows">
            {courts.map((court) => (
              <div className="row" key={court._id as string}>
                <span className="grow">
                  <input
                    className="input"
                    defaultValue={court.name}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== court.name) {
                        void guarded(() =>
                          upsertCourt({ courtId: court._id, name: value }),
                        );
                      }
                    }}
                  />
                </span>
                {isAdmin ? (
                  <button
                    className="btn sm ghost"
                    onClick={() =>
                      void guarded(
                        () =>
                          upsertCourt({
                            courtId: court._id,
                            name: court.name,
                            active: false,
                          }),
                        `${court.name} removed`,
                      )
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {isAdmin ? (
            <div className="card-pad" style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line)" }}>
              <input
                className="input"
                placeholder="Court 7, Stadium, Har-Tru 3…"
                value={newCourt}
                onChange={(e) => setNewCourt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCourt.trim()) {
                    void guarded(() => upsertCourt({ name: newCourt.trim() }), "Court added");
                    setNewCourt("");
                  }
                }}
              />
              <button
                className="btn"
                disabled={!newCourt.trim()}
                onClick={() => {
                  void guarded(() => upsertCourt({ name: newCourt.trim() }), "Court added");
                  setNewCourt("");
                }}
              >
                Add court
              </button>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Staff</h2>
              <p>
                Coaches sign in with the email listed here and land straight on their own
                schedule.
              </p>
            </div>
          </div>
          <div className="rows">
            {members.map((member) => (
              <div className="row" key={member._id as string}>
                <Avatar name={member.displayName} color={member.color} />
                <span className="grow">
                  <span className="title">{member.displayName}</span>
                  <span className="sub">
                    {member.email || "no email yet"}
                    {member.claimed ? "" : " · invited"}
                  </span>
                </span>
                {isAdmin && member.role === "pro" ? (
                  <label className="rate-field" title="What the club pays this coach an hour">
                    <span>$</span>
                    <input
                      className="input rate-input"
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="—"
                      defaultValue={
                        member.rateCents !== null ? (member.rateCents / 100).toFixed(2) : ""
                      }
                      aria-label={`Hourly rate for ${member.displayName}`}
                      onBlur={(event) => {
                        const raw = event.target.value.trim();
                        const next = raw === "" ? null : Math.round(Number(raw) * 100);
                        if (next !== member.rateCents) {
                          void guarded(
                            () =>
                              setMemberRate({
                                membershipId: member._id as Id<"memberships">,
                                rateCents: next,
                              }),
                            "Rate saved",
                          );
                        }
                      }}
                    />
                    <span className="per">/h</span>
                  </label>
                ) : null}
                {isAdmin && member._id !== membership._id ? (
                  <select
                    className="select"
                    style={{ width: 120 }}
                    value={member.role}
                    onChange={(e) =>
                      void guarded(() =>
                        updateMember({
                          memberId: member._id as Id<"memberships">,
                          role: e.target.value as "admin" | "staff" | "pro",
                        }),
                      )
                    }
                  >
                    <option value="pro">Coach</option>
                    <option value="staff">Front desk</option>
                    <option value="admin">Director</option>
                  </select>
                ) : (
                  <span className="tag">
                    {member.role === "pro"
                      ? "Coach"
                      : member.role === "staff"
                        ? "Front desk"
                        : "Director"}
                  </span>
                )}
              </div>
            ))}
          </div>

          {isAdmin ? (
            <div
              className="card-pad"
              style={{ display: "flex", gap: 8, borderTop: "1px solid var(--line)", flexWrap: "wrap" }}
            >
              <input
                className="input"
                style={{ flex: 1, minWidth: 140 }}
                placeholder="Name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <input
                className="input"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select
                className="select"
                style={{ width: 130 }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "staff" | "pro")}
              >
                <option value="pro">Coach</option>
                <option value="staff">Front desk</option>
                <option value="admin">Director</option>
              </select>
              <button
                className="btn"
                disabled={!inviteName.trim()}
                onClick={async () => {
                  const ok = await guarded(
                    () =>
                      inviteMember({
                        displayName: inviteName.trim(),
                        email: inviteEmail.trim(),
                        role: inviteRole,
                      }),
                    `${inviteName.trim()} added`,
                  );
                  if (ok) {
                    setInviteName("");
                    setInviteEmail("");
                  }
                }}
              >
                Add to staff
              </button>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Keyboard shortcuts</h2>
              <p>
                The desk is faster on the keyboard than on the mouse. Press{" "}
                <kbd>?</kbd> anywhere to bring this list up without leaving the day.
              </p>
            </div>
          </div>
          <div className="card-pad">
            <ShortcutTable canEdit={canEdit} showTempo={org.plan === "pro"} />
          </div>
        </div>
      </div>
    </div>
  );
}
