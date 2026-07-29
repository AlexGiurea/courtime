import { AnimationEvent, CSSProperties, useCallback, useEffect, useState } from "react";

/**
 * The page turn between the court grid and the clinic sheet.
 *
 * The schedule page keeps rendering whatever `shown` says, so the outgoing face
 * stays on screen and untouched while the sheet rotates edge-on; the content
 * swaps in the invisible moment between the two halves of the turn, and only
 * `transform` and `opacity` ever animate. Nothing here re-fetches — both faces'
 * queries live above this hook and stay subscribed the whole time.
 */

type Phase = "idle" | "out" | "in";

/**
 * Comfortably longer than either half of the turn in desk.css (150ms out,
 * 170ms in) but short enough that a dropped `animationend` — a background tab
 * that never composites a frame, say — is barely noticeable.
 */
const SAFETY_MS = 500;

export function usePageTurn<T extends string>(initial: T): {
  shown: T;
  face: T;
  turning: boolean;
  turnTo: (next: T, direction?: number) => void;
  faceProps: {
    className: string;
    style: CSSProperties;
    onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
  };
} {
  const [shown, setShown] = useState<T>(initial);
  const [target, setTarget] = useState<T | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [direction, setDirection] = useState(1);

  const advance = useCallback(() => {
    if (phase === "out") {
      if (target) setShown(target);
      setTarget(null);
      setPhase("in");
    } else if (phase === "in") {
      setPhase("idle");
    }
  }, [phase, target]);

  // If the animation never fires — a paused tab, a printer, a browser that
  // drops the event — the turn still has to finish rather than strand the page.
  useEffect(() => {
    if (phase === "idle") return;
    const id = window.setTimeout(advance, SAFETY_MS);
    return () => window.clearTimeout(id);
  }, [phase, advance]);

  const turnTo = useCallback(
    (next: T, dir = 1) => {
      if (next === shown || phase !== "idle") return;
      setDirection(dir);
      setTarget(next);
      setPhase("out");
    },
    [shown, phase],
  );

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLDivElement>) => {
      // Chips, spinners and the live dot all animate inside this subtree.
      if (event.target !== event.currentTarget) return;
      advance();
    },
    [advance],
  );

  return {
    shown,
    face: target ?? shown,
    turning: phase !== "idle",
    turnTo,
    faceProps: {
      className: `flip-face${phase === "out" ? " turning-out" : phase === "in" ? " turning-in" : ""}`,
      style: { "--turn": direction } as unknown as CSSProperties,
      onAnimationEnd,
    },
  };
}
