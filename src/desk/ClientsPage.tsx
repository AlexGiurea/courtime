import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { SessionWithClub } from "../App";
import { Loading, useGuarded } from "../ui";
import { formatDateMedium } from "../lib/time";

/**
 * Who the club teaches.
 *
 * Every person here was built out of the paper book — a name in a column, or a
 * line on a clinic sheet. Nothing was typed twice, and nothing about the
 * bookings themselves was rewritten to produce it.
 */
export default function ClientsPage(_: { session: SessionWithClub }) {
  const [search, setSearch] = useState("");
  const clients = useQuery(api.clients.list, { search });
  const backfill = useMutation(api.clients.backfill);
  const guarded = useGuarded();

  if (clients === undefined) return <Loading label="Reading the book" />;
  if (clients === null) {
    return (
      <div className="page narrow">
        <p className="empty">Clients are available to the front desk and directors.</p>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>Built from the bookings and clinic sheets you already have.</p>
        </div>
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Search a name or phone…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {clients.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <p className="empty" style={{ padding: "20px 0" }}>
            {search
              ? `Nobody matching "${search}".`
              : "No clients yet. Read the ones already in the book."}
          </p>
          {!search ? (
            <button
              className="btn"
              onClick={() =>
                void guarded(async () => {
                  const result = await backfill({});
                  return result;
                }, "Clients built from the book")
              }
            >
              Build from existing bookings
            </button>
          ) : null}
        </div>
      ) : (
        <div className="card">
          <ul className="client-list">
            {clients.map((client) => (
              <li key={client._id}>
                <Link to={`/desk/clients/${client._id}`}>
                  <span className="client-name">{client.displayName}</span>
                  <span className="client-meta tabular">
                    {client.rating ? `${client.rating} · ` : ""}
                    {client.visits} {client.visits === 1 ? "session" : "sessions"}
                    {client.lastSeen ? ` · last ${formatDateMedium(client.lastSeen)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Names come from what the desk wrote. Nothing here changes a booking —
        correcting a name here only changes the profile.
      </p>
    </div>
  );
}

export function ClientProfilePage({ session }: { session: SessionWithClub }) {
  const params = useParams();
  const navigate = useNavigate();
  const clientId = params.clientId as Id<"clients"> | undefined;
  const data = useQuery(
    api.clients.profile,
    clientId ? { clientId } : "skip",
  );
  const update = useMutation(api.clients.update);
  const guarded = useGuarded();
  const canEdit = session.membership.role !== "pro";

  if (data === undefined) return <Loading label="Opening the profile" />;
  if (data === null) {
    return (
      <div className="page narrow">
        <p className="empty">That client isn't available.</p>
      </div>
    );
  }

  const { client, totals, coaches, sessions } = data;
  const favourite = coaches[0];

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <button className="btn ghost sm" onClick={() => navigate("/desk/clients")}>
            ← All clients
          </button>
          <h1 style={{ marginTop: 8 }}>{client.displayName}</h1>
          <p>
            {client.phone ? `${client.phone} · ` : ""}
            {client.rating ? `NTRP ${client.rating}` : "No rating on file"}
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="client-stats">
          <div>
            <b className="tabular">{totals.visits}</b>
            <span>sessions on record</span>
          </div>
          <div>
            <b className="tabular">{totals.clinics}</b>
            <span>clinic sign-ups</span>
          </div>
          <div>
            <b className="tabular">{totals.requested}</b>
            <span>asked for their pro by name</span>
          </div>
          <div>
            <b className="tabular">
              {totals.lastSeen ? formatDateMedium(totals.lastSeen) : "—"}
            </b>
            <span>last on court</span>
          </div>
        </div>

        {favourite ? (
          <div className="card card-pad client-bond">
            <h3>Who they play with</h3>
            <p>
              {favourite.count} of their {totals.bookings} lessons were with{" "}
              <b>{favourite.name}</b>
              {favourite.requested > 0
                ? `, and they asked for ${favourite.name.split(/\s+/)[0]} by name ${favourite.requested} ${favourite.requested === 1 ? "time" : "times"}.`
                : "."}
            </p>
            {coaches.length > 1 ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Also with {coaches.slice(1).map((c) => `${c.name} (${c.count})`).join(", ")}.
              </p>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Details</h2>
                <p>What the club knows. Only the profile changes, never a booking.</p>
              </div>
            </div>
            <div className="card-pad client-fields">
              <label>
                Name
                <input
                  className="input"
                  defaultValue={client.displayName}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== client.displayName) {
                      void guarded(
                        () => update({ clientId: client._id, displayName: value }),
                        "Saved",
                      );
                    }
                  }}
                />
              </label>
              <label>
                Phone
                <input
                  className="input"
                  defaultValue={client.phone ?? ""}
                  onBlur={(event) =>
                    void guarded(
                      () => update({ clientId: client._id, phone: event.target.value.trim() }),
                      "Saved",
                    )
                  }
                />
              </label>
              <label>
                NTRP
                <input
                  className="input"
                  defaultValue={client.rating ?? ""}
                  onBlur={(event) =>
                    void guarded(
                      () => update({ clientId: client._id, rating: event.target.value.trim() }),
                      "Saved",
                    )
                  }
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Note
                <input
                  className="input"
                  defaultValue={client.note ?? ""}
                  placeholder="Anything the desk should remember"
                  onBlur={(event) =>
                    void guarded(
                      () => update({ clientId: client._id, note: event.target.value.trim() }),
                      "Saved",
                    )
                  }
                />
              </label>
            </div>
            {client.aliases.length > 1 ? (
              <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
                <p className="muted" style={{ fontSize: 12 }}>
                  Also written as {client.aliases.filter((a) => a !== client.displayName).join(", ")}.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Every session</h2>
              <p>Most recent first.</p>
            </div>
          </div>
          <ul className="client-sessions">
            {sessions.map((session_, index) => (
              <li key={`${session_.date}-${index}`}>
                <span className="when tabular">{formatDateMedium(session_.date)}</span>
                <span className="what">
                  {session_.label}
                  {session_.requested ? <span className="req">✳</span> : null}
                </span>
                <span className="who tabular">
                  {[session_.time, session_.court, session_.coach]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
