// Service Worker for Talkio Push Notifications

// Take control of all pages immediately (important for iOS PWA)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, data } = payload;

    const options = {
      body: body || "You have an incoming call.",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: "talkio-call",
      renotify: true,
      requireInteraction: true, // Keep notification active until user interacts
      data: data || {},
      actions: [
        { action: "join", title: "Join Call" },
        { action: "close", title: "Decline" },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(title || "Incoming Call", options)
    );
  } catch (error) {
    // Fallback for non-JSON payloads
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Talkio", {
        body: text || "You have a notification.",
        icon: "/icon-512.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { action, notification } = event;
  const { data } = notification;

  if (action === "close") {
    // Decline call / close notification
    return;
  }

  // Clicked notification or "Join Call" action
  // Focus or open application window
  const callId = data?.callId;
  const audioOnly = data?.audioOnly ? "true" : "false";
  const callerId = data?.callerId;

  // Build the target URL
  let targetUrl = self.location.origin;
  if (callId && callerId) {
    targetUrl = `${self.location.origin}/chat/${callerId}?joinCallId=${callId}&audioOnly=${audioOnly}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If there's an existing open tab of Talkio, focus it and redirect
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // If no tab is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
