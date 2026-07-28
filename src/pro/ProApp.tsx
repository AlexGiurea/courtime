/// <reference types="vite/client" />
import { useEffect, useMemo } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { registerServiceWorker } from "../lib/push";
import ClubDay from "./ClubDay";
import MyDay from "./MyDay";
import MyWeek from "./MyWeek";
import { ClubIcon, DayIcon, WeekIcon } from "./icons";
import type { ProData } from "./data";
import "./pro.css";

/**
 * The coach's whole app: three read-only screens over the club's live schedule,
 * plus the install/notification plumbing that makes it behave like a phone app.
 */
export default function ProApp() {
  usePwaChrome();
  const session = useQuery(api.app.session, {});

  const pro: ProData | null = useMemo(() => {
    if (!session || !session.authed) return null;
    const { membership, org } = session;
    if (!membership || !org) return null;
    return {
      membershipId: membership._id,
      displayName: membership.displayName,
      orgName: org.name,
      courts: session.courts,
      members: session.members,
    };
  }, [session]);

  if (session === undefined) {
    return (
      <div className="pro-shell">
        <div className="pro-loading">
          <span className="spinner" />
          Opening your schedule…
        </div>
      </div>
    );
  }

  if (!pro) {
    return (
      <div className="pro-shell">
        <header className="pro-head">
          <h1>Courtime</h1>
        </header>
        <div className="card card-pad">
          <h4 className="restricted-title">You're not on a club's staff list yet</h4>
          <p className="restricted-copy">
            Once the front desk adds you, your hours show up here automatically —
            nothing else to set up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pro-shell">
        <Routes>
          <Route path="/" element={<MyDay pro={pro} />} />
          <Route path="week" element={<MyWeek pro={pro} />} />
          <Route path="club" element={<ClubDay pro={pro} />} />
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      </div>

      <nav className="pro-tabs" aria-label="Pro navigation">
        <NavLink to="/me" end className={tabClass}>
          <DayIcon />
          <span>My day</span>
        </NavLink>
        <NavLink to="/me/week" className={tabClass}>
          <WeekIcon />
          <span>My week</span>
        </NavLink>
        <NavLink to="/me/club" className={tabClass}>
          <ClubIcon />
          <span>The club</span>
        </NavLink>
      </nav>
    </>
  );
}

function tabClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "active" : "";
}

/**
 * index.html is shared with the desk app, so the pro side installs its own PWA
 * chrome on mount: manifest, theme colour, iOS standalone hints, and the worker
 * that receives push while the app is closed.
 */
function usePwaChrome(): void {
  useEffect(() => {
    ensureLink("manifest", "/manifest.webmanifest");
    ensureMeta("theme-color", "#0e7a5f");
    // Pre-16.4 iPhones need these to launch full-screen from the home screen.
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-title", "Courtime");
    ensureMeta("apple-mobile-web-app-status-bar-style", "default");
    void registerServiceWorker();
  }, []);
}

function ensureLink(rel: string, href: string): void {
  if (document.querySelector(`link[rel="${rel}"]`)) return;
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
}

function ensureMeta(name: string, content: string): void {
  if (document.querySelector(`meta[name="${name}"]`)) return;
  const meta = document.createElement("meta");
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}
