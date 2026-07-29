import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Tempo } from "./Tempo";
import { cleanError } from "../ui";
import { todayIso } from "../lib/time";
import "./agent.css";

type Message =
  | { role: "user" | "assistant"; content: string }
  | { role: "error"; content: string }
  | { role: "note"; content: string };

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

  const onCoachSide = location.pathname.startsWith("/me");

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!availability?.signedIn || !availability.pro) return null;

  const canWrite = availability.canWrite;
  const suggestions = canWrite ? DESK_SUGGESTIONS : COACH_SUGGESTIONS;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const history = messages.filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant",
    );
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
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

  return (
    <>
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
            <Tempo size={34} state={busy ? "thinking" : "idle"} />
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
              onClick={() => setOpen(false)}
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

          <div className="agent-composer">
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder={
                canWrite ? "Ask, or tell me what to change…" : "Ask about your schedule…"
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
