/** Line icons for the pro surface: 20px grid, one stroke weight, no fills. */

type IconProps = { size?: number };

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function DayIcon({ size = 20 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M4 5.5h12M4 10h12M4 14.5h8" />
      <circle cx="2" cy="5.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="2" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WeekIcon({ size = 20 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" />
      <path d="M2.5 7.5h15M7 2.5v2.5M13 2.5v2.5M7 11h6M7 14h3" />
    </svg>
  );
}

export function ClubIcon({ size = 20 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.2" />
      <path d="M10 3.5v13M2.5 10h15" strokeDasharray="2 2" />
    </svg>
  );
}

export function ChevronLeft({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)} strokeWidth={1.9}>
      <path d="M12.5 4l-5 6 5 6" />
    </svg>
  );
}

export function ChevronRight({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)} strokeWidth={1.9}>
      <path d="M7.5 4l5 6-5 6" />
    </svg>
  );
}

export function BellIcon({ size = 18 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2-1 4.2-1.5 4.8-.3.3-.1.9.4.9h11.2c.5 0 .7-.6.4-.9-.5-.6-1.5-1.6-1.5-4.8A4.5 4.5 0 0 0 10 2.5Z" />
      <path d="M8.2 15.3a1.9 1.9 0 0 0 3.6 0" />
    </svg>
  );
}

export function ShareIcon({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M10 12.5V3m0 0L7 6m3-3 3 3" />
      <path d="M5 9H3.5v7.5h13V9H15" />
    </svg>
  );
}

/** The red asterisk beside a lesson on the paper page — drawn, never an emoji. */
export function AsteriskIcon({ size = 12 }: IconProps) {
  return (
    <svg {...frame(size)} viewBox="0 0 12 12" strokeWidth={1.5}>
      <path d="M6 1.8v8.4M2.36 3.9l7.28 4.2M2.36 8.1l7.28-4.2" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <svg {...frame(size)} strokeWidth={1.8}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function ZoomIn({ size = 15 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <circle cx="8.6" cy="8.6" r="5.4" />
      <path d="M12.6 12.6 17 17M8.6 6.4v4.4M6.4 8.6h4.4" />
    </svg>
  );
}

export function ZoomOut({ size = 15 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <circle cx="8.6" cy="8.6" r="5.4" />
      <path d="M12.6 12.6 17 17M6.4 8.6h4.4" />
    </svg>
  );
}

/** Save the day as a picture — a frame with a horizon, not a camera. */
export function ImageIcon({ size = 15 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <rect x="2.8" y="3.6" width="14.4" height="12.8" rx="2" />
      <path d="M2.8 13 7 9.4l3.4 2.8L13.4 9l3.8 3.4" />
      <circle cx="7.4" cy="7.4" r="1.2" />
    </svg>
  );
}
