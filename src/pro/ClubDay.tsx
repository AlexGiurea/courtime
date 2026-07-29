import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { addDays, formatDateLong, relativeDayLabel } from "../lib/time";
import DayNav from "./DayNav";
import ProGrid from "./ProGrid";
import { saveDayImage } from "./dayImage";
import { ImageIcon, ZoomIn, ZoomOut } from "./icons";
import {
  memberMap,
  type ProData,
  sessionCount,
  useClock,
  useSwipeDays,
} from "./data";

/** Three steps is enough: a court at a time, three at a time, the whole club. */
const ZOOMS = [0.62, 0.82, 1.05];

/**
 * The club's whole day on a phone — the same grid the front desk is looking at,
 * not a summarised list of it. A coach walking in wants the page they'd have
 * read off the wall: who is on which court, with their own hours picked out.
 *
 * It scrolls in both directions and zooms out to the whole club, and it saves
 * to the camera roll, because the way a coach actually shares a day is by
 * sending someone a picture of it.
 */
export default function ClubDay({ pro }: { pro: ProData }) {
  const { today } = useClock();
  const [date, setDate] = useState(today);
  const [zoomStep, setZoomStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const result = useQuery(api.schedule.clubDay, { date });
  const members = useMemo(() => memberMap(pro.members), [pro.members]);
  const swipe = useSwipeDays(
    () => setDate((current) => addDays(current, -1)),
    () => setDate((current) => addDays(current, 1)),
  );

  const entries = useMemo(() => result?.entries ?? [], [result]);

  const columns = useMemo(
    () =>
      pro.courts.map((court) => {
        const coached = entries.find(
          (entry) => entry.courtId === court._id && entry.proMembershipId,
        );
        const name = coached?.proMembershipId
          ? (members.get(coached.proMembershipId)?.displayName ?? null)
          : null;
        return { id: court._id, name: court.name, sub: name ?? "Open play" };
      }),
    [pro.courts, entries, members],
  );

  async function onSave() {
    setSaving(true);
    setSaved(null);
    try {
      const outcome = await saveDayImage({
        clubName: pro.orgName,
        heading: "The club",
        date,
        columns,
        entries,
        columnOf: (entry) => entry.courtId,
        dayStartMin: pro.dayStartMin,
        dayEndMin: pro.dayEndMin,
        members,
        mineId: pro.membershipId,
      });
      setSaved(
        outcome === "shared"
          ? "Sent to your share sheet — choose Save Image."
          : outcome === "downloaded"
            ? "Saved as a PNG."
            : "That didn't save. Try again?",
      );
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaved(null), 6000);
    }
  }

  return (
    <>
      <header className="pro-head">
        <h1>The club</h1>
        <p>Everyone's courts, so you know who's out there.</p>
      </header>

      <DayNav date={date} today={today} onChange={setDate} />

      {result === undefined ? (
        <div className="pro-loading">
          <span className="spinner" />
          Loading the club's day…
        </div>
      ) : result === null || result.allowed === false ? (
        <Restricted />
      ) : (
        <>
          <div className="club-tools">
            <span className="club-count tabular">
              {entries.length === 0
                ? "Nothing booked"
                : `${sessionCount(entries.length)} across the club`}
            </span>

            <div className="zoom-group" role="group" aria-label="Zoom">
              <button
                type="button"
                className="btn sm pro-icon-btn"
                aria-label="Zoom out"
                disabled={zoomStep === 0}
                onClick={() => setZoomStep((step) => Math.max(0, step - 1))}
              >
                <ZoomOut />
              </button>
              <button
                type="button"
                className="btn sm pro-icon-btn"
                aria-label="Zoom in"
                disabled={zoomStep === ZOOMS.length - 1}
                onClick={() => setZoomStep((step) => Math.min(ZOOMS.length - 1, step + 1))}
              >
                <ZoomIn />
              </button>
            </div>

            <button
              type="button"
              className="btn sm"
              onClick={() => void onSave()}
              disabled={saving || entries.length === 0}
            >
              {saving ? <span className="spinner" /> : <ImageIcon />}
              Save image
            </button>
          </div>

          {saved ? <p className="club-saved">{saved}</p> : null}

          {entries.length === 0 ? (
            <div className="empty">
              <p className="empty-line">
                No courts booked{" "}
                {relativeDayLabel(date, today)?.toLowerCase() ??
                  `on ${formatDateLong(date).split(",")[0]}`}
                .
              </p>
              <p className="empty-sub">The whole club is open — for now.</p>
            </div>
          ) : (
            <div {...swipe}>
              <ProGrid
                columns={columns}
                entries={entries}
                columnOf={(entry) => entry.courtId}
                dayStartMin={pro.dayStartMin}
                dayEndMin={pro.dayEndMin}
                members={members}
                mineId={pro.membershipId}
                zoom={ZOOMS[zoomStep]}
              />
              <p className="club-hint">
                Scroll sideways for the rest of the courts. Yours are outlined in
                green.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Restricted() {
  return (
    <div className="card card-pad">
      <h4 className="restricted-title">This club keeps the full day private</h4>
      <p className="restricted-copy">
        Your own hours are always here and always current. If you need to see the
        rest of the club's courts, an admin can switch it on in the club's
        settings.
      </p>
    </div>
  );
}
