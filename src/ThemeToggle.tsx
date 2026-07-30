import { useTheme } from "./lib/theme";

/**
 * One button, three states: light, dark, follow the computer. A dot in the
 * corner marks "follow", because a switch with a hidden third position that
 * nobody can see is a switch nobody uses.
 */
export default function ThemeToggle() {
  const { choice, resolved, cycle } = useTheme();

  const label =
    choice === "system"
      ? `Following your computer (${resolved})`
      : choice === "dark"
        ? "Dark"
        : "Light";

  return (
    <button
      type="button"
      className="theme-toggle no-print"
      data-choice={choice}
      onClick={cycle}
      title={`${label} — click to change`}
      aria-label={`Theme: ${label}. Click to change.`}
    >
      {resolved === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M16.3 12.6A7 7 0 0 1 7.4 3.7a7 7 0 1 0 8.9 8.9Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8M15.8 4.2l-1.5 1.5M5.7 14.3l-1.5 1.5M15.8 15.8l-1.5-1.5M5.7 5.7 4.2 4.2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
