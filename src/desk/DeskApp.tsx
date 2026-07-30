import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub, TopBar } from "../App";
import { Loading, useGuarded } from "../ui";
import {
  addDays,
  durationLabel,
  formatDateLong,
  formatDateMedium,
  relativeDayLabel,
  todayIso,
} from "../lib/time";
import DayGrid, { GridEntry } from "./DayGrid";
import EntryDialog, { EntryDraft } from "./EntryDialog";
import CommandPalette from "./CommandPalette";
import ClinicsFace from "./ClinicsFace";
import { NotesButton, NotesRail } from "./DayNotes";
import { usePageTurn } from "./PageTurn";
import { useFullScreen } from "./useFullScreen";
import ShortcutsOverlay from "./ShortcutsOverlay";
import { isBareKey, isTypingTarget } from "./shortcuts";
import ClientsPage, { ClientProfilePage } from "./ClientsPage";
import ImportPage from "./ImportPage";
import ReviewPage from "./ReviewPage";
import SettingsPage from "./SettingsPage";
import InsightsPage from "./InsightsPage";
import "./desk.css";

export default function DeskApp({ session }: { session: SessionWithClub }) {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);

  const canEdit = session.membership.role !== "pro";

  // Both faces of the page and the notes rail live up here rather than in the
  // schedule page, so there is exactly one keyboard handler for the desk and it
  // can reach everything a shortcut is allowed to touch.
  const pageTurn = usePageTurn<Face>("grid");
  const { turnTo } = pageTurn;
  const [notesOpen, setNotesOpen] = useState(false);

  const dialogOpen = draft !== null || paletteOpen || keysOpen;

  // Desk shortcuts, defined in ./shortcuts.ts. They stay out of the way
  // whenever a field has focus — the desk types names with G and T in them.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (isTypingTarget(event.target) || dialogOpen) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setDate((d) => addDays(d, event.shiftKey ? -7 : -1));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setDate((d) => addDays(d, event.shiftKey ? 7 : 1));
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setKeysOpen(true);
        return;
      }

      if (isBareKey(event, "t")) return setDate(todayIso());
      if (isBareKey(event, "g")) return turnTo("grid", -1);
      if (isBareKey(event, "c")) return turnTo("clinics", 1);
      if (isBareKey(event, "n")) return setNotesOpen((open) => !open);
      if (isBareKey(event, "p")) {
        event.preventDefault();
        window.print();
        return;
      }
      if (isBareKey(event, "f")) {
        event.preventDefault();
        // The day bar owns the state; this is the only shortcut that has to
        // reach across, so it goes by event rather than by lifting more state.
        window.dispatchEvent(new CustomEvent("courtime:fullscreen"));
        return;
      }

      // The rest move you between pages, which is the desk's job, not a pro's.
      if (!canEdit) return;
      if (isBareKey(event, "i")) return navigate("/desk/import");
      if (isBareKey(event, "r")) return navigate("/desk/insights");
      if (isBareKey(event, "s")) return navigate("/desk/settings");
      if (isBareKey(event, "l")) return navigate("/desk/clients");
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, canEdit, navigate, turnTo]);

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
              pageTurn={pageTurn}
              notesOpen={notesOpen}
              setNotesOpen={setNotesOpen}
            />
          }
        />
        <Route path="import" element={<ImportPage session={session} />} />
        <Route path="import/:batchId" element={<ImportPage session={session} />} />
        <Route path="review/:pageId" element={<ReviewPage session={session} />} />
        <Route path="clients" element={<ClientsPage session={session} />} />
        <Route
          path="clients/:clientId"
          element={<ClientProfilePage session={session} />}
        />
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

      {keysOpen ? (
        <ShortcutsOverlay
          canEdit={canEdit}
          showTempo={session.org.plan === "pro"}
          onClose={() => setKeysOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * A coach asked the desk for a day off, out loud, through Tempo. It has to land
 * where a person will actually see it — so it sits on the schedule, above the
 * day, and disappears the moment it's dealt with.
 */
function TimeOffStrip({ canEdit }: { canEdit: boolean }) {
  const requests = useQuery(api.schedule.openRequests);
  const resolve = useMutation(api.schedule.resolveRequest);
  const guarded = useGuarded();

  if (!canEdit || !requests || requests.length === 0) return null;

  return (
    <div className="timeoff-strip no-print">
      {requests.map((request) => (
        <div className="timeoff" key={request._id as string}>
          <span className="dot" style={{ background: request.color }} />
          <span className="what">
            <b>{request.coach}</b> asked for {formatDateMedium(request.date)} off —{" "}
            {request.span}
            {request.reason ? ` · ${request.reason}` : ""}
          </span>
          <button
            className="btn sm"
            onClick={() =>
              void guarded(
                () => resolve({ requestId: request._id, status: "acknowledged" }),
                "Noted",
              )
            }
          >
            Got it
          </button>
          <button
            className="btn ghost sm"
            onClick={() =>
              void guarded(
                () => resolve({ requestId: request._id, status: "declined" }),
                "Declined",
              )
            }
          >
            Can't
          </button>
        </div>
      ))}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.6 2.4h4v4M6.4 13.6h-4v-4M13.6 2.4 9.2 6.8M2.4 13.6 6.8 9.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShrinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.4 6.6h-4v-4M2.6 9.4h4v4M9.4 6.6l4.2-4.2M6.6 9.4l-4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Face = "grid" | "clinics";
type PageTurn = ReturnType<typeof usePageTurn<Face>>;

function SchedulePage({
  session,
  date,
  setDate,
  onCreate,
  onOpen,
  pageTurn,
  notesOpen,
  setNotesOpen,
}: {
  session: SessionWithClub;
  date: string;
  setDate: (iso: string) => void;
  onCreate: (courtId: Id<"courts">, startMin: number, seedText?: string) => void;
  onOpen: (entry: GridEntry) => void;
  pageTurn: PageTurn;
  notesOpen: boolean;
  setNotesOpen: (update: (open: boolean) => boolean) => void;
}) {
  // Both faces and the notes column subscribe from here, so turning the page
  // never re-fetches and the day bar can tell you what is on the other side.
  const day = useQuery(api.schedule.day, { date });
  const clinics = useQuery(api.clinics.forDate, { date });
  const note = useQuery(api.notes.forDate, { date });

  const today = todayIso();
  const relative = relativeDayLabel(date, today);
  const canEdit = session.membership.role !== "pro";

  const { shown, face, turnTo, faceProps } = pageTurn;
  const fullScreen = useFullScreen();

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
    <div className="page schedule">
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
        <button
          className={`btn${fullScreen.active ? " primary" : ""}`}
          onClick={fullScreen.toggle}
          aria-pressed={fullScreen.active}
          title={fullScreen.active ? "Leave full screen  ·  Esc" : "Full screen  ·  F"}
        >
          {fullScreen.active ? <ShrinkIcon /> : <ExpandIcon />}
          {fullScreen.active ? "Exit full screen" : "Full screen"}
        </button>
        <button className="btn" onClick={() => window.print()}>
          Print day sheet
        </button>
      </div>

      <TimeOffStrip canEdit={canEdit} />

      <div className={`flip-stage${shown === "clinics" ? " is-clinics" : ""}`}>
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

      <p className="muted no-print desk-hint">
        {shown === "clinics"
          ? "The back of the page: who signed up for each clinic. "
          : "Click any empty slot to book it. Drag a booking's bottom edge to lengthen it. "}
        <kbd>←</kbd> <kbd>→</kbd> move a day, <kbd>Shift</kbd> a week, <kbd>T</kbd>{" "}
        jumps to today, <kbd>Ctrl</kbd> <kbd>K</kbd> jumps to any date.{" "}
        <kbd>?</kbd> shows every shortcut.
      </p>

      {notesOpen ? (
        <NotesRail date={date} note={note} onClose={() => setNotesOpen(() => false)} />
      ) : null}
    </div>
  );
}
