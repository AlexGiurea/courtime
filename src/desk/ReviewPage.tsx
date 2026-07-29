import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Loading, useGuarded } from "../ui";
import { SLOT_MIN, formatDateLong, formatTime, timeOptions, todayIso } from "../lib/time";

type PageDoc = Doc<"importPages">;

export default function ReviewPage({ session }: { session: SessionWithClub }) {
  const { pageId } = useParams();
  const data = useQuery(api.imports.page, { pageId: pageId as Id<"importPages"> });

  if (data === undefined) return <Loading label="Loading the page" />;
  if (data === null || !data.page) {
    return (
      <div className="page narrow">
        <p className="empty">That page isn't available.</p>
      </div>
    );
  }

  return data.page.pageKind === "clinics" ? (
    <ClinicReview
      session={session}
      page={data.page}
      photoUrl={data.photoUrl}
      inheritedDate={data.inheritedDate}
      inheritedFrom={data.inheritedFrom}
    />
  ) : (
    <ScheduleReview session={session} page={data.page} photoUrl={data.photoUrl} />
  );
}

function PageHeader({
  page,
  title,
  subtitle,
}: {
  page: PageDoc;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>
          {page.fileName} · read with {page.model ?? "the vision model"}
          {page.costUsd !== undefined ? ` · $${page.costUsd.toFixed(4)}` : ""}
          {page.durationMs ? ` · ${(page.durationMs / 1000).toFixed(1)}s` : ""}
          {subtitle ? ` · ${subtitle}` : ""}
        </p>
      </div>
      <Link className="btn" to={`/desk/import/${page.batchId}`}>
        Back to the batch
      </Link>
    </div>
  );
}

function PhotoPane({ photoUrl, fileName }: { photoUrl: string | null; fileName: string }) {
  return (
    <div className="photo-pane">
      {photoUrl ? (
        <a href={photoUrl} target="_blank" rel="noreferrer">
          <img src={photoUrl} alt={`Schedule page ${fileName}`} />
        </a>
      ) : (
        <p className="empty">The photo could not be loaded.</p>
      )}
      <p className="muted" style={{ fontSize: 12, margin: "8px 4px 2px" }}>
        Click the photo to open it full size.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The court grid                                                      */
/* ------------------------------------------------------------------ */

type Row = {
  key: string;
  courtId: string;
  startMin: number;
  endMin: number;
  label: string;
  proId: string;
  sessionType: string;
  notes: string;
  requested: boolean;
  issue: string | null;
  flagged: boolean;
};

function ScheduleReview({
  session,
  page,
  photoUrl,
}: {
  session: SessionWithClub;
  page: PageDoc;
  photoUrl: string | null;
}) {
  const confirmPage = useMutation(api.imports.confirmPage);
  const guarded = useGuarded();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [date, setDate] = useState("");
  const [dayNotes, setDayNotes] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rows !== null) return;
    const drafts = page.draftEntries ?? [];
    setRows(
      drafts.map((draft, index) => ({
        key: `${index}`,
        courtId: (draft.suggestedCourtId as string | undefined) ?? "",
        startMin: draft.startMin,
        endMin: draft.endMin,
        label: draft.label,
        proId: (draft.suggestedProId as string | undefined) ?? "",
        sessionType: draft.sessionType ?? "Private",
        notes: draft.notes ?? "",
        requested: draft.requested === true,
        issue: draft.issue,
        flagged: draft.confidence === "low",
      })),
    );
    setDate(page.detectedDate ?? todayIso());
    setDayNotes(page.dayNotes ?? "");
  }, [page, rows]);

  const starts = useMemo(
    () => timeOptions(session.org.dayStartMin, session.org.dayEndMin - SLOT_MIN),
    [session.org.dayStartMin, session.org.dayEndMin],
  );

  const list = rows ?? [];
  const flaggedCount = list.filter((row) => row.flagged).length;
  const unmatched = list.filter((row) => !row.courtId).length;

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => (prev ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function publish() {
    setBusy(true);
    const payload = list
      .filter((row) => row.courtId && row.label.trim())
      .map((row) => ({
        courtId: row.courtId as Id<"courts">,
        startMin: row.startMin,
        endMin: row.endMin,
        label: row.label.trim(),
        proMembershipId: row.proId ? (row.proId as Id<"memberships">) : undefined,
        sessionType: row.sessionType,
        notes: row.notes.trim() || undefined,
        requested: row.requested,
      }));

    const result = await guarded(
      () =>
        confirmPage({
          pageId: page._id,
          date,
          entries: payload,
          dayNotes,
          replaceExisting,
        }),
      "Published to the schedule",
    );
    setBusy(false);
    if (result) navigate(`/desk/import/${page.batchId}`);
  }

  return (
    <div className="page">
      <PageHeader page={page} title="Check the read" subtitle="court grid" />

      {page.warnings?.length ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 13 }}>The model flagged:</strong>
          <ul className="muted" style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {page.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="review-split">
        <PhotoPane photoUrl={photoUrl} fileName={page.fileName} />

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div
              className="card-pad"
              style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
            >
              <div className="field" style={{ flex: 1, minWidth: 190 }}>
                <label htmlFor="page-date">This page is for</label>
                <input
                  id="page-date"
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <span className="hint">{date ? formatDateLong(date) : "Pick a date"}</span>
              </div>
              <label
                style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, paddingBottom: 8 }}
              >
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                Replace what's already on this day
              </label>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-pad">
              <div className="field">
                <label htmlFor="daynotes">Notes column</label>
                <textarea
                  id="daynotes"
                  className="textarea"
                  rows={2}
                  value={dayNotes}
                  placeholder="Anything written down the right-hand side of the page"
                  onChange={(e) => setDayNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {flaggedCount || unmatched ? (
            <div className="card card-pad" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
              <strong style={{ fontSize: 13 }}>
                {flaggedCount} row{flaggedCount === 1 ? "" : "s"} need a look
                {unmatched ? `, ${unmatched} without a court` : ""}
              </strong>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                Highlighted rows are where the read was uncertain or broke one of the club's own
                rules. Nothing publishes until you say so.
              </p>
            </div>
          ) : null}

          <div className="card">
            {list.length ? (
              list.map((row) => (
                <div className={`draft-row${row.flagged ? " flagged" : ""}`} key={row.key}>
                  <div className="draft-time">
                    <select
                      className="select"
                      value={row.startMin}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        update(row.key, {
                          startMin: next,
                          endMin: Math.max(row.endMin, next + SLOT_MIN),
                        });
                      }}
                      aria-label="Start time"
                    >
                      {starts.map((min) => (
                        <option key={min} value={min}>
                          {formatTime(min)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      value={row.endMin}
                      onChange={(e) => update(row.key, { endMin: Number(e.target.value) })}
                      aria-label="End time"
                    >
                      {timeOptions(row.startMin + SLOT_MIN, session.org.dayEndMin).map((min) => (
                        <option key={min} value={min}>
                          {formatTime(min)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="draft-fields">
                    <input
                      className="input"
                      value={row.label}
                      placeholder="What is this booking?"
                      onChange={(e) => update(row.key, { label: e.target.value })}
                    />
                    <div className="line">
                      <select
                        className="select"
                        value={row.courtId}
                        onChange={(e) => update(row.key, { courtId: e.target.value })}
                        aria-label="Court"
                      >
                        <option value="">— pick a court —</option>
                        {session.courts.map((court) => (
                          <option key={court._id as string} value={court._id as string}>
                            {court.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        value={row.proId}
                        onChange={(e) => update(row.key, { proId: e.target.value })}
                        aria-label="Coach"
                      >
                        <option value="">No coach</option>
                        {session.members
                          .filter((m) => m.role !== "staff")
                          .map((member) => (
                            <option key={member._id as string} value={member._id as string}>
                              {member.displayName}
                            </option>
                          ))}
                      </select>
                      <label
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          fontSize: 12,
                          flex: "0 0 auto",
                          minWidth: 0,
                          whiteSpace: "nowrap",
                        }}
                        title="The client asked for this pro by name"
                      >
                        <input
                          type="checkbox"
                          checked={row.requested}
                          onChange={(e) => update(row.key, { requested: e.target.checked })}
                        />
                        Requested
                      </label>
                      <button
                        className="btn sm ghost"
                        onClick={() =>
                          setRows((prev) => (prev ?? []).filter((r) => r.key !== row.key))
                        }
                        style={{ flex: "0 0 auto", minWidth: 0 }}
                      >
                        Remove
                      </button>
                    </div>
                    {row.issue ? <span className="issue">{row.issue}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">
                Nothing was read from this page. Add rows by hand, or try again with a more careful
                model.
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            <button
              className="btn"
              onClick={() =>
                setRows((prev) => [
                  ...(prev ?? []),
                  {
                    key: `new-${Date.now()}`,
                    courtId: (session.courts[0]?._id as string) ?? "",
                    startMin: session.org.dayStartMin,
                    endMin: session.org.dayStartMin + 60,
                    label: "",
                    proId: "",
                    sessionType: "Private",
                    notes: "",
                    requested: false,
                    issue: null,
                    flagged: false,
                  },
                ])
              }
            >
              Add a row
            </button>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {list.filter((r) => r.courtId && r.label.trim()).length} ready to publish
            </span>
            <button className="btn primary" onClick={() => void publish()} disabled={busy || !date}>
              {busy ? <span className="spinner" /> : null}
              Publish to the schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The clinic sign-up sheet                                            */
/* ------------------------------------------------------------------ */

type Participant = { name: string; phone: string; rating: string; note: string };
type ClinicRow = {
  key: string;
  title: string;
  startMin: number | null;
  endMin: number | null;
  participants: Participant[];
  issue: string | null;
};

function ClinicReview({
  session,
  page,
  photoUrl,
  inheritedDate,
  inheritedFrom,
}: {
  session: SessionWithClub;
  page: PageDoc;
  photoUrl: string | null;
  inheritedDate?: string;
  inheritedFrom?: string;
}) {
  const confirmClinicPage = useMutation(api.imports.confirmClinicPage);
  const guarded = useGuarded();
  const navigate = useNavigate();

  const [clinics, setClinics] = useState<ClinicRow[] | null>(null);
  const [date, setDate] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (clinics !== null) return;
    setClinics(
      (page.clinicDrafts ?? []).map((draft, index) => ({
        key: `${index}`,
        title: draft.title,
        startMin: draft.startMin,
        endMin: draft.endMin,
        participants: draft.participants.map((p) => ({
          name: p.name,
          phone: p.phone ?? "",
          rating: p.rating ?? "",
          note: p.note ?? "",
        })),
        issue: draft.issue,
      })),
    );
    setDate(page.detectedDate ?? inheritedDate ?? todayIso());
  }, [page, clinics, inheritedDate]);

  const times = useMemo(
    () => timeOptions(session.org.dayStartMin, session.org.dayEndMin),
    [session.org.dayStartMin, session.org.dayEndMin],
  );

  const list = clinics ?? [];
  const totalPeople = list.reduce(
    (sum, clinic) => sum + clinic.participants.filter((p) => p.name.trim()).length,
    0,
  );

  function updateClinic(key: string, patch: Partial<ClinicRow>) {
    setClinics((prev) => (prev ?? []).map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function updateParticipant(key: string, index: number, patch: Partial<Participant>) {
    setClinics((prev) =>
      (prev ?? []).map((clinic) =>
        clinic.key === key
          ? {
              ...clinic,
              participants: clinic.participants.map((p, i) =>
                i === index ? { ...p, ...patch } : p,
              ),
            }
          : clinic,
      ),
    );
  }

  async function publish() {
    setBusy(true);
    const payload = list
      .filter((clinic) => clinic.title.trim())
      .map((clinic) => ({
        title: clinic.title.trim(),
        startMin: clinic.startMin ?? undefined,
        endMin: clinic.endMin ?? undefined,
        participants: clinic.participants
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            phone: p.phone.trim() || null,
            rating: p.rating.trim() || null,
            note: p.note.trim() || null,
          })),
      }));

    const result = await guarded(
      () =>
        confirmClinicPage({
          pageId: page._id,
          date,
          clinics: payload,
          replaceExisting,
        }),
      "Sign-up sheet published",
    );
    setBusy(false);
    if (result) navigate(`/desk/import/${page.batchId}`);
  }

  return (
    <div className="page">
      <PageHeader page={page} title="Check the sign-up sheet" subtitle="clinic sheet" />

      <div className="review-split">
        <PhotoPane photoUrl={photoUrl} fileName={page.fileName} />

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div
              className="card-pad"
              style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}
            >
              <div className="field" style={{ flex: 1, minWidth: 190 }}>
                <label htmlFor="clinic-date">This sheet belongs to</label>
                <input
                  id="clinic-date"
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <span className="hint">
                  {inheritedDate && date === inheritedDate
                    ? `Taken from ${inheritedFrom ?? "the page before it"} — the sheet has no date of its own.`
                    : date
                      ? formatDateLong(date)
                      : "Pick a date"}
                </span>
              </div>
              <label
                style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, paddingBottom: 8 }}
              >
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                Replace this day's sign-ups
              </label>
            </div>
          </div>

          {list.length ? (
            list.map((clinic) => (
              <div className="card" style={{ marginBottom: 12 }} key={clinic.key}>
                <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="field" style={{ flex: 2, minWidth: 170 }}>
                      <label>Clinic</label>
                      <input
                        className="input"
                        value={clinic.title}
                        onChange={(e) => updateClinic(clinic.key, { title: e.target.value })}
                      />
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 110 }}>
                      <label>Starts</label>
                      <select
                        className="select"
                        value={clinic.startMin ?? ""}
                        onChange={(e) =>
                          updateClinic(clinic.key, {
                            startMin: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {times.map((min) => (
                          <option key={min} value={min}>
                            {formatTime(min)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 110 }}>
                      <label>Ends</label>
                      <select
                        className="select"
                        value={clinic.endMin ?? ""}
                        onChange={(e) =>
                          updateClinic(clinic.key, {
                            endMin: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {times.map((min) => (
                          <option key={min} value={min}>
                            {formatTime(min)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn sm ghost"
                      onClick={() =>
                        setClinics((prev) => (prev ?? []).filter((c) => c.key !== clinic.key))
                      }
                    >
                      Remove
                    </button>
                  </div>

                  {clinic.issue ? <span className="issue">{clinic.issue}</span> : null}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {clinic.participants.map((participant, index) => (
                      <div key={index} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <input
                          className="input"
                          style={{ flex: 2, minWidth: 130 }}
                          value={participant.name}
                          placeholder="Name"
                          onChange={(e) =>
                            updateParticipant(clinic.key, index, { name: e.target.value })
                          }
                        />
                        <input
                          className="input"
                          style={{ flex: 2, minWidth: 120 }}
                          value={participant.phone}
                          placeholder="Phone"
                          onChange={(e) =>
                            updateParticipant(clinic.key, index, { phone: e.target.value })
                          }
                        />
                        <input
                          className="input"
                          style={{ flex: "0 0 68px", width: 68 }}
                          value={participant.rating}
                          placeholder="4.0"
                          title="NTRP rating"
                          onChange={(e) =>
                            updateParticipant(clinic.key, index, { rating: e.target.value })
                          }
                        />
                        <button
                          className="btn sm ghost"
                          aria-label={`Remove ${participant.name || "row"}`}
                          onClick={() =>
                            updateClinic(clinic.key, {
                              participants: clinic.participants.filter((_, i) => i !== index),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        className="btn sm"
                        onClick={() =>
                          updateClinic(clinic.key, {
                            participants: [
                              ...clinic.participants,
                              { name: "", phone: "", rating: "", note: "" },
                            ],
                          })
                        }
                      >
                        Add a player
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card">
              <p className="empty">No clinics were read from this sheet.</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
            <button
              className="btn"
              onClick={() =>
                setClinics((prev) => [
                  ...(prev ?? []),
                  {
                    key: `new-${Date.now()}`,
                    title: "",
                    startMin: null,
                    endMin: null,
                    participants: [],
                    issue: null,
                  },
                ])
              }
            >
              Add a clinic
            </button>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {list.length} clinic{list.length === 1 ? "" : "s"} · {totalPeople} signed up
            </span>
            <button className="btn primary" onClick={() => void publish()} disabled={busy || !date}>
              {busy ? <span className="spinner" /> : null}
              Publish the sign-ups
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
