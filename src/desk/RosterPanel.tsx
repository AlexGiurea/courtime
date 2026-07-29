import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { useGuarded } from "../ui";
import { CrossMark } from "./marks";

/** One line of the numbered sign-up sheet on the back of the page. */
export type Participant = Doc<"clinicRosters">["participants"][number];

const DEBOUNCE_MS = 700;

/**
 * The sheet itself, shared by the clinics face and the booking dialog.
 *
 * Typing is held for {@link DEBOUNCE_MS} and then written whole — `clinics.save`
 * replaces the participant array, so there is nothing to merge. Adding or
 * removing a name writes immediately, because that is a decision rather than a
 * keystroke, and anything still pending is flushed if the sheet unmounts (which
 * is exactly what happens when the desk turns the page mid-edit).
 */
export function RosterBody({
  participants,
  canEdit,
  compact,
  onCommit,
}: {
  participants: Participant[];
  canEdit: boolean;
  compact?: boolean;
  onCommit: (next: Participant[]) => unknown;
}) {
  const [rows, setRows] = useState<Participant[]>(participants);
  const [draftName, setDraftName] = useState("");
  const [draftRating, setDraftRating] = useState("");
  const [draftPhone, setDraftPhone] = useState("");

  const dirty = useRef(false);
  const latest = useRef(rows);
  const commit = useRef(onCommit);

  useEffect(() => {
    latest.current = rows;
    commit.current = onCommit;
  });

  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => {
      dirty.current = false;
      commit.current(rows);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [rows]);

  useEffect(
    () => () => {
      if (dirty.current) commit.current(latest.current);
    },
    [],
  );

  function edit(index: number, patch: Partial<Participant>) {
    dirty.current = true;
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function write(next: Participant[]) {
    dirty.current = false;
    setRows(next);
    commit.current(next);
  }

  function addName() {
    const name = draftName.trim();
    if (!name) return;
    write([
      ...rows,
      {
        name,
        rating: draftRating.trim() || null,
        phone: draftPhone.trim() || null,
        note: null,
      },
    ]);
    setDraftName("");
    setDraftRating("");
    setDraftPhone("");
  }

  return (
    <div className={`roster${compact ? " compact" : ""}`}>
      {rows.length === 0 && !canEdit ? (
        <p className="roster-empty">Nobody has signed up yet.</p>
      ) : null}

      {rows.map((row, index) => (
        <div className="roster-row" key={index}>
          <span className="n">{index + 1}</span>
          {canEdit ? (
            <>
              <input
                className="cell-input"
                value={row.name}
                aria-label={`Name on line ${index + 1}`}
                onChange={(event) => edit(index, { name: event.target.value })}
              />
              <input
                className="cell-input small mid"
                value={row.rating ?? ""}
                placeholder="—"
                aria-label={`Rating on line ${index + 1}`}
                onChange={(event) =>
                  edit(index, { rating: event.target.value || null })
                }
              />
              <input
                className="cell-input small"
                value={row.phone ?? ""}
                placeholder="Phone"
                aria-label={`Phone on line ${index + 1}`}
                onChange={(event) =>
                  edit(index, { phone: event.target.value || null })
                }
              />
              <button
                className="roster-drop"
                aria-label={`Remove ${row.name || "this line"}`}
                onClick={() => write(rows.filter((_, i) => i !== index))}
              >
                <CrossMark />
              </button>
            </>
          ) : (
            <>
              <span className="who">{row.name}</span>
              <span className="ntrp">{row.rating ?? "—"}</span>
              <span className="tel">{row.phone ?? ""}</span>
              <span />
            </>
          )}
        </div>
      ))}

      {canEdit ? (
        <div className="roster-add">
          <span className="n">{rows.length + 1}</span>
          <input
            className="cell-input"
            value={draftName}
            placeholder="Add a name"
            aria-label="New name"
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addName();
              }
            }}
          />
          <input
            className="cell-input mid"
            value={draftRating}
            placeholder="NTRP"
            aria-label="New rating"
            onChange={(event) => setDraftRating(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addName();
            }}
          />
          <input
            className="cell-input tel-cell"
            value={draftPhone}
            placeholder="Phone"
            aria-label="New phone number"
            onChange={(event) => setDraftPhone(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addName();
            }}
          />
          <button
            className="roster-drop"
            style={{ opacity: draftName.trim() ? 1 : 0.35 }}
            aria-label="Add this person"
            disabled={!draftName.trim()}
            onClick={addName}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Session types that plausibly have a sheet behind them. A private does not. */
export function hasRoster(sessionType?: string): boolean {
  return sessionType === "Clinic" || sessionType === "Group";
}

/**
 * The sheet behind one booking on the grid — the reason the two faces of the
 * page belong to each other.
 */
export function EntryRoster({
  entry,
  canEdit,
}: {
  entry: Doc<"entries">;
  canEdit: boolean;
}) {
  const result = useQuery(api.clinics.forEntry, { entryId: entry._id });
  const save = useMutation(api.clinics.save);
  const link = useMutation(api.clinics.linkToEntry);
  const guarded = useGuarded();
  const [busy, setBusy] = useState(false);

  if (result === undefined) {
    return <p className="roster-empty">Looking for the sign-up sheet…</p>;
  }

  const roster = result?.roster ?? null;
  const matchedByTime = result && "matchedBy" in result && result.matchedBy === "time";

  if (!roster) {
    return (
      <div>
        <p className="roster-empty" style={{ paddingLeft: 0 }}>
          No sign-up sheet has been captured for this booking yet.
        </p>
        {canEdit ? (
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void guarded(async () => {
                await save({
                  date: entry.date,
                  title: entry.label,
                  startMin: entry.startMin,
                  endMin: entry.endMin,
                  entryId: entry._id,
                  participants: [],
                });
                return true;
              }).finally(() => setBusy(false));
            }}
          >
            Start a sheet
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{roster.title}</span>
        <span className="tag">
          {roster.participants.length} signed up
        </span>
        {matchedByTime ? (
          <span className="muted" style={{ fontSize: 11 }}>
            Matched by start time
            {canEdit ? (
              <>
                {" · "}
                <button
                  className="btn ghost sm"
                  style={{ padding: "0 4px" }}
                  onClick={() =>
                    void guarded(async () => {
                      await link({ rosterId: roster._id, entryId: entry._id });
                      return true;
                    }, "Sheet linked to this booking")
                  }
                >
                  Link it
                </button>
              </>
            ) : null}
          </span>
        ) : null}
      </div>

      <RosterBody
        key={roster._id as string}
        participants={roster.participants}
        canEdit={canEdit}
        compact
        onCommit={(participants) =>
          void guarded(async () => {
            await save({
              rosterId: roster._id,
              date: roster.date,
              title: roster.title,
              startMin: roster.startMin,
              endMin: roster.endMin,
              entryId: roster.entryId,
              participants,
            });
            return true;
          })
        }
      />
    </div>
  );
}
