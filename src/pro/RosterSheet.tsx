import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatSpan } from "../lib/time";
import { CloseIcon } from "./icons";
import type { ScheduleEntry } from "./data";

/**
 * Who is actually in this clinic, on a phone. Read-only: the sheet belongs to
 * the front desk, but a coach walking to the court should never have to ring
 * them to find out who is waiting.
 */
export default function RosterSheet({
  entry,
  courtName,
  onClose,
}: {
  entry: ScheduleEntry;
  courtName: string;
  onClose: () => void;
}) {
  const result = useQuery(api.clinics.forEntry, {
    entryId: entry._id as Id<"entries">,
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roster = result?.roster ?? null;

  return (
    <div
      className="sheet-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={entry.label}>
        <div className="sheet-head">
          <div className="grow">
            <div className="sheet-title">{roster?.title ?? entry.label}</div>
            <div className="sheet-sub tabular">
              {formatSpan(entry.startMin, entry.endMin)} · {courtName}
            </div>
          </div>
          <button className="note-dismiss" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-body">
          {result === undefined ? (
            <div className="pro-loading">
              <span className="spinner" />
              Loading the sheet…
            </div>
          ) : !roster ? (
            <div className="empty">
              <p className="empty-line">No sign-up sheet for this one yet.</p>
              <p className="empty-sub">
                The back of the page hasn't been captured for this day. The front
                desk will have it on paper.
              </p>
            </div>
          ) : roster.participants.length === 0 ? (
            <div className="empty">
              <p className="empty-line">Nobody has signed up yet.</p>
              <p className="empty-sub">The sheet is there — it's just still empty.</p>
            </div>
          ) : (
            <>
              <p className="pro-summary tabular">
                {roster.participants.length} signed up
              </p>
              <ol className="sheet-list">
                {roster.participants.map((person, index) => (
                  <li key={index}>
                    <span className="n tabular">{index + 1}</span>
                    <span className="who">{person.name}</span>
                    {person.rating ? (
                      <span className="tag">{person.rating}</span>
                    ) : null}
                    {person.phone ? (
                      <a className="tel tabular" href={`tel:${person.phone}`}>
                        {person.phone}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
