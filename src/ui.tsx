import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initialsOf } from "./lib/time";

/* ---------------- toasts ---------------- */

type Toast = { id: number; message: string; kind: "info" | "error" };

const ToastContext = createContext<{
  notify: (message: string, kind?: "info" | "error") => void;
}>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, kind: "info" | "error" = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, kind === "error" ? 5200 : 3000);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.kind === "error" ? " error" : ""}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).notify;
}

/**
 * Convex surfaces thrown mutation errors with a stack-trace prefix; front desk
 * staff should see the sentence we wrote, not the plumbing.
 */
export function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/Uncaught Error:\s*([^\n]+)/);
  const message = (match ? match[1] : raw).split("\n")[0].trim();
  return message.replace(/\s*at handler.*$/, "") || "Something went wrong";
}

/** Wrap a mutation so failures always surface as a readable toast. */
export function useGuarded() {
  const notify = useToast();
  return useCallback(
    async <T,>(work: () => Promise<T>, success?: string): Promise<T | null> => {
      try {
        const result = await work();
        if (success) notify(success);
        return result;
      } catch (error) {
        notify(cleanError(error), "error");
        return null;
      }
    },
    [notify],
  );
}

/* ---------------- modal ---------------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- small pieces ---------------- */

export function BrandMark({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--accent)" }}
    >
      <rect
        x="1.6"
        y="2.6"
        width="16.8"
        height="14.8"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M10 2.6v14.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.1 10h9.8" stroke="currentColor" strokeWidth="1.5" opacity="0.42" />
    </svg>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span className="avatar" style={{ background: color }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 60,
        color: "var(--muted)",
        fontSize: 13,
      }}
    >
      <span className="spinner" />
      {label}
    </div>
  );
}

export function LockedFeature({
  title,
  description,
  onUpgrade,
}: {
  title: string;
  description: string;
  onUpgrade?: () => void;
}) {
  return (
    <div className="locked">
      <span className="tag">Pro</span>
      <div className="lock-copy">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      {onUpgrade ? (
        <button className="btn sm" onClick={onUpgrade}>
          See plans
        </button>
      ) : null}
    </div>
  );
}
