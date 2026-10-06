// ============================================================
//  Push client — browser side of web push (lib/notifications.ts)
//
//  Registers /sw.js, asks for permission, subscribes via
//  pushManager and registers the subscription with the server.
//  Never throws: every function reports why it could not proceed
//  so the UI can say "blocked in browser settings" etc.
// ============================================================

const SUBSCRIBE_URL = "/api/notifications/subscribe";

export type PushPermission = NotificationPermission | "unsupported";

export type PushState = {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
};

export type PushActionResult = {
  ok: boolean;
  permission: PushPermission;
  reason?: "unsupported" | "denied" | "no-vapid-key" | "save-failed" | "error";
};

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

/** base64url → Uint8Array (applicationServerKey format). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: Boolean(subscription),
    };
  } catch {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
}

/** Registers the service worker (idempotent). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/**
 * Full opt-in: permission → subscribe → POST to the server.
 * Requires a user gesture to call Notification.requestPermission().
 */
export async function enablePush(): Promise<PushActionResult> {
  if (!isPushSupported()) return { ok: false, permission: "unsupported", reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, permission, reason: permission === "denied" ? "denied" : "error" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) return { ok: false, permission, reason: "no-vapid-key" };

  try {
    const registration = await registerServiceWorker();
    if (!registration) return { ok: false, permission, reason: "error" };
    await navigator.serviceWorker.ready;

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const keys = subscription.toJSON().keys;
    const response = await fetch(SUBSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
        platform: "WEB",
      }),
    });

    if (!response.ok) {
      await subscription.unsubscribe().catch(() => false);
      return { ok: false, permission, reason: "save-failed" };
    }
    return { ok: true, permission };
  } catch {
    return { ok: false, permission, reason: "error" };
  }
}

/** Opt-out: tell the server, then drop the browser subscription. */
export async function disablePush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: true };
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await fetch(SUBSCRIBE_URL, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
      await subscription.unsubscribe().catch(() => false);
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Shows a notification locally through the registered SW — instant,
 * no push service round-trip. Used by the admin "send test" button.
 */
export async function showLocalNotification(input: {
  title: string;
  body?: string;
  url?: string;
}): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await registerServiceWorker();
    const active = registration?.active ?? (await navigator.serviceWorker.ready).active;
    if (!active) return false;
    active.postMessage({
      type: "show-notification",
      title: input.title,
      body: input.body ?? "",
      url: input.url ?? "/dashboard",
    });
    return true;
  } catch {
    return false;
  }
}
