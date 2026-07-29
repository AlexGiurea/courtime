import { FormEvent, useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { BrandMark, cleanError, useToast } from "../ui";
import { todayIso } from "../lib/time";

const DEMO_PASSWORD = "courtime-demo";

const DEMO_ACCOUNTS = [
  {
    email: "alex@courtime.demo",
    name: "Alex Giurea",
    title: "Front desk — demo club",
    blurb: "The club view: day grid, photo import, settings",
  },
  {
    email: "danny@courtime.demo",
    name: "Danny Whitfield",
    title: "Coach — Danny Whitfield",
    blurb: "The phone view: just his hours, always current",
  },
];

export default function SignIn() {
  const { signIn } = useAuthActions();
  const ensureDemo = useMutation(api.seed.ensureDemo);
  const notify = useToast();

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // The demo club is created on demand and is idempotent, so this is safe to
  // fire on every visit to the sign-in screen.
  useEffect(() => {
    void ensureDemo({ todayIso: todayIso() }).catch(() => {
      /* demo seeding is best-effort; real sign-in still works */
    });
  }, [ensureDemo]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("form");
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: mode,
        ...(mode === "signUp" ? { name: name.trim() } : {}),
      });
    } catch (error) {
      notify(
        mode === "signIn"
          ? "That email and password combination didn't work."
          : cleanError(error),
        "error",
      );
      setBusy(null);
    }
  }

  async function enterDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    if (busy) return;
    setBusy(account.email);
    try {
      await ensureDemo({ todayIso: todayIso() });
    } catch {
      /* the club may already exist — carry on */
    }
    try {
      await signIn("password", {
        email: account.email,
        password: DEMO_PASSWORD,
        flow: "signIn",
      });
    } catch {
      // First visit on a fresh deployment: create the demo login, then the
      // seeded membership is claimed by email on the next load.
      try {
        await signIn("password", {
          email: account.email,
          password: DEMO_PASSWORD,
          flow: "signUp",
          name: account.name,
        });
      } catch (error) {
        notify(cleanError(error), "error");
        setBusy(null);
      }
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <span className="brand" style={{ color: "#fff" }}>
          <BrandMark />
          Courtime
        </span>
        <div>
          <h2>The club's paper schedule book, on every phone.</h2>
          <p>
            The front desk keeps the book. Courtime reads the page, the coaches see
            their own hours on their phones, and everyone stops calling to ask what
            time they're on court.
          </p>
        </div>
        <p style={{ fontSize: 12, color: "#7d8894" }}>
          Built for racquet clubs still running on paper.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{mode === "signIn" ? "Sign in" : "Create your club account"}</h1>
          <p className="sub">
            {mode === "signIn"
              ? "Front desk and coaches use the same sign-in."
              : "You'll set up your courts and coaches next."}
          </p>

          <form className="auth-form" onSubmit={onSubmit}>
            {mode === "signUp" ? (
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Giurea"
                  required
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              {mode === "signUp" ? (
                <span className="hint">At least 8 characters.</span>
              ) : null}
            </div>

            <button className="btn primary lg" type="submit" disabled={busy !== null}>
              {busy === "form" ? <span className="spinner" /> : null}
              {mode === "signIn" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 14 }}>
            {mode === "signIn" ? "New club?" : "Already have an account?"}{" "}
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
            >
              {mode === "signIn" ? "Set one up" : "Sign in"}
            </button>
          </p>

          <div className="divider">or explore the demo club</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                className="demo-btn"
                onClick={() => void enterDemo(account)}
                disabled={busy !== null}
                type="button"
              >
                {busy === account.email ? <span className="spinner" /> : null}
                <span>
                  <strong>{account.title}</strong>
                  <span>{account.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
