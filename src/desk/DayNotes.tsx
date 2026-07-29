import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { useGuarded } from "../ui";
import { formatDateMedium } from "../lib/time";

export type DayNote = FunctionReturnType<typeof api.notes.forDate>;

const DEBOUNCE_MS = 650;

/**
 * The NOTES column from the right-hand side of the paper page.
 *
 * It lives in a rail that slides over the grid rather than beside it: the grid
 * is already wide and scrolls sideways, so a docked column would cost a court's
 * worth of width all day for something the desk reads a few times a shift. The
 * day bar carries a dot so you can tell at a glance whether the day has notes
 * without opening anything.
 */
export function NotesButton({
  note,
  open,
  onToggle,
}: {
  note: DayNote | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const filled = Boolean(note?.body.trim());
  return (
    <button
      className={`btn notes-btn${open ? " is-open" : ""}`}
      onClick={onToggle}
      aria-pressed={open}
      title={filled ? "This day has notes  (N)" : "No notes on this day yet  (N)"}
    >
      {/* A dot only when there is something to read. An always-present grey one
          reads as a status light that never means anything. */}
      {filled ? <span className="notes-dot" aria-hidden="true" /> : null}
      Notes
    </button>
  );
}

export function NotesRail({
  date,
  note,
  onClose,
}: {
  date: string;
  note: DayNote | undefined;
  onClose: () => void;
}) {
  const save = useMutation(api.notes.save);
  const guarded = useGuarded();

  const [text, setText] = useState(note?.body ?? "");
  const [status, setStatus] = useState<"clean" | "pending" | "saved">("clean");
  const dirty = useRef(false);
  const latest = useRef(text);
  const loadedFor = useRef<string | null>(null);
  const commit = useRef<(body: string) => void>(() => {});

  function persist(body: string) {
    dirty.current = false;
    void guarded(async () => {
      await save({ date, body });
      return true;
    }).then((ok) => setStatus(ok ? "saved" : "clean"));
  }

  useEffect(() => {
    latest.current = text;
    commit.current = persist;
  });

  // The note for a date arrives after the rail mounts, and the date can change
  // underneath it while it stays open. Take the server's copy once per day.
  useEffect(() => {
    if (note === undefined) return;
    if (loadedFor.current === date) return;
    loadedFor.current = date;
    setText(note?.body ?? "");
    setStatus("clean");
  }, [date, note]);

  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => commit.current(text), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  // Flush anything still held when the rail closes or the desk changes day.
  useEffect(
    () => () => {
      if (dirty.current) commit.current(latest.current);
    },
    [date],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canEdit = note?.canEdit ?? false;

  return (
    <aside className="notes-rail no-print" aria-label={`Notes for ${formatDateMedium(date)}`}>
      <div className="rail-head">
        <h3>Notes</h3>
        <span className="when tabular">{formatDateMedium(date)}</span>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close notes">
          Esc
        </button>
      </div>

      {canEdit ? (
        <textarea
          className="notes-body"
          value={text}
          autoFocus
          placeholder="Humbert would like Ct. 5 · account 4471 · ball machine on 3 at noon"
          onChange={(event) => {
            dirty.current = true;
            setStatus("pending");
            setText(event.target.value);
          }}
          onBlur={() => {
            if (dirty.current) persist(text);
          }}
        />
      ) : note === undefined ? (
        <p className="notes-read muted">Loading the day's notes…</p>
      ) : text.trim() ? (
        <p className="notes-read">{text}</p>
      ) : (
        <p className="notes-read muted">Nothing written on this day.</p>
      )}

      <div className="notes-foot">
        {!canEdit
          ? "The front desk keeps this column."
          : status === "pending"
            ? "Saving…"
            : status === "saved"
              ? "Saved"
              : "Autosaves as you type."}
      </div>
    </aside>
  );
}
