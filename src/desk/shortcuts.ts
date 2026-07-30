/**
 * The desk runs on a keyboard. One person at a counter, a phone against their
 * ear, and a hand that never has to find the mouse — that's the whole reason
 * this app can be faster than the paper book it replaces.
 *
 * This list is the single source of truth: the handler in `DeskApp` reads it,
 * the `?` overlay renders it, and the Settings page prints it. Add a shortcut
 * here or it doesn't exist.
 */

export type ShortcutAction =
  | "palette"
  | "prevDay"
  | "nextDay"
  | "prevWeek"
  | "nextWeek"
  | "today"
  | "grid"
  | "clinics"
  | "notes"
  | "print"
  | "import"
  | "insights"
  | "settings"
  | "clients"
  | "help";

export type Shortcut = {
  action: ShortcutAction;
  /** Rendered one <kbd> per entry. */
  keys: string[];
  label: string;
  /** Directors and the front desk only — a coach's grid is read-only. */
  deskOnly?: boolean;
};

export type ShortcutGroup = { title: string; items: Shortcut[] };

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "The day",
    items: [
      { action: "prevDay", keys: ["←"], label: "Previous day" },
      { action: "nextDay", keys: ["→"], label: "Next day" },
      { action: "prevWeek", keys: ["Shift", "←"], label: "Back a week" },
      { action: "nextWeek", keys: ["Shift", "→"], label: "Forward a week" },
      { action: "today", keys: ["T"], label: "Jump to today" },
      { action: "palette", keys: ["Ctrl", "K"], label: "Jump to any date" },
    ],
  },
  {
    title: "The page",
    items: [
      { action: "grid", keys: ["G"], label: "Court grid" },
      { action: "clinics", keys: ["C"], label: "Clinic sheet" },
      { action: "notes", keys: ["N"], label: "Day notes" },
      { action: "print", keys: ["P"], label: "Print the day sheet" },
    ],
  },
  {
    title: "Go to",
    items: [
      { action: "import", keys: ["I"], label: "Import photos", deskOnly: true },
      { action: "insights", keys: ["R"], label: "Insights and reports", deskOnly: true },
      { action: "clients", keys: ["L"], label: "Clients", deskOnly: true },
      { action: "settings", keys: ["S"], label: "Settings", deskOnly: true },
    ],
  },
  {
    title: "Help",
    items: [{ action: "help", keys: ["?"], label: "This list" }],
  },
];

/** Tempo's own two, listed separately because they follow the Pro gate. */
export const TEMPO_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["A"], label: "Ask Tempo by typing" },
  { keys: ["V"], label: "Talk to Tempo out loud" },
];

/**
 * True while the keystroke belongs to whatever the operator is writing in.
 * Every bare-letter shortcut has to check this or the desk can't type a name
 * with a G in it.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/** A bare letter, with no modifier riding along. */
export function isBareKey(event: KeyboardEvent, key: string): boolean {
  return (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === key
  );
}
