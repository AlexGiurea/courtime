import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Loading, useGuarded } from "../ui";
import { SLOT_MIN, formatDateLong, formatTime, timeOptions, todayIso } from "../lib/time";

type Row = {
  key: string;
  courtId: string;
  startMin: number;
  endMin: number;
  label: string;
  proId: string;
  sessionType: string;
  notes: string;
  issue: string | null;
  flagged: boolean;
};

export default function ReviewPage({ session }: { session: SessionWithClub }) {
  const { pageId } = useParams();
  const data = useQuery(api.imports.page, {
    pageId: pageId as Id<"importPages">,
  });
  const confirmPage = useMutation(api.imports.confirmPage);
  const guarded = useGuarded();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [date, setDate] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [busy, setBusy] = useState(false);

  // Seed the editable table once, from what the model read.
  useEffect(() => {
    if (!data?.page || rows !== null) return;
    const drafts = data.page.draftEntries ?? [];
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
        issue: draft.issue,
        flagged: draft.confidence === "low",
      })),
    );
    setDate(data.page.detectedDate ?? todayIso());
  }, [data, rows]);

  const starts = useMemo(
    () => timeOptions(session.org.dayStartMin, session.org.dayEndMin - SLOT_MIN),
    [session.org.dayStartMin, session.org.dayEndMin],
  );

  if (data === undefined) return <Loading label="Loading the page" />;
  if (data === null || !data.page) {
    return (
      <div className="page narrow">
        <p className="empty">That page isn't available.</p>
      </div>
    );
  }

  const { page, photoUrl } = data;
  const list = rows ?? [];
  const flaggedCount = list.filter((row) => row.flagged).length;
  const unmatched = list.filter((row) => !row.courtId).length;

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) =>
      (prev ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => (prev ?? []).filter((row) => row.key !== key));
  }

  function addRow() {
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
        issue: null,
        flagged: false,
      },
    ]);
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
      }));

    const result = await guarded(
      () =>
        confirmPage({
          pageId: page._id,
          date,
          entries: payload,
          replaceExisting,
        }),
      "Published to the schedule",
    );
    setBusy(false);
    if (result) navigate(`/desk/import/${page.batchId}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Check the read</h1>
          <p>
            {page.fileName} · read with {page.model ?? "the vision model"}
            {page.costUsd !== undefined ? ` · $${page.costUsd.toFixed(4)}` : ""}
            {page.durationMs ? ` · ${(page.durationMs / 1000).toFixed(1)}s` : ""}
          </p>
        </div>
        <Link className="btn" to={`/desk/import/${page.batchId}`}>
          Back to the batch
        </Link>
      </div>

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
        <div className="photo-pane">
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noreferrer">
              <img src={photoUrl} alt={`Schedule page ${page.fileName}`} />
            </a>
          ) : (
            <p className="empty">The photo could not be loaded.</p>
          )}
          <p className="muted" style={{ fontSize: 12, margin: "8px 4px 2px" }}>
            Click the photo to open it full size.
          </p>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-pad" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
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
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                Replace what's already on this day
              </label>
            </div>
          </div>

          {flaggedCount || unmatched ? (
            <div className="card card-pad" style={{ marginBottom: 14, borderColor: "var(--warn)" }}>
              <strong style={{ fontSize: 13 }}>
                {flaggedCount} row{flaggedCount === 1 ? "" : "s"} need a look
                {unmatched ? `, ${unmatched} without a court` : ""}
              </strong>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                Highlighted rows are where the read was uncertain or broke one of the
                club's own rules. Nothing publishes until you say so.
              </p>
            </div>
          ) : null}

          <div className="card">
            {list.length ? (
              list.map((row) => (
                <div
                  className={`draft-row${row.flagged ? " flagged" : ""}`}
                  key={row.key}
                >
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
                      {timeOptions(row.startMin + SLOT_MIN, session.org.dayEndMin).map(
                        (min) => (
                          <option key={min} value={min}>
                            {formatTime(min)}
                          </option>
                        ),
                      )}
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
                      <button
                        className="btn sm ghost"
                        onClick={() => removeRow(row.key)}
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
                Nothing was read from this page. Add rows by hand, or try again with a
                more careful model.
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            <button className="btn" onClick={addRow}>
              Add a row
            </button>
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {list.filter((r) => r.courtId && r.label.trim()).length} ready to publish
            </span>
            <button
              className="btn primary"
              onClick={() => void publish()}
              disabled={busy || !date}
            >
              {busy ? <span className="spinner" /> : null}
              Publish to the schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
