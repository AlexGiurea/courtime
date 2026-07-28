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

export function CloseIcon({ size = 14 }: IconProps) {
  return (
    <svg {...frame(size)} strokeWidth={1.8}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
