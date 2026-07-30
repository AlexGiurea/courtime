import { useEffect, useState } from "react";

/**
 * Light, dark, or whatever the machine is set to.
 *
 * Three states rather than two on purpose: a front desk that runs dark all
 * winter and light all summer should be able to say "follow the computer" and
 * stop thinking about it. The choice is stored per browser, so the desk machine
 * and a coach's phone can disagree.
 *
 * The applied theme is stamped on <html> as `data-theme`, which is also what
 * the pre-paint script in index.html sets — so the page never flashes white
 * before React has mounted.
 */

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "courtime-theme";

export function storedChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* private browsing, or storage disabled */
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

export function applyTheme(choice: ThemeChoice): void {
  const resolved = resolve(choice);
  document.documentElement.setAttribute("data-theme", resolved);

  // The PWA's status bar and the browser's own chrome follow the app.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#0f1418" : "#0e7a5f");
  }
}

export function useTheme(): {
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (next: ThemeChoice) => void;
  cycle: () => void;
} {
  const [choice, setStored] = useState<ThemeChoice>(() => storedChoice());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolve(storedChoice()),
  );

  useEffect(() => {
    applyTheme(choice);
    setResolved(resolve(choice));
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* nothing to do — the theme still applies for this session */
    }
  }, [choice]);

  // On "system", follow the machine while the app is open.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setResolved(resolve("system"));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  return {
    choice,
    resolved,
    setChoice: setStored,
    /**
     * A plain toggle against what you can actually see. Starting from "follow
     * the computer" on a light machine, one press gives you dark — which is the
     * only thing anyone means when they press a moon.
     */
    cycle: () => setStored(resolve(choice) === "dark" ? "light" : "dark"),
  };
}
