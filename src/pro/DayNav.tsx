import { addDays, formatDateMedium, relativeDayLabel } from "../lib/time";
import { ChevronLeft, ChevronRight } from "./icons";

type Props = {
  date: string;
  today: string;
  onChange: (iso: string) => void;
};

/** Prev / next / today, shared by My day and The club. */
export default function DayNav({ date, today, onChange }: Props) {
  const relative = relativeDayLabel(date, today);
  return (
    <div className="pro-daynav">
      <button
        type="button"
        className="btn sm pro-icon-btn"
        aria-label="Previous day"
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronLeft />
      </button>

      <div className="label">
        {relative ?? formatDateMedium(date)}
        {relative ? <span className="sub tabular">{formatDateMedium(date)}</span> : null}
      </div>

      {date === today ? null : (
        <button type="button" className="btn sm" onClick={() => onChange(today)}>
          Today
        </button>
      )}

      <button
        type="button"
        className="btn sm pro-icon-btn"
        aria-label="Next day"
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight />
      </button>
    </div>
  );
}
