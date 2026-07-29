import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Tempo, type TempoState } from "./Tempo";
import { VoiceBars } from "./VoiceBars";
import { useVoiceSession, type VoiceStatus } from "./voice";
import { cleanError } from "../ui";
import { isBareKey, isTypingTarget } from "../desk/shortcuts";
import { todayIso } from "../lib/time";
import "./agent.css";

type Message =
  | { role: "user" | "assistant"; content: string }
  | { role: "error"; content: string }
  | { role: "note"; content: string };

type Turn = { role: "user" | "assistant"; content: string };

const DESK_SUGGESTIONS = [
  "Who's free on Thursday at 4?",
  "Book a private for J. Miller with Danny tomorrow at 9am",
  "How many hours did each coach teach this week?",
];

const COACH_SUGGESTIONS = [
  "What's on my schedule tomorrow?",
  "When am I free on Friday?",
  "How many hours am I teaching this week?",
];

/* Tempo never speaks first, so the panel has to be the thing that says the line
   is open — otherwise a connected call and a dead one look identical. */
const CALL_STATE: Record<VoiceStatus, { title: string; hint: string }> = {
  idle: { title: "", hint: "" },
  connecting: { title: "Opening the line", hint: "One second" },
  listening: { title: "Go ahead — I'm listening", hint: "Just talk, no need to press anything" },
  thinking: { title: "Working on it", hint: "One moment" },
  speaking: { title: "Tempo is speaking", hint: "Talk over it to cut in" },
};

/** One microphone, drawn once — the dock, the header and the composer share it. */
function MicGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="5.6"
        y="1.6"
        width="4.8"
        height="8"
        rx="2.4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3.2 7.4a4.8 4.8 0 0 0 9.6 0M8 12.2v2.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AgentDock() {
  const availability = useQuery(api.agent.availability);
  const chat = useAction(api.agent.chat);
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // The voice session reads the thread as it stands when a call starts, so a
  // typed exchange carries into the call instead of starting a second one.
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const onCoachSide = location.pathname.startsWith("/me");

  const push = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const voice = useVoiceSession({
    onUserSaid: useCallback(
      (text: string) => push({ role: "user", content: text }),
      [push],
    ),
    onTempoSaid: useCallback(
      (text: string) => push({ role: "assistant", content: text }),
      [push],
    ),
    onChanged: useCallback(
      () => push({ role: "note", content: "Schedule updated" }),
      [push],
    ),
    history: useCallback(
      (): Turn[] =>
        messagesRef.current.filter(
          (m): m is Turn => m.role === "user" || m.role === "assistant",
        ),
      [],
    ),
    audioRef,
  });

  const { stop: stopVoice } = voice;

  // The shortcut handler is registered once; it reads the live session through
  // this rather than re-binding the listener on every status change.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const canTalk = Boolean(availability?.pro && availability.voice);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, busy, open, voice.live]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /** Open the panel and put the microphone straight on the line. */
  const startCall = useCallback(() => {
    setOpen(true);
    if (!voiceRef.current.active) void voiceRef.current.start();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        stopVoice();
        setOpen(false);
        return;
      }

      // A and V reach Tempo from anywhere in the app, in the same bare-letter
      // idiom as the desk's own shortcuts, and stay silent while anyone types.
      if (isTypingTarget(event.target)) return;
      if (isBareKey(event, "a") && !open) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (isBareKey(event, "v") && canTalk) {
        event.preventDefault();
        startCall();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stopVoice, startCall, canTalk]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    // A live call owns the conversation: typing goes into it rather than
    // starting a second, deaf assistant alongside it.
    if (voice.active && voice.say(trimmed)) {
      push({ role: "user", content: trimmed });
      setDraft("");
      return;
    }

    const history = messagesRef.current.filter(
      (m): m is Turn => m.role === "user" || m.role === "assistant",
    );
    setMessages([...messagesRef.current, { role: "user", content: trimmed }]);
    setDraft("");
    setBusy(true);

    try {
      const result = await chat({
        messages: [...history, { role: "user" as const, content: trimmed }],
        todayIso: todayIso(),
      });
      setMessages((prev) => {
        const out: Message[] = [...prev];
        if (result.error) {
          out.push({ role: "error", content: result.error });
        } else {
          if (result.changed) {
            out.push({ role: "note", content: "Schedule updated" });
          }
          out.push({ role: "assistant", content: result.reply });
        }
        return out;
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: cleanError(error) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!availability?.signedIn || !availability.pro) return null;

  const canWrite = availability.canWrite;
  const suggestions = canWrite ? DESK_SUGGESTIONS : COACH_SUGGESTIONS;
  const call = CALL_STATE[voice.status];
  const showVoice = voice.active || voice.fault !== null;

  const tempoState: TempoState =
    voice.status === "speaking"
      ? "speaking"
      : voice.status === "listening"
        ? "listening"
        : busy || voice.status === "thinking" || voice.status === "connecting"
          ? "thinking"
          : "idle";

  return (
    <>
      {/* Tempo's own voice comes out here; it lives outside the panel so a
          stray re-render can't cut the audio mid-sentence. */}
      <audio ref={audioRef} autoPlay playsInline className="agent-voice-audio" />

      {/* Two doors into the same room: type, or talk. The microphone is its own
          button rather than something you find after opening the panel. */}
      <div className={`agent-dock${open ? " is-open" : ""}${onCoachSide ? " above-tabs" : ""}`}>
        <button
          className="agent-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open Tempo, the Courtime assistant"
          title="Ask Tempo  ·  A"
        >
          <Tempo size={30} state={voice.active ? tempoState : "idle"} />
          Ask Tempo
        </button>
        {availability.voice ? (
          <button
            className={`agent-dock-mic${voice.active ? " is-live" : ""}`}
            onClick={startCall}
            aria-label="Talk to Tempo"
            title="Talk to Tempo  ·  V"
          >
            <MicGlyph />
            {voice.active ? <span className="dock-live-dot" aria-hidden="true" /> : null}
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          className={`agent-panel${onCoachSide ? " above-tabs" : ""}${voice.active ? " is-calling" : ""}`}
          role="dialog"
          aria-label="Tempo assistant"
        >
          <div className="agent-head">
            <Tempo size={34} state={tempoState} />
            <span className="who">
              <strong>Tempo</strong>
              <span className="role">
                {voice.active
                  ? "On a call"
                  : canWrite
                    ? "Reads and changes the schedule"
                    : "Reads your schedule"}
              </span>
            </span>

            {availability.voice && !voice.active ? (
              <button
                className="agent-talk"
                onClick={() => void voice.start()}
                title="Talk to Tempo  ·  V"
              >
                <MicGlyph />
                Talk
              </button>
            ) : null}
            {messages.length ? (
              <button
                className="agent-icon-btn"
                onClick={() => setMessages([])}
                title="Clear the conversation"
                aria-label="Clear the conversation"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 4.5h10M6.5 4.5V3.2h3v1.3M4.5 4.5l.6 8.1h5.8l.6-8.1"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            <button
              className="agent-icon-btn"
              onClick={() => {
                stopVoice();
                setOpen(false);
              }}
              title="Close  ·  Esc"
              aria-label="Close the assistant"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="agent-log" ref={logRef}>
            {messages.length === 0 ? (
              <div className="agent-empty">
                <Tempo size={54} state="happy" />
                <h4>
                  {availability.firstName
                    ? `Hi ${availability.firstName}.`
                    : "Hi."}
                </h4>
                <p>
                  {canWrite
                    ? "Ask about any day, or tell me to book, move or cancel something."
                    : "Ask about your hours — I can read the book, but only the front desk can change it."}
                </p>
                <div className="agent-suggestions">
                  {suggestions.map((text) => (
                    <button key={text} onClick={() => void send(text)}>
                      {text}
                    </button>
                  ))}
                </div>
                {availability.voice ? (
                  <p className="agent-empty-voice">
                    Or press <kbd>V</kbd> and say it out loud.
                  </p>
                ) : null}
              </div>
            ) : (
              messages.map((message, index) => {
                if (message.role === "note") {
                  return (
                    <span className="agent-msg note" key={index}>
                      ✓ {message.content}
                    </span>
                  );
                }
                return (
                  <div className={`agent-msg ${message.role}`} key={index}>
                    {message.content}
                  </div>
                );
              })
            )}

            {busy ? (
              <span className="agent-typing" aria-label="Tempo is thinking">
                <i />
                <i />
                <i />
              </span>
            ) : null}
          </div>

          {showVoice ? (
            <div
              className={`agent-voice${voice.fault ? " has-fault" : ""}`}
              role="status"
              aria-live="polite"
            >
              {voice.fault ? (
                <>
                  <p className="voice-fault">{voice.fault.message}</p>
                  <div className="voice-row">
                    <span className="voice-status" />
                    {voice.fault.retry ? (
                      <button
                        className="btn sm"
                        onClick={() => void voice.start()}
                      >
                        Try again
                      </button>
                    ) : null}
                    <button className="btn ghost sm" onClick={voice.clearFault}>
                      Dismiss
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="voice-row">
                    <VoiceBars meter={voice.meter} status={voice.status} />
                    <span className="voice-status">
                      <b>{call.title}</b>
                      {call.hint}
                    </span>
                    <button className="btn danger sm" onClick={stopVoice}>
                      End
                    </button>
                  </div>
                  {voice.live ? (
                    <p
                      className={`voice-live${voice.live.role === "assistant" ? " tempo" : ""}`}
                    >
                      {voice.live.text}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <div className="agent-composer">
            {availability.voice ? (
              <button
                className={`agent-mic${voice.active ? " is-live" : ""}`}
                onClick={() => (voice.active ? stopVoice() : void voice.start())}
                disabled={busy}
                aria-pressed={voice.active}
                aria-label={voice.active ? "Stop talking to Tempo" : "Talk to Tempo"}
                title={voice.active ? "End the call" : "Talk to Tempo"}
              >
                {voice.active ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="currentColor" />
                  </svg>
                ) : (
                  <MicGlyph />
                )}
              </button>
            ) : null}
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder={
                voice.active
                  ? "On a call — or type instead…"
                  : canWrite
                    ? "Ask, or tell me what to change…"
                    : "Ask about your schedule…"
              }
              onChange={(event) => {
                setDraft(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 110)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button
              className="agent-send"
              onClick={() => void send(draft)}
              disabled={busy || !draft.trim()}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 8h11M8.5 3.5 13 8l-4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
