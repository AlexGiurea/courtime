/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  currentPushEndpoint,
  isIos,
  isPushSupported,
  isStandalone,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/push";
import { BellIcon, CloseIcon, ShareIcon } from "./icons";

const DISMISS_KEY = "courtime.pro.alerts-card-dismissed";
const VAPID_PUBLIC_KEY: string =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode with storage off: the card simply comes back next visit.
  }
}

/**
 * The one piece of setup a coach ever does. It has three honest shapes: an
 * iPhone that has to be installed first, a browser that can subscribe right
 * now, and a device that is already on.
 */
export default function NotificationsCard() {
  const pushState = useQuery(api.notifications.myPushState, {});
  const savePushSubscription = useMutation(api.notifications.savePushSubscription);
  const removePushSubscription = useMutation(api.notifications.removePushSubscription);

  const [dismissed, setDismissed] = useState(readDismissed);
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Server state counts every device on the account; this asks the browser in
  // front of the coach, which is the thing the toggle actually controls.
  useEffect(() => {
    let alive = true;
    void currentPushEndpoint().then((endpoint) => {
      if (alive) setDeviceOn(endpoint !== null);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Alerts are blocked for Courtime in this browser. You can allow them again in its site settings."
            : "No problem — you can turn alerts on any time.",
        );
        return;
      }
      const keys = await subscribeToPush(VAPID_PUBLIC_KEY);
      await savePushSubscription(keys);
      setDeviceOn(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong turning alerts on.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await removePushSubscription({ endpoint });
      setDeviceOn(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong turning alerts off.",
      );
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    writeDismissed();
    setDismissed(true);
  }

  // Still asking the browser — say nothing rather than flash the wrong state.
  if (deviceOn === null) return null;

  if (deviceOn) {
    const devices = pushState?.deviceCount ?? 1;
    return (
      <div className="install-note">
        <span className="note-icon">
          <BellIcon />
        </span>
        <div className="grow">
          <h4>Alerts are on</h4>
          <p>
            The desk moves something of yours, your phone tells you
            {devices > 1 ? ` — on ${devices} devices.` : "."}
          </p>
          {message ? <p className="pro-error">{message}</p> : null}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => void disable()}
            disabled={busy}
          >
            Turn off on this device
          </button>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  // iPhone: Notification and PushManager simply don't exist in a Safari tab, so
  // there is nothing to enable until the app lives on the home screen.
  if (isIos() && !isStandalone()) {
    return (
      <div className="install-note">
        <span className="note-icon">
          <ShareIcon />
        </span>
        <div className="grow">
          <h4>Add Courtime to your home screen</h4>
          <p>
            iPhone only allows alerts for apps on the home screen. Takes about ten
            seconds:
          </p>
          <ol className="install-steps">
            <li>Tap the Share button in Safari's toolbar.</li>
            <li>Scroll down and choose “Add to Home Screen”.</li>
            <li>Open Courtime from its icon, then turn alerts on here.</li>
          </ol>
        </div>
        <button
          type="button"
          className="note-dismiss"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  if (!isPushSupported() || !VAPID_PUBLIC_KEY) {
    return (
      <div className="install-note">
        <span className="note-icon">
          <BellIcon />
        </span>
        <div className="grow">
          <h4>Alerts aren't available here</h4>
          <p>
            This browser can't receive them. Your schedule still updates on its own
            while Courtime is open.
          </p>
        </div>
        <button
          type="button"
          className="note-dismiss"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="install-note">
      <span className="note-icon">
        <BellIcon />
      </span>
      <div className="grow">
        <h4>Know the moment something moves</h4>
        <p>
          Get a notification when the desk changes one of your sessions — no need to
          keep checking.
        </p>
        {message ? <p className="pro-error">{message}</p> : null}
        <button
          type="button"
          className="btn primary sm"
          onClick={() => void enable()}
          disabled={busy}
        >
          {busy ? "Turning on…" : "Turn on alerts"}
        </button>
      </div>
      <button
        type="button"
        className="note-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
