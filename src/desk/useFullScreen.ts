import { useCallback, useEffect, useState } from "react";

/**
 * Full screen for the day grid.
 *
 * Two things happen at once and they are deliberately separate. The browser is
 * asked to go full screen, which is what actually buys the extra pixels; and the
 * app enters a focus mode that drops the top bar and the hint line so those
 * pixels go to the grid rather than to chrome.
 *
 * They are separate because the browser request can be refused — iOS Safari has
 * no element full screen at all, and a desktop browser will reject a request
 * that didn't come from a click. When that happens focus mode still runs, so the
 * button always does something visible rather than appearing broken.
 *
 * Escape exits either way: the browser fires `fullscreenchange` when it handles
 * Escape itself, and a key listener covers the focus-mode-only case.
 */
export function useFullScreen(): {
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
} {
  const [active, setActive] = useState(false);

  const enter = useCallback(() => {
    setActive(true);
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      void root.requestFullscreen().catch(() => {
        /* refused — focus mode alone still widens the grid */
      });
    }
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    if (active) exit();
    else enter();
  }, [active, enter, exit]);

  // The browser handles Escape itself while it is full screen, and tells us
  // afterwards. Following it keeps the two halves from drifting apart.
  useEffect(() => {
    function onChange() {
      if (!document.fullscreenElement) setActive(false);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // And when the browser never went full screen, Escape is ours to handle.
  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.fullscreenElement) exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, exit]);

  // The F shortcut is handled by the desk's one keyboard listener, which lives
  // a level up from the day bar.
  useEffect(() => {
    function onRequest() {
      setActive((current) => {
        if (current) {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          return false;
        }
        const root = document.documentElement;
        if (!document.fullscreenElement && root.requestFullscreen) {
          void root.requestFullscreen().catch(() => {});
        }
        return true;
      });
    }
    window.addEventListener("courtime:fullscreen", onRequest);
    return () => window.removeEventListener("courtime:fullscreen", onRequest);
  }, []);

  // A class on <html>, not on a component, because the top bar lives outside
  // the schedule page and has to go too.
  useEffect(() => {
    document.documentElement.classList.toggle("is-fullscreen", active);
    return () => document.documentElement.classList.remove("is-fullscreen");
  }, [active]);

  return { active, enter, exit, toggle };
}
