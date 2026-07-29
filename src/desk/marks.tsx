/** Two tiny glyphs the desk needs inside dense chips and table rows. */

/**
 * The red asterisk from the paper page: this client asked for this pro by name.
 * Drawn rather than typed, so it can never render as an emoji.
 */
export function AsteriskMark({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M6 1.8v8.4M2.36 3.9l7.28 4.2M2.36 8.1l7.28-4.2" />
    </svg>
  );
}

export function CrossMark({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}
