import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub, TopBar } from "../App";
import { Loading } from "../ui";
import {
  addDays,
  durationLabel,
  formatDateLong,
  relativeDayLabel,
  todayIso,
} from "../lib/time";
import DayGrid, { GridEntry } from "./DayGrid";
import EntryDialog, { EntryDraft } from "./EntryDialog";
import CommandPalette from "./CommandPalette";
import ClinicsFace from "./ClinicsFace";
import { NotesButton, NotesRail } from "./DayNotes";
import { usePageTurn } from "./PageTurn";
import ImportPage from "./ImportPage";
import ReviewPage from "./ReviewPage";
import SettingsPage from "./SettingsPage";
import InsightsPage from "./InsightsPage";
import "./desk.css";

export default function DeskApp({ session }: { session: SessionWithClub }) {
  const [date, setDate] = useState(todayIso());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);

  const dialogOpen = draft !== null || paletteOpen;

  // Desk shortcuts. They stay out of the way whenever a field has focus.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (typing || dialogOpen) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDate((d) => addDays(d, event.shiftKey ? -7 : -1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setDate((d) => addDays(d, event.shiftKey ? 7 : 1));
      } else if (event.key.toLowerCase() === "t") {
        setDate(todayIso());
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  const openCreate = useCallback(
    (courtId: Id<"courts">, startMin: number, seedText?: string) => {
      setDraft({ courtId, startMin, seedText });
    },
    [],
  );

  const openEntry = useCallback((entry: GridEntry) => {
    setDraft({ entry, courtId: entry.courtId, startMin: entry.startMin });
  }, []);

  return (
    <div className="shell">
      <TopBar session={session}>
        <button className="btn sm no-print" onClick={() => setPaletteOpen(true)}>
          Jump to <kbd>Ctrl</kbd> <kbd>K</kbd>
        </button>
      </TopBar>

      <Routes>
        <Route
          index
          element={
            <SchedulePage
              session={session}
              date={date}
              setDate={setDate}
              onCreate={openCreate}
              onOpen={openEntry}
            />
          }
        />
        <Route path="import" element={<ImportPage session={session} />} />
        <Route path="import/:batchId" element={<ImportPage session={session} />} />
        <Route path="review/:pageId" element={<ReviewPage session={session} />} />
        <Route path="settings" element={<SettingsPage session={session} />} />
        <Route path="insights" element={<InsightsPage session={session} />} />
      </Routes>

      {draft ? (
        <EntryDialog
          session={session}
          date={date}
          draft={draft}
          onClose={() => setDraft(null)}
        />
      ) : null}

      {paletteOpen ? (
        <CommandPalette
          date={date}
          onPickDate={setDate}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
    </div>
  );
}

type Face = "grid" | "clinics";

function SchedulePage({
  session,
  date,
  setDate,
  onCreate,
  onOpen,
}: {
  session: SessionWithClub;
  date: string;
  setDate: (iso: string) => void;
  onCreate: (courtId: Id<"courts">, startMin: number, seedText?: string) => void;
  onOpen: (entry: GridEntry) => void;
}) {
  // Both faces and the notes column subscribe from here, so turning the page
  // never re-fetches and the day bar can tell you what is on the other side.
  const day = useQuery(api.schedule.day, { date });
  const clinics = useQuery(api.clinics.forDate, { date });
  const note = useQuery(api.notes.forDate, { date });

  const today = todayIso();
  const relative = relativeDayLabel(date, today);
  const canEdit = session.membership.role !== "pro";

  const { shown, face, turnTo, faceProps } = usePageTurn<Face>("grid");
  const [notesOpen, setNotesOpen] = useState(false);

  const stats = useMemo(() => {
    const entries = day?.entries ?? [];
    const coached = entries.filter((e) => e.proMembershipId);
    const minutes = coached.reduce((sum, e) => sum + (e.endMin - e.startMin), 0);
    const courts = new Set(entries.map((e) => e.courtId as string));
    return {
      total: entries.length,
      coached: coached.length,
      hours: minutes ? durationLabel(0, minutes) : "0h",
      courts: courts.size,
    };
  }, [day]);

  const clinicStats = useMemo(() => {
    const rosters = clinics?.rosters ?? [];
    return {
      sheets: rosters.length,
      signedUp: rosters.reduce((sum, roster) => sum + roster.participants.length, 0),
    };
  }, [clinics]);

  return (
    <div className="page">
      <div className="print-only">
        <h1>
          {session.org.name} — {formatDateLong(date)}
        </h1>
        <p>Printed from Courtime</p>
      </div>

      <div className="daybar no-print">
        <button className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ←
        </button>
        <button className="btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
          →
        </button>
        <span className="date-label">
          {formatDateLong(date)}
          {relative ? <span className="muted"> · {relative}</span> : null}
        </span>
        {date !== today ? (
          <button className="btn sm" onClick={() => setDate(today)}>
            Today
          </button>
        ) : null}

        {/* Two sides of the same sheet, not two places to be. */}
        <div className="face-switch" role="group" aria-label="Side of the page">
          <button aria-pressed={face === "grid"} onClick={() => turnTo("grid", -1)}>
            Court grid
          </button>
          <button aria-pressed={face === "clinics"} onClick={() => turnTo("clinics", 1)}>
            Clinics
          </button>
        </div>

        <span style={{ flex: 1 }} />

        <span className="live" title="Every change appears here the moment it is made">
          <span className="live-dot" />
          Live
        </span>
        <span className="tag">
          {face === "clinics"
            ? `${clinicStats.sheets} clinic${clinicStats.sheets === 1 ? "" : "s"} · ${clinicStats.signedUp} signed up`
            : `${stats.total} booking${stats.total === 1 ? "" : "s"} · ${stats.hours} coached · ${stats.courts} court${stats.courts === 1 ? "" : "s"}`}
        </span>
        <NotesButton
          note={note}
          open={notesOpen}
          onToggle={() => setNotesOpen((open) => !open)}
        />
        <button className="btn" onClick={() => window.print()}>
          Print day sheet
        </button>
      </div>

      <div className="flip-stage">
        <div {...faceProps}>
          {shown === "clinics" ? (
            <ClinicsFace
              session={session}
              date={date}
              data={clinics}
              entries={day?.entries ?? []}
              canEdit={canEdit}
            />
          ) : day === undefined ? (
            <Loading label="Loading the day" />
          ) : (
            <DayGrid
              session={session}
              entries={day?.entries ?? []}
              onCreate={onCreate}
              onOpen={onOpen}
            />
          )}
        </div>
      </div>

      <p className="muted no-print" style={{ fontSize: 12, marginTop: 12 }}>
        {shown === "clinics"
          ? "The back of the page: who signed up for each clinic. "
          : "Click any empty slot to book it. Drag a booking's bottom edge to lengthen it. "}
        <kbd>←</kbd> <kbd>→</kbd> move a day, <kbd>Shift</kbd> a week, <kbd>T</kbd>{" "}
        jumps to today, <kbd>Ctrl</kbd> <kbd>K</kbd> jumps to any date.
      </p>

      {notesOpen ? (
        <NotesRail date={date} note={note} onClose={() => setNotesOpen(false)} />
      ) : null}
    </div>
  );
}
