import { ReactNode, useEffect } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import SignIn from "./screens/SignIn";
import Onboarding from "./screens/Onboarding";
import DeskApp from "./desk/DeskApp";
import ProApp from "./pro/ProApp";
import AgentDock from "./agent/AgentDock";
import { isCoachApp } from "./face";
import { Avatar, BrandMark, Loading } from "./ui";

export type Session = Extract<
  FunctionReturnType<typeof api.app.session>,
  { authed: true }
>;
export type SessionWithClub = Session & {
  membership: NonNullable<Session["membership"]>;
  org: NonNullable<Session["org"]>;
};

export default function App() {
  return (
    <>
      <AuthLoading>
        <Loading label="Starting Courtime" />
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <SignedIn />
      </Authenticated>
    </>
  );
}

function SignedIn() {
  const session = useQuery(api.app.session);
  const bootstrap = useMutation(api.app.bootstrap);

  // Pulls an invited coach into the club that invited them, by email.
  useEffect(() => {
    void bootstrap({});
  }, [bootstrap]);

  if (session === undefined) return <Loading label="Loading your club" />;
  if (!session.authed) return <Loading />;
  if (!session.membership || !session.org) return <Onboarding />;

  const scoped = session as SessionWithClub;
  const deskAllowed = scoped.membership.role !== "pro";

  // On the coach's own deployment there is no desk to route to, and no reason
  // for a coach to carry the club console around in their bundle. Every path
  // lands on their schedule.
  if (isCoachApp()) {
    return (
      <>
        <div className="shell">
          <TopBar session={scoped} />
          <Routes>
            <Route path="/me/*" element={<ProApp />} />
            <Route path="*" element={<Navigate to="/me" replace />} />
          </Routes>
        </div>
        <AgentDock />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/desk/*"
          element={
            deskAllowed ? <DeskApp session={scoped} /> : <Navigate to="/me" replace />
          }
        />
        <Route
          path="/me/*"
          element={
            <div className="shell">
              <TopBar session={scoped} />
              <ProApp />
            </div>
          }
        />
        <Route
          path="*"
          element={<Navigate to={deskAllowed ? "/desk" : "/me"} replace />}
        />
      </Routes>
      <AgentDock />
    </>
  );
}

export function TopBar({
  session,
  children,
}: {
  session: SessionWithClub;
  children?: ReactNode;
}) {
  const { signOut } = useAuthActions();
  const location = useLocation();
  const deskAllowed = session.membership.role !== "pro";
  const onCoachSide = location.pathname.startsWith("/me");

  return (
    <header className="topbar no-print">
      <span className="brand">
        <BrandMark />
        Courtime
      </span>

      {/* The club's navigation stays about the club. A director who also
          coaches reaches their own hours through the view switch, not a tab. */}
      <nav className="topnav">
        {deskAllowed && !onCoachSide ? (
          <>
            <NavLink to="/desk" end className={({ isActive }) => (isActive ? "active" : "")}>
              Schedule
            </NavLink>
            <NavLink
              to="/desk/import"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Import
            </NavLink>
            <NavLink
              to="/desk/insights"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Insights
            </NavLink>
            <NavLink
              to="/desk/settings"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Settings
            </NavLink>
          </>
        ) : null}
      </nav>

      <div className="topbar-right">
        {children}
        {deskAllowed ? (
          <Link className="btn ghost sm view-switch" to={onCoachSide ? "/desk" : "/me"}>
            {onCoachSide ? "Back to the front desk" : "View as coach"}
          </Link>
        ) : null}
        <span className="tag org-tag">{session.org.name}</span>
        <span className="who" title={session.user.email}>
          <Avatar
            name={session.membership.displayName}
            color={session.membership.color}
          />
          <span className="who-name">{session.membership.displayName}</span>
        </span>
        <button className="btn ghost sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
