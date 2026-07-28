/* Courtime service worker — plain classic worker, no imports.
   Its only job is delivering schedule-change alerts to a coach's phone; the app
   itself is always live over Convex, so nothing here caches or serves content. */

self.addEventListener("install", () => {
  // A new worker should take over immediately — a coach never "reloads" a phone.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  var title = payload.title || "Courtime";
  var body = payload.body || "Your schedule changed.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      // One tag for the whole schedule: a burst of desk edits collapses into a
      // single current alert instead of stacking up on the lock screen.
      tag: "courtime-schedule",
      renotify: true,
      data: { url: "/me" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/me";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i += 1) {
          var client = clientList[i];
          if (new URL(client.url).origin !== self.location.origin) continue;
          if (client.navigate) {
            return client.navigate(target).then(function (navigated) {
              return (navigated || client).focus();
            });
          }
          return client.focus();
        }
        return self.clients.openWindow(target);
      })
      .catch(function () {
        return self.clients.openWindow(target);
      }),
  );
});
