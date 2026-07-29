/**
 * Tempo's voice half, browser side.
 *
 * The audio path is a direct WebRTC peer connection to OpenAI — anything that
 * relays audio through our own server adds a round trip you can hear. What our
 * server keeps is the part that matters: `realtime.session` mints a short-lived
 * client secret (the real key never reaches this file), and every tool the model
 * wants to run goes back through `agent.invokeTool`, which re-derives who is
 * calling. Nothing in here is trusted with identity or role.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { todayIso } from "../lib/time";

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

export type VoiceFaultKind =
  | "permission"
  | "no-mic"
  | "insecure"
  | "unsupported"
  | "mint"
  | "dropped"
  | "unknown";

export type VoiceFault = {
  kind: VoiceFaultKind;
  message: string;
  /** Faults the operator can fix by tapping the mic again. */
  retry: boolean;
};

/** What the panel is showing mid-utterance, before the transcript settles. */
export type LiveLine = { role: "user" | "assistant"; text: string } | null;

/* ---------------- level metering ---------------- */

/**
 * Real levels off the two audio streams. The bars are driven from this, not
 * from a timer — a fake waveform that keeps dancing while the room is silent
 * is worse than no waveform, because it stops meaning anything.
 */
export class VoiceMeter {
  private audio: AudioContext | null = null;
  private input: AnalyserNode | null = null;
  private output: AnalyserNode | null = null;
  // Initialised rather than nulled so its type stays pinned to a plain
  // ArrayBuffer, which is what getByteFrequencyData wants.
  private bins = new Uint8Array(0);

  private ensure(): AudioContext | null {
    if (this.audio) return this.audio;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    this.audio = new Ctor();
    return this.audio;
  }

  attach(kind: "input" | "output", stream: MediaStream): void {
    const audio = this.ensure();
    if (!audio) return;
    let node: AnalyserNode;
    try {
      node = audio.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.7;
      audio.createMediaStreamSource(stream).connect(node);
    } catch {
      return;
    }
    // Deliberately not connected to the destination: the <audio> element is
    // already playing the reply, and a second path would double it.
    if (kind === "input") this.input = node;
    else this.output = node;
    if (this.bins.length !== node.frequencyBinCount) {
      this.bins = new Uint8Array(node.frequencyBinCount);
    }
    void audio.resume().catch(() => {});
  }

  /**
   * `count` band energies, 0..1, lowest frequency first. Speech lives under
   * about 4 kHz, so only the bottom of the spectrum is worth looking at.
   */
  bands(kind: "input" | "output", count: number): number[] {
    const node = kind === "input" ? this.input : this.output;
    const bins = this.bins;
    const out = new Array<number>(count).fill(0);
    if (!node || bins.length === 0) return out;
    node.getByteFrequencyData(bins);

    const usable = Math.min(bins.length, 32);
    const per = Math.max(1, Math.floor(usable / count));
    for (let band = 0; band < count; band++) {
      let sum = 0;
      const from = band * per;
      const to = Math.min(usable, from + per);
      for (let i = from; i < to; i++) sum += bins[i];
      const mean = to > from ? sum / (to - from) / 255 : 0;
      // Ears are logarithmic and so is a useful meter: lift the quiet end so
      // ordinary speech fills the bars instead of sitting near the floor.
      out[band] = Math.min(1, Math.pow(mean, 0.62) * 1.35);
    }
    return out;
  }

  close(): void {
    this.input = null;
    this.output = null;
    this.bins = new Uint8Array(0);
    const audio = this.audio;
    this.audio = null;
    if (audio) void audio.close().catch(() => {});
  }
}

/* ---------------- faults ---------------- */

const FAULTS: Record<VoiceFaultKind, string> = {
  permission:
    "Courtime can't hear you — microphone access is blocked. Allow it for this site in your browser settings, then start again.",
  "no-mic": "No microphone available. Plug one in or free it up from whatever's using it, then start again.",
  insecure:
    "Voice needs a secure connection. Open Courtime over https (or on localhost) to talk to Tempo.",
  unsupported: "This browser can't capture audio. Chrome, Edge and Safari all can.",
  mint: "Couldn't start the voice session.",
  dropped: "The voice connection dropped. Start again to pick up where you left off.",
  unknown: "Voice didn't start.",
};

function fault(kind: VoiceFaultKind, message?: string): VoiceFault {
  return {
    kind,
    message: message || FAULTS[kind],
    retry: kind !== "insecure" && kind !== "unsupported",
  };
}

function micFault(error: unknown): VoiceFault {
  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return fault("permission");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return fault("no-mic");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return fault("no-mic", "Your microphone is busy in another app. Close it and start again.");
  }
  if (name === "OverconstrainedError") {
    return fault("no-mic", "That microphone can't be used. Pick another input device and start again.");
  }
  return fault("unknown", error instanceof Error ? error.message : undefined);
}

/** Filler the transcriber hears in a noisy clubhouse; not worth a turn. */
function isNoise(raw: string): boolean {
  const text = raw.trim();
  if (!text) return true;
  if (/^[\s.,?!\-—…"']+$/.test(text)) return true;
  return /^(uh+|um+|hmm+|mm+|hm+|er+|ah+|oh+|huh+|eh+)[\s.,?!\-—…]*$/i.test(text);
}

/* ---------------- the session ---------------- */

type VoiceOptions = {
  /** Where finished transcripts land — the same thread the text agent uses. */
  onUserSaid: (text: string) => void;
  onTempoSaid: (text: string) => void;
  /** A write tool ran, so the panel can post its "Schedule updated" note. */
  onChanged: () => void;
  /** The thread so far, so a call picks up what was already typed. */
  history: () => { role: "user" | "assistant"; content: string }[];
  audioRef: RefObject<HTMLAudioElement>;
};

export function useVoiceSession(options: VoiceOptions) {
  const mint = useAction(api.realtime.session);
  const invokeTool = useAction(api.agent.invokeTool);

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [voiceFault, setVoiceFault] = useState<VoiceFault | null>(null);
  const [live, setLive] = useState<LiveLine>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const meterRef = useRef<VoiceMeter | null>(null);
  if (!meterRef.current) meterRef.current = new VoiceMeter();
  const meter = meterRef.current;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // One counter guards every async continuation: anything that comes back for
  // a call the operator has already hung up on is dropped on the floor.
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const responseInFlightRef = useRef(false);
  const speakingRef = useRef(false);
  const pendingToolsRef = useRef(0);
  const responseQueuedRef = useRef(false);

  const teardown = useCallback(() => {
    const dc = dcRef.current;
    const pc = pcRef.current;
    const stream = streamRef.current;

    if (dc) {
      try {
        dc.close();
      } catch {
        /* already gone */
      }
    }
    if (pc) {
      try {
        pc.onconnectionstatechange = null;
        pc.ontrack = null;
        pc.getSenders().forEach((sender) => sender.track?.stop());
        pc.getReceivers().forEach((receiver) => receiver.track?.stop());
        pc.close();
      } catch {
        /* already gone */
      }
    }
    stream?.getTracks().forEach((track) => track.stop());

    const audio = optionsRef.current.audioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    meter.close();

    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    responseInFlightRef.current = false;
    speakingRef.current = false;
    pendingToolsRef.current = 0;
    responseQueuedRef.current = false;
    startingRef.current = false;
    setStatus("idle");
    setLive(null);
  }, [meter]);

  const send = useCallback((payload: unknown) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return false;
    try {
      dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Ask for a reply, but never while one is already running or tools are out. */
  const requestResponse = useCallback(() => {
    if (responseInFlightRef.current || pendingToolsRef.current > 0) {
      responseQueuedRef.current = true;
      return;
    }
    if (send({ type: "response.create" })) responseQueuedRef.current = false;
    else responseQueuedRef.current = true;
  }, [send]);

  const handleToolCall = useCallback(
    async (callId: string, name: string, rawArgs: string) => {
      pendingToolsRef.current += 1;
      setStatus("thinking");
      const generation = generationRef.current;
      try {
        const outcome = await invokeTool({
          name,
          args: rawArgs || "{}",
          todayIso: todayIso(),
        });
        if (generation !== generationRef.current) return;
        if (outcome.changed) optionsRef.current.onChanged();
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: outcome.output,
          },
        });
      } catch (error) {
        if (generation !== generationRef.current) return;
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              error: error instanceof Error ? error.message : "That tool failed.",
            }),
          },
        });
      } finally {
        if (generation === generationRef.current) {
          pendingToolsRef.current = Math.max(0, pendingToolsRef.current - 1);
          responseQueuedRef.current = true;
          window.setTimeout(() => {
            if (generation === generationRef.current) requestResponse();
          }, 60);
        }
      }
    },
    [invokeTool, requestResponse, send],
  );

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type ?? "");

      switch (type) {
        case "session.created":
          // The line opens silent. Tempo answers, it doesn't greet — being
          // spoken at the moment a call connects is startling, and the panel
          // already says the microphone is live.
          setStatus("listening");
          break;
        case "conversation.item.input_audio_transcription.delta": {
          const delta = String(event.delta ?? "");
          if (delta) {
            setLive((prev) =>
              prev && prev.role === "user"
                ? { role: "user", text: prev.text + delta }
                : { role: "user", text: delta },
            );
          }
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          const text = String(event.transcript ?? "").trim();
          setLive(null);
          if (!isNoise(text)) optionsRef.current.onUserSaid(text);
          break;
        }
        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta": {
          const delta = String(event.delta ?? "");
          if (delta) {
            setLive((prev) =>
              prev && prev.role === "assistant"
                ? { role: "assistant", text: prev.text + delta }
                : { role: "assistant", text: delta },
            );
          }
          break;
        }
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done": {
          const text = String(event.transcript ?? "").trim();
          setLive(null);
          if (text) optionsRef.current.onTempoSaid(text);
          break;
        }
        case "response.function_call_arguments.done": {
          void handleToolCall(
            String(event.call_id ?? ""),
            String(event.name ?? ""),
            String(event.arguments ?? "{}"),
          );
          break;
        }
        case "input_audio_buffer.speech_started":
          if (!speakingRef.current) setStatus("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          if (!speakingRef.current) setStatus("thinking");
          break;
        case "response.created":
          responseInFlightRef.current = true;
          if (!speakingRef.current) setStatus("thinking");
          break;
        case "response.audio.delta":
        case "response.output_audio.delta":
        case "output_audio_buffer.started":
          speakingRef.current = true;
          setStatus("speaking");
          break;
        case "output_audio_buffer.stopped":
          speakingRef.current = false;
          if (!responseInFlightRef.current) setStatus("listening");
          break;
        case "response.done": {
          responseInFlightRef.current = false;
          speakingRef.current = false;
          if (responseQueuedRef.current && pendingToolsRef.current === 0) {
            window.setTimeout(() => requestResponse(), 30);
          } else {
            setStatus("listening");
          }
          break;
        }
        case "error": {
          const detail = event.error as { message?: string; code?: string } | undefined;
          const message = detail?.message ?? "";
          // "A response is already running" is normal when a tool result lands
          // mid-turn; queue instead of surfacing it as a failure.
          if (
            detail?.code === "response_already_in_progress" ||
            /already.*(active|in[_-]?progress)/i.test(message)
          ) {
            responseQueuedRef.current = true;
            break;
          }
          setVoiceFault(fault("dropped", message || undefined));
          teardown();
          break;
        }
        default:
          break;
      }
    },
    [handleToolCall, requestResponse, teardown],
  );

  // The data channel keeps whichever handler it was given when it opened, so
  // route through a ref rather than betting on callback identity staying put.
  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  const stop = useCallback(() => {
    generationRef.current += 1;
    teardown();
  }, [teardown]);

  const start = useCallback(async () => {
    if (startingRef.current || status !== "idle") return;
    startingRef.current = true;
    generationRef.current += 1;
    const generation = generationRef.current;
    setVoiceFault(null);
    setLive(null);
    setStatus("connecting");

    const settle = (problem: VoiceFault) => {
      if (generation !== generationRef.current) return;
      teardown();
      setVoiceFault(problem);
    };

    // getUserMedia simply isn't there on an insecure origin, so name that case
    // before it looks like a browser problem.
    if (typeof window === "undefined" || !window.isSecureContext) {
      settle(fault("insecure"));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      settle(fault("unsupported"));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      settle(micFault(error));
      return;
    }
    if (generation !== generationRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;

    const priorTurns = optionsRef.current.history();

    let secret: string;
    try {
      const minted = await mint({
        todayIso: todayIso(),
        history: priorTurns.slice(-6).map((turn) => ({
          role: turn.role,
          content: turn.content.slice(0, 400),
        })),
      });
      if (generation !== generationRef.current) {
        teardown();
        return;
      }
      if (!minted.ok) {
        settle(fault("mint", minted.error));
        return;
      }
      secret = minted.clientSecret;
    } catch (error) {
      settle(fault("mint", error instanceof Error ? error.message : undefined));
      return;
    }

    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      meter.attach("input", stream);

      pc.ontrack = (trackEvent) => {
        const remote = trackEvent.streams[0];
        if (!remote) return;
        const audio = optionsRef.current.audioRef.current;
        if (audio) {
          audio.srcObject = remote;
          void audio.play().catch(() => {});
        }
        meter.attach("output", remote);
      };

      pc.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          generationRef.current += 1;
          teardown();
          setVoiceFault(fault("dropped"));
        }
      };

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (message) => {
        if (generation !== generationRef.current) return;
        try {
          handleEventRef.current(JSON.parse(message.data));
        } catch {
          /* malformed event; nothing useful to do with it */
        }
      };
      dc.onopen = () => {
        if (generation !== generationRef.current) return;
        setStatus("listening");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (generation !== generationRef.current) {
        teardown();
        return;
      }
      if (!answer.ok) {
        const text = await answer.text();
        settle(fault("mint", `Voice couldn't connect (${answer.status}). ${text.slice(0, 120)}`));
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      if (generation !== generationRef.current) teardown();
    } catch (error) {
      settle(fault("dropped", error instanceof Error ? error.message : undefined));
    } finally {
      if (generation === generationRef.current) startingRef.current = false;
    }
  }, [meter, mint, status, teardown]);

  /** Typing during a call goes to the same brain, so the thread stays one thread. */
  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      const ok = send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });
      if (ok) requestResponse();
      return ok;
    },
    [requestResponse, send],
  );

  useEffect(
    () => () => {
      generationRef.current += 1;
      teardown();
    },
    [teardown],
  );

  return {
    status,
    fault: voiceFault,
    live,
    meter,
    start,
    stop,
    say,
    clearFault: useCallback(() => setVoiceFault(null), []),
    active: status !== "idle",
  };
}
