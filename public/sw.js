// ============================================================
//  Service worker — Web Push delivery for SchoolPaperGen
//
//  Registered from lib/push-client.ts. A `push` event turns the
//  payload built by lib/notifications.ts (buildPushPayload) into a
//  system notification, unless a visible tab is already open — that
//  tab polls /api/notifications and shows a toast, and we would be
//  telling the user the same thing twice.
// ============================================================

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event || !event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "SchoolPaperGen", body: event.data.text(), url: "/dashboard" };
  }

  const title = payload.title || "SchoolPaperGen";
  const options = {
    body: payload.body || "",
    tag: payload.tag || "schoolpapergen",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/dashboard" },
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const visible = clientList.some((client) => client.visibilityState === "visible");
        if (visible) return undefined;
        return self.registration.showNotification(title, options);
      })
      .catch(() => self.registration.showNotification(title, options))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) return client.navigate(target);
            return undefined;
          }
        }
        return self.clients.openWindow(target);
      })
  );
});

// A page can ask for a local notification (used by "send test").
self.addEventListener("message", (event) => {
  const data = event && event.data;
  if (!data || data.type !== "show-notification") return;
  self.registration.showNotification(data.title || "SchoolPaperGen", {
    body: data.body || "",
    tag: data.tag || "schoolpapergen-test",
    icon: "/icons/icon-192.png",
    data: { url: data.url || "/dashboard" },
  });
});
