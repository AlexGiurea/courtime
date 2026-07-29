import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Tempo, type TempoState } from "./Tempo";
import { VoiceBars } from "./VoiceBars";
import { useVoiceSession, type VoiceStatus } from "./voice";
import { cleanError } from "../ui";
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

const CALL_STATE: Record<VoiceStatus, { title: string; hint: string }> = {
  idle: { title: "", hint: "" },
  connecting: { title: "Connecting", hint: "Opening the line" },
  listening: { title: "Listening", hint: "Just say it" },
  thinking: { title: "Working on it", hint: "One moment" },
  speaking: { title: "Tempo is speaking", hint: "Talk over it to cut in" },
};

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

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, busy, open, voice.live]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        stopVoice();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stopVoice]);

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

      <button
        className={`agent-launcher${open ? " is-open" : ""}${onCoachSide ? " above-tabs" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Open Tempo, the Courtime assistant"
      >
        <Tempo size={30} state="idle" />
        Ask Tempo
      </button>

      {open ? (
        <div
          className={`agent-panel${onCoachSide ? " above-tabs" : ""}`}
          role="dialog"
          aria-label="Tempo assistant"
        >
          <div className="agent-head">
            <Tempo size={34} state={tempoState} />
            <span className="who">
              <strong>Tempo</strong>
              <span className="role">
                {canWrite
                  ? "Reads and changes the schedule"
                  : "Reads your schedule"}
              </span>
            </span>
            {messages.length ? (
              <button
                className="btn ghost sm"
                onClick={() => setMessages([])}
                title="Start over"
              >
                Clear
              </button>
            ) : null}
            <button
              className="btn ghost sm"
              onClick={() => {
                stopVoice();
                setOpen(false);
              }}
              aria-label="Close the assistant"
            >
              Esc
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
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
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
                )}
              </button>
            ) : null}
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder={
                voice.active
                  ? "Talking — or type, and Tempo answers out loud…"
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
