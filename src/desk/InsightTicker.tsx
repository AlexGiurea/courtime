import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * The line that rotates at the top of Insights.
 *
 * Six short observations about the club's day and week, written from numbers
 * the server already computed, cross-fading one at a time. It is the one place
 * in the app that talks to the director unprompted — so it stays a single line
 * of quiet green, never a card, never a banner, and it never asks for anything.
 *
 * The lines are cached per club per day on the backend, so this costs about a
 * fifth of a cent a day whatever anyone does with the page.
 */

const HOLD_MS = 6500;
const FADE_MS = 420;

export default function InsightTicker() {
  const cached = useQuery(api.insights.cached);
  const refresh = useAction(api.insights.refresh);

  const [lines, setLines] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [showing, setShowing] = useState(true);
  const asked = useRef(false);

  // Cached lines arrive with the page; a first load of the day generates them.
  useEffect(() => {
    if (cached === undefined) return;
    if (cached && cached.lines.length) {
      setLines(cached.lines);
      return;
    }
    if (asked.current) return;
    asked.current = true;
    void refresh({})
      .then((result) => setLines(result.lines))
      .catch(() => setLines([]));
  }, [cached, refresh]);

  useEffect(() => {
    if (lines.length < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Out, swap while invisible, back in — so two lines never overlap mid-fade.
    const hold = window.setTimeout(() => {
      if (reduced) {
        setIndex((current) => (current + 1) % lines.length);
        return;
      }
      setShowing(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % lines.length);
        setShowing(true);
      }, FADE_MS);
    }, HOLD_MS);

    return () => window.clearTimeout(hold);
  }, [lines, index]);

  if (!lines.length) return null;

  return (
    <div className="insight-ticker" role="status" aria-live="polite">
      <span className="insight-spark" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1.6 9.4 5.9 13.7 7.3 9.4 8.7 8 13 6.6 8.7 2.3 7.3 6.6 5.9Z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      </span>
      <p className={`insight-line${showing ? " in" : ""}`} key={index}>
        {lines[index]}
      </p>
      <span className="insight-dots" aria-hidden="true">
        {lines.map((line, dot) => (
          <i key={line} className={dot === index ? "on" : ""} />
        ))}
      </span>
    </div>
  );
}
