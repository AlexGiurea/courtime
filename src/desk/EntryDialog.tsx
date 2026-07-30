import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Modal, useGuarded } from "../ui";
import { SLOT_MIN, formatDateLong, formatTime, timeOptions } from "../lib/time";
import { EntryRoster, hasRoster } from "./RosterPanel";
import { AsteriskMark } from "./marks";

const SESSION_TYPES = ["Private", "Group", "Clinic", "Camp", "Member play"];

export type EntryDraft = {
  entry?: Doc<"entries">;
  courtId: Id<"courts">;
  startMin: number;
  seedText?: string;
};

export default function EntryDialog({
  session,
  date,
  draft,
  onClose,
}: {
  session: SessionWithClub;
  date: string;
  draft: EntryDraft;
  onClose: () => void;
}) {
  const createEntry = useMutation(api.schedule.createEntry);
  const createSeries = useMutation(api.schedule.createSeries);
  const updateEntry = useMutation(api.schedule.updateEntry);
  const deleteEntry = useMutation(api.schedule.deleteEntry);
  const guarded = useGuarded();

  const editing = draft.entry;
  const [label, setLabel] = useState(editing?.label ?? draft.seedText ?? "");
  const [courtId, setCourtId] = useState<Id<"courts">>(draft.courtId);
  const [startMin, setStartMin] = useState(editing?.startMin ?? draft.startMin);
  const [endMin, setEndMin] = useState(
    editing?.endMin ?? Math.min(draft.startMin + 60, session.org.dayEndMin),
  );
  const [proId, setProId] = useState<string>(
    (editing?.proMembershipId as string | undefined) ?? "",
  );
  const [sessionType, setSessionType] = useState(editing?.sessionType ?? "Private");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [requested, setRequested] = useState(Boolean(editing?.requested));
  const [busy, setBusy] = useState(false);
  /** 1 means "just this one" — the ordinary case, and the default. */
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const canEdit = session.membership.role !== "pro";

  const sourceUrl = useQuery(
    api.imports.pagePhotoUrl,
    editing?.sourcePageId ? { pageId: editing.sourcePageId } : "skip",
  );

  const starts = timeOptions(session.org.dayStartMin, session.org.dayEndMin - SLOT_MIN);
  const ends = timeOptions(startMin + SLOT_MIN, session.org.dayEndMin);

  async function save() {
    if (!label.trim()) return;
    // A standing lesson goes through its own mutation so the whole run shares a
    // series id and clashing weeks are skipped rather than forced.
    if (!editing && repeatWeeks > 1) {
      setBusy(true);
      const done = await guarded(async () => {
        const result = await createSeries({
          courtId,
          startDate: date,
          weeks: repeatWeeks,
          startMin,
          endMin,
          label: label.trim(),
          proMembershipId: proId ? (proId as Id<"memberships">) : undefined,
          sessionType,
          requested: requested || undefined,
        });
        return result;
      }, `Booked ${repeatWeeks} weeks`);
      setBusy(false);
      if (done) onClose();
      return;
    }
    setBusy(true);
    const ok = await guarded(async () => {
      if (editing) {
        await updateEntry({
          entryId: editing._id,
          courtId,
          startMin,
          endMin,
          label: label.trim(),
          proMembershipId: proId ? (proId as Id<"memberships">) : null,
          sessionType,
          notes: notes.trim(),
          requested,
        });
      } else {
        await createEntry({
          date,
          courtId,
          startMin,
          endMin,
          label: label.trim(),
          proMembershipId: proId ? (proId as Id<"memberships">) : undefined,
          sessionType,
          notes: notes.trim() || undefined,
          requested: requested || undefined,
        });
      }
      return true;
    }, editing ? "Booking updated" : "Booking added");
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    const ok = await guarded(
      () => deleteEntry({ entryId: editing._id }),
      "Booking cancelled",
    );
    setBusy(false);
    if (ok !== null) onClose();
  }

  return (
    <Modal
      title={editing ? "Edit booking" : "New booking"}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <button className="btn danger" onClick={() => void remove()} disabled={busy}>
              Cancel booking
            </button>
          ) : null}
          {!editing ? (
            <label className="repeat-field" title="Book this same slot every week">
              <input
                type="checkbox"
                checked={repeatWeeks > 1}
                onChange={(event) => setRepeatWeeks(event.target.checked ? 8 : 1)}
              />
              Weekly
              {repeatWeeks > 1 ? (
                <select
                  className="select repeat-weeks"
                  value={repeatWeeks}
                  aria-label="How many weeks"
                  onChange={(event) => setRepeatWeeks(Number(event.target.value))}
                >
                  {[4, 8, 12, 26, 52].map((n) => (
                    <option key={n} value={n}>
                      {n} weeks
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
          ) : null}
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            className="btn primary"
            onClick={() => void save()}
            disabled={busy || !label.trim()}
          >
            {busy ? <span className="spinner" /> : null}
            {editing ? "Save changes" : "Add booking"}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {formatDateLong(date)}
      </p>

      <div className="field">
        <label htmlFor="label">Booking</label>
        <input
          id="label"
          className="input"
          value={label}
          autoFocus
          placeholder="Private — J. Miller"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && label.trim()) void save();
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="court">Court</label>
          <select
            id="court"
            className="select"
            value={courtId as string}
            onChange={(e) => setCourtId(e.target.value as Id<"courts">)}
          >
            {session.courts.map((court) => (
              <option key={court._id as string} value={court._id as string}>
                {court.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="type">Type</label>
          <select
            id="type"
            className="select"
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
          >
            {SESSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="start">From</label>
          <select
            id="start"
            className="select"
            value={startMin}
            onChange={(e) => {
              const next = Number(e.target.value);
              setStartMin(next);
              if (endMin <= next) setEndMin(next + 60);
            }}
          >
            {starts.map((min) => (
              <option key={min} value={min}>
                {formatTime(min)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="end">To</label>
          <select
            id="end"
            className="select"
            value={endMin}
            onChange={(e) => setEndMin(Number(e.target.value))}
          >
            {ends.map((min) => (
              <option key={min} value={min}>
                {formatTime(min)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="pro">Coach</label>
        <select
          id="pro"
          className="select"
          value={proId}
          onChange={(e) => setProId(e.target.value)}
        >
          <option value="">No coach — members booked the court</option>
          {session.members
            .filter((m) => m.role !== "staff")
            .map((member) => (
              <option key={member._id as string} value={member._id as string}>
                {member.displayName}
              </option>
            ))}
        </select>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={requested}
          onChange={(e) => setRequested(e.target.checked)}
        />
        <span style={{ color: "var(--warn)", display: "flex" }}>
          <AsteriskMark size={12} />
        </span>
        Requested — this client asked for this pro by name
      </label>

      <div className="field">
        <label htmlFor="notes">Notes</label>
        <input
          id="notes"
          className="input"
          value={notes}
          placeholder="Status codes, ball machine, court preference…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {editing && hasRoster(sessionType) ? (
        <div className="field">
          <label>Sign-up sheet</label>
          <EntryRoster entry={editing} canEdit={canEdit} />
        </div>
      ) : null}

      {editing?.source === "import" ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
          Read from a photographed page.{" "}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              View the original
            </a>
          ) : null}
        </p>
      ) : null}
    </Modal>
  );
}
