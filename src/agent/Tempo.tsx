/**
 * Tempo — Courtime's assistant.
 *
 * The mark it grows out of is the Courtime logo: a rounded court with a net
 * down the middle. Give that court a face and a clock hand for a cowlick and
 * you get a character that reads as "the thing that keeps the club's time"
 * without borrowing anything from Breakpoint's tennis ball.
 */
export type TempoState =
  | "idle"
  | "thinking"
  | "happy"
  /** Ear open, hand sweeping steadily: a call is live and it's your turn. */
  | "listening"
  /** Hand swings like a metronome while it talks. */
  | "speaking";

export function Tempo({
  size = 40,
  state = "idle",
  className,
}: {
  size?: number;
  state?: TempoState;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`tempo tempo--${state}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label="Tempo, the Courtime assistant"
    >
      {/* clock hand — the "time" half of the name, and the character's tell */}
      <g className="tempo__hand" transform="translate(24 25)">
        <line x1="0" y1="0" x2="0" y2="-19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="0" cy="-19" r="2.6" fill="currentColor" />
      </g>

      {/* the court */}
      <rect
        className="tempo__body"
        x="5"
        y="11"
        width="38"
        height="31"
        rx="9"
        fill="var(--paper, #fff)"
        stroke="currentColor"
        strokeWidth="2.4"
      />

      {/* the net */}
      <line
        x1="24"
        y1="11"
        x2="24"
        y2="42"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.28"
      />
      {/* service line */}
      <line
        x1="10"
        y1="34"
        x2="38"
        y2="34"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.18"
      />

      <g className="tempo__face" fill="var(--ink, #101418)">
        <g className="tempo__eyes">
          <circle className="tempo__eye" cx="17" cy="23" r="2.5" />
          <circle className="tempo__eye" cx="31" cy="23" r="2.5" />
        </g>
        <path
          className="tempo__smile"
          d="M19.5 28.6c1.3 1.5 2.8 2.2 4.5 2.2s3.2-.7 4.5-2.2"
          fill="none"
          stroke="var(--ink, #101418)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
