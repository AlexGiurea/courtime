import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Loading, useGuarded } from "../ui";
import { formatDateLong, formatSpan, formatTime, timeOptions } from "../lib/time";
import { Participant, RosterBody, hasRoster } from "./RosterPanel";

type ClinicsDay = NonNullable<FunctionReturnType<typeof api.clinics.forDate>>;
export type ClinicRoster = ClinicsDay["rosters"][number];

/**
 * The back of the paper page: the day's clinic sign-up sheets, in the order
 * they run. Same date as the grid, same day bar — the only thing that changes
 * is which side of the sheet you are looking at.
 */
export default function ClinicsFace({
  session,
  date,
  data,
  entries,
  canEdit,
}: {
  session: SessionWithClub;
  date: string;
  data: ClinicsDay | null | undefined;
  entries: Doc<"entries">[];
  canEdit: boolean;
}) {
  const save = useMutation(api.clinics.save);
  const guarded = useGuarded();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rosters = data?.rosters ?? [];

  async function addClinic() {
    setAdding(true);
    const result = await guarded(
      () => save({ date, title: "New clinic", participants: [] }),
      "Clinic added",
    );
    setAdding(false);
    if (result) setFocusId(result.rosterId as string);
  }

  if (data === undefined) return <Loading label="Turning the page" />;

  return (
    <div>
      {rosters.length === 0 ? (
        <div className="card">
          <p className="empty" style={{ paddingBottom: canEdit ? 12 : 44 }}>
            Nothing has been captured from the back of the page for{" "}
            {formatDateLong(date)}.
            <br />
            Clinic sheets come across with the day's photos, or you can write one
            here.
          </p>
          {canEdit ? (
            <div style={{ textAlign: "center", paddingBottom: 26 }}>
              <button className="btn" disabled={adding} onClick={() => void addClinic()}>
                Add a clinic
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="clinic-list">
          {rosters.map((roster) => (
            <ClinicCard
              key={roster._id as string}
              roster={roster}
              session={session}
              date={date}
              entries={entries}
              canEdit={canEdit}
              autoFocus={focusId === (roster._id as string)}
            />
          ))}

          {canEdit ? (
            <div>
              <button className="btn" disabled={adding} onClick={() => void addClinic()}>
                Add a clinic
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClinicCard({
  roster,
  session,
  date,
  entries,
  canEdit,
  autoFocus,
}: {
  roster: ClinicRoster;
  session: SessionWithClub;
  date: string;
  entries: Doc<"entries">[];
  canEdit: boolean;
  autoFocus: boolean;
}) {
  const save = useMutation(api.clinics.save);
  const remove = useMutation(api.clinics.remove);
  const link = useMutation(api.clinics.linkToEntry);
  const guarded = useGuarded();

  const [title, setTitle] = useState(roster.title);
  const [startMin, setStartMin] = useState<number | undefined>(roster.startMin);
  const [endMin, setEndMin] = useState<number | undefined>(roster.endMin);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [autoFocus]);

  const slots = timeOptions(session.org.dayStartMin, session.org.dayEndMin);

  const persist = useCallback(
    (patch: {
      title?: string;
      startMin?: number;
      endMin?: number;
      participants?: Participant[];
    }) =>
      void guarded(async () => {
        await save({
          rosterId: roster._id,
          date,
          title: patch.title ?? title,
          startMin: "startMin" in patch ? patch.startMin : startMin,
          endMin: "endMin" in patch ? patch.endMin : endMin,
          entryId: roster.entryId,
          participants: patch.participants ?? roster.participants,
        });
        return true;
      }),
    [guarded, save, roster, date, title, startMin, endMin],
  );

  // Only bookings that could plausibly carry a sheet, plus whatever this roster
  // is already pointing at.
  const linkable = entries.filter(
    (entry) => hasRoster(entry.sessionType) || entry._id === roster.entryId,
  );
  const courtName = new Map(
    session.courts.map((court) => [court._id as string, court.name]),
  );

  const spanLabel =
    startMin !== undefined && endMin !== undefined
      ? formatSpan(startMin, endMin)
      : startMin !== undefined
        ? `From ${formatTime(startMin)}`
        : "No time on the sheet";

  return (
    <section className="card clinic-card">
      <div className="clinic-head">
        <div className="titles">
          {canEdit ? (
            <input
              ref={titleRef}
              className="clinic-title"
              value={title}
              autoFocus={autoFocus}
              aria-label="Clinic name"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                if (title.trim() && title !== roster.title) persist({ title });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          ) : (
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>{roster.title}</h2>
          )}

          <div className="clinic-sub">
            <span className="tabular">{spanLabel}</span>
            {roster.court ? <span className="tag">{roster.court}</span> : null}
            {roster.coach ? <span className="tag accent">{roster.coach}</span> : null}
            <span className="tag">
              {roster.participants.length === 0
                ? "No names yet"
                : `${roster.participants.length} signed up`}
            </span>
          </div>
        </div>

        {canEdit ? (
          <div className="times">
            <select
              className="select"
              aria-label="Clinic start"
              value={startMin ?? ""}
              onChange={(event) => {
                const next = event.target.value ? Number(event.target.value) : undefined;
                setStartMin(next);
                const nextEnd =
                  next !== undefined && (endMin === undefined || endMin <= next)
                    ? Math.min(next + 60, session.org.dayEndMin)
                    : endMin;
                setEndMin(nextEnd);
                persist({ startMin: next, endMin: nextEnd });
              }}
            >
              <option value="">Start —</option>
              {slots.map((min) => (
                <option key={min} value={min}>
                  {formatTime(min)}
                </option>
              ))}
            </select>
            <span aria-hidden="true">–</span>
            <select
              className="select"
              aria-label="Clinic end"
              value={endMin ?? ""}
              onChange={(event) => {
                const next = event.target.value ? Number(event.target.value) : undefined;
                setEndMin(next);
                persist({ endMin: next });
              }}
            >
              <option value="">End —</option>
              {slots.map((min) => (
                <option key={min} value={min}>
                  {formatTime(min)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <RosterBody
        participants={roster.participants}
        canEdit={canEdit}
        onCommit={(participants) => persist({ participants })}
      />

      {canEdit ? (
        <div className="clinic-foot">
          <label htmlFor={`link-${roster._id as string}`}>On the grid</label>
          <select
            id={`link-${roster._id as string}`}
            className="select"
            value={(roster.entryId as string | undefined) ?? ""}
            onChange={(event) =>
              void guarded(async () => {
                await link({
                  rosterId: roster._id,
                  entryId: event.target.value
                    ? (event.target.value as Id<"entries">)
                    : null,
                });
                return true;
              })
            }
          >
            <option value="">
              {roster.matchedEntryId ? "Matched by time" : "Not on the grid"}
            </option>
            {linkable.map((entry) => (
              <option key={entry._id as string} value={entry._id as string}>
                {courtName.get(entry.courtId as string) ?? "Court"} ·{" "}
                {formatTime(entry.startMin)} · {entry.label}
              </option>
            ))}
          </select>

          <span style={{ marginLeft: "auto" }} />
          {confirmRemove ? (
            <>
              <button className="btn ghost sm" onClick={() => setConfirmRemove(false)}>
                Keep
              </button>
              <button
                className="btn danger sm"
                onClick={() =>
                  void guarded(
                    async () => {
                      await remove({ rosterId: roster._id });
                      return true;
                    },
                    "Sheet removed",
                  )
                }
              >
                Remove the sheet
              </button>
            </>
          ) : (
            <button className="btn ghost sm" onClick={() => setConfirmRemove(true)}>
              Remove
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
