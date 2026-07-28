/// <reference types="vite/client" />

/**
 * The client half of web push. Convex holds the VAPID private key and fans
 * change alerts out; everything here is about getting this browser a
 * subscription and handing its keys to the server.
 *
 * Push is a courtesy on top of a live-updating app: every failure path here is
 * recoverable and never breaks the schedule itself.
 */

export type PushKeys = { endpoint: string; p256dh: string; auth: string };

const SW_URL = "/sw.js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True once the app is launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // `navigator.standalone` is an old iOS-only flag and isn't in the DOM lib.
  const legacy = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    legacy.standalone === true
  );
}

/** iPhone/iPad, where push exists only for home-screen installs. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ claims to be a Mac; multi-touch gives it away.
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

// The `<ArrayBuffer>` argument matters: a plain `Uint8Array` widens to
// `ArrayBufferLike`, which the DOM's BufferSource won't accept.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return binary ? stripPadding(btoa(binary)) : "";
}

function stripPadding(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    // A worker that won't install costs push, nothing else.
    return null;
  }
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registered = await registerServiceWorker();
  const existing = registered ?? (await navigator.serviceWorker.getRegistration());
  if (!existing) {
    throw new Error("This browser wouldn't install the background worker alerts need.");
  }
  return navigator.serviceWorker.ready;
}

/** The endpoint this device is currently subscribed with, if any. */
export async function currentPushEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribe this device. The caller is responsible for asking permission first
 * (it has to happen inside a user gesture) and for saving the returned keys.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushKeys> {
  if (!isPushSupported()) {
    throw new Error("This browser can't receive push notifications.");
  }
  if (!vapidPublicKey) {
    throw new Error("Push isn't configured for this deployment yet.");
  }

  const registration = await activeRegistration();
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  let subscription = await registration.pushManager.getSubscription();
  // A subscription minted against a different VAPID key can never be delivered
  // to, so replace it instead of handing the server a dead endpoint.
  if (
    subscription &&
    toBase64Url(subscription.options.applicationServerKey) !==
      stripPadding(vapidPublicKey)
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const p256dh = toBase64Url(subscription.getKey("p256dh"));
  const auth = toBase64Url(subscription.getKey("auth"));
  if (!p256dh || !auth) {
    throw new Error("The browser handed back an incomplete subscription.");
  }

  return { endpoint: subscription.endpoint, p256dh, auth };
}

/** Drops this device's subscription and returns the endpoint the server should forget. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
