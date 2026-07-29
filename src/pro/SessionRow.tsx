import { useState } from "react";
import { durationLabel, formatTime, initialsOf } from "../lib/time";
import { AsteriskIcon } from "./icons";
import RosterSheet from "./RosterSheet";
import { hasRoster, type Member, type ScheduleEntry } from "./data";

type Props = {
  entry: ScheduleEntry;
  courtName: string;
  /** Only ever set on today's list: the session running now, or the one after it. */
  state?: "now" | "next" | null;
  /** Club view shows who has the court; the coach's own list never does. */
  coach?: Member | null;
  showCoach?: boolean;
  mine?: boolean;
};

export default function SessionRow({
  entry,
  courtName,
  state = null,
  coach = null,
  showCoach = false,
  mine = false,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const rosterable = hasRoster(entry.sessionType);

  const className = [
    "session",
    state ? "next" : "",
    mine ? "mine" : "",
    rosterable ? "tappable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // In the club view the left rule carries the coach's colour, which is how the
  // desk grid reads too; an unstaffed court gets a neutral one.
  const accent = showCoach ? (coach?.color ?? "var(--line-strong)") : undefined;

  const where = [
    courtName,
    durationLabel(entry.startMin, entry.endMin),
    showCoach ? (coach ? coach.displayName : "No coach") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const badge =
    state === "now" ? "On now" : state === "next" ? "Next up" : mine ? "You" : null;
  const type = !showCoach && entry.sessionType ? entry.sessionType : null;
  const avatar = showCoach && coach ? coach : null;

  return (
    <li
      className={className}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <div className="times">
        <span className="start">{formatTime(entry.startMin)}</span>
        <span className="end">{formatTime(entry.endMin)}</span>
      </div>

      <div className="body">
        <div className="what">
          {entry.label}
          {entry.requested ? (
            <span className="req-mark" title="This client asked for you by name">
              <AsteriskIcon />
            </span>
          ) : null}
        </div>
        <div className="where">{where}</div>
        {entry.notes ? <div className="notes">{entry.notes}</div> : null}
      </div>

      {badge || type || avatar || rosterable ? (
        <div className="trail">
          {badge ? <span className="tag accent">{badge}</span> : null}
          {type ? <span className="tag">{type}</span> : null}
          {rosterable && !type ? <span className="tag">Roster</span> : null}
          {avatar ? (
            <span
              className="avatar"
              style={{ background: avatar.color }}
              title={avatar.displayName}
            >
              {initialsOf(avatar.displayName)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* A stretched hit target rather than a nested control, so the whole card
          is tappable without turning the row into a button. */}
      {rosterable ? (
        <button
          className="tap-target"
          aria-label={`Who is in ${entry.label}`}
          onClick={() => setSheetOpen(true)}
        />
      ) : null}

      {sheetOpen ? (
        <RosterSheet
          entry={entry}
          courtName={courtName}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </li>
  );
}
