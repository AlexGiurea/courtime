/**
 * The call's one piece of motion: a row of thin bars that rises with whoever is
 * actually talking. Grey while the operator speaks, accent while Tempo does, a
 * flat hairline when the room is quiet — the same 1px rule the rest of the app
 * is built from, just briefly alive. Heights come off a real AnalyserNode, so
 * silence looks like silence.
 */
import { useEffect, useRef } from "react";
import type { VoiceMeter, VoiceStatus } from "./voice";

const BARS = 11;
const BANDS = 6;
const CENTRE = (BARS - 1) / 2;
const REST = 0.07;

type Mode = "user" | "tempo" | "pulse" | "rest";

function modeFor(status: VoiceStatus): Mode {
  if (status === "speaking") return "tempo";
  if (status === "listening") return "user";
  if (status === "thinking" || status === "connecting") return "pulse";
  return "rest";
}

export function VoiceBars({
  meter,
  status,
}: {
  meter: VoiceMeter;
  status: VoiceStatus;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>(modeFor(status));
  modeRef.current = modeFor(status);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const bars = Array.from(row.children) as HTMLElement[];
    const values = new Array<number>(bars.length).fill(REST);

    const paint = () => {
      for (let i = 0; i < bars.length; i++) {
        bars[i].style.transform = `scaleY(${Math.max(REST, values[i]).toFixed(3)})`;
      }
    };

    // Someone who has asked for less motion gets a static row and reads the
    // status line instead; nothing here is load-bearing information.
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (calm?.matches) {
      const level = () => {
        const flat = modeRef.current === "rest" ? REST : 0.34;
        for (let i = 0; i < values.length; i++) values[i] = flat;
        paint();
      };
      level();
      const timer = window.setInterval(level, 400);
      return () => window.clearInterval(timer);
    }

    let frame = 0;
    const tick = () => {
      const mode = modeRef.current;
      let targets: number[];

      if (mode === "user" || mode === "tempo") {
        const bands = meter.bands(mode === "user" ? "input" : "output", BANDS);
        targets = bars.map((_, i) => bands[Math.round(Math.abs(i - CENTRE))] ?? 0);
      } else if (mode === "pulse") {
        // Waiting on the model — honest about not being audio, so it stays a
        // slow shallow swell rather than pretending someone is talking.
        const t = performance.now() / 340;
        targets = bars.map((_, i) => 0.16 + 0.08 * Math.sin(t - i * 0.42));
      } else {
        targets = bars.map(() => 0);
      }

      for (let i = 0; i < values.length; i++) {
        const target = targets[i] ?? 0;
        // Quick to rise, slow to fall: a meter that decays as fast as it climbs
        // reads as flicker.
        const ease = target > values[i] ? 0.55 : 0.14;
        values[i] += (target - values[i]) * ease;
      }
      paint();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [meter]);

  return (
    <div
      className={`voice-bars is-${modeFor(status)}`}
      ref={rowRef}
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
