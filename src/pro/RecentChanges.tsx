import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatDateMedium, relativeDayLabel } from "../lib/time";
import { changeTone, changeWord, sinceLabel } from "./data";

/**
 * The desk's edits to this coach's own sessions. It answers "did something
 * change while I was on court?" without making anyone compare two screens.
 */
export default function RecentChanges({ today }: { today: string }) {
  const alerts = useQuery(api.notifications.myRecentAlerts, { limit: 4 });

  if (!alerts || alerts.length === 0) return null;

  return (
    <section className="card pro-alerts">
      <div className="card-head">
        <h2>Recent changes</h2>
      </div>
      <div className="rows">
        {alerts.map((alert) => (
          <div className="row" key={alert._id}>
            <span className={changeTone(alert.changeType)}>
              {changeWord(alert.changeType)}
            </span>
            <span className="grow">
              <span className="title">{alert.summary}</span>
              <span className="sub">
                {relativeDayLabel(alert.date, today) ?? formatDateMedium(alert.date)}
              </span>
            </span>
            <span className="when">{sinceLabel(alert._creationTime)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
