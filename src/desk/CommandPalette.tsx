import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, formatDateLong, parseDateQuery, todayIso } from "../lib/time";

type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

export default function CommandPalette({
  date,
  onPickDate,
  onClose,
}: {
  date: string;
  onPickDate: (iso: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayIso();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo(() => {
    const out: Command[] = [];
    const parsed = parseDateQuery(query, today);

    if (parsed) {
      out.push({
        id: "jump",
        label: `Go to ${formatDateLong(parsed)}`,
        hint: parsed,
        run: () => {
          onPickDate(parsed);
          onClose();
        },
      });
    }

    const statics: Command[] = [
      {
        id: "today",
        label: "Today",
        hint: "T",
        run: () => {
          onPickDate(today);
          onClose();
        },
      },
      {
        id: "tomorrow",
        label: "Tomorrow",
        run: () => {
          onPickDate(addDays(today, 1));
          onClose();
        },
      },
      {
        id: "next-week",
        label: "This day next week",
        run: () => {
          onPickDate(addDays(date, 7));
          onClose();
        },
      },
      {
        id: "import",
        label: "Import pages from photos",
        run: () => {
          navigate("/desk/import");
          onClose();
        },
      },
      {
        id: "print",
        label: "Print the day sheet",
        hint: "Ctrl P",
        run: () => {
          onClose();
          setTimeout(() => window.print(), 60);
        },
      },
      {
        id: "settings",
        label: "Club settings",
        run: () => {
          navigate("/desk/settings");
          onClose();
        },
      },
      {
        id: "mine",
        label: "Switch to the coach view",
        run: () => {
          navigate("/me");
          onClose();
        },
      },
    ];

    const needle = query.trim().toLowerCase();
    out.push(
      ...statics.filter((command) =>
        needle ? command.label.toLowerCase().includes(needle) : true,
      ),
    );
    return out;
  }, [query, today, date, navigate, onClose, onPickDate]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <input
          ref={inputRef}
          value={query}
          placeholder="Jump to a date — try “nov 12”, “next tuesday”, “12/25”"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((a) => Math.min(a + 1, commands.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              commands[active]?.run();
            }
          }}
        />
        <div className="palette-list">
          {commands.length ? (
            commands.map((command, index) => (
              <button
                key={command.id}
                className="palette-item"
                data-active={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={command.run}
              >
                {command.label}
                {command.hint ? <span className="kbd-hint">{command.hint}</span> : null}
              </button>
            ))
          ) : (
            <p className="empty" style={{ padding: 24 }}>
              No match. Try a date like “aug 14”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
