// Service Worker for Talkio Push Notifications
// Handles both call notifications and chat message notifications with inline reply

// Take control of all pages immediately (important for iOS PWA)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push Event Handler ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, data, type } = payload;

    // ── Chat Message Notification ──
    if (type === "chat_message") {
      const channelId = data?.channelId;
      const senderUserId = data?.senderUserId;

      const options = {
        body: body || "You have a new message.",
        icon: "/icon-512.png",
        badge: "/icon-512.png",
        // Group messages from same chat — new message replaces old notification
        tag: `talkio-chat-${channelId || "unknown"}`,
        renotify: true,
        // Chat messages auto-dismiss (unlike calls which require interaction)
        requireInteraction: false,
        data: {
          type: "chat_message",
          channelId,
          senderUserId,
          senderName: data?.senderName || title || "Someone",
          channelType: data?.channelType || "messaging",
        },
        actions: [
          // Inline reply action — shows a text input on supported platforms
          // (Chrome/Edge on desktop and Android)
          { action: "reply", title: "Reply", type: "text", placeholder: "Type a reply..." },
          { action: "open", title: "Open Chat" },
        ],
      };

      event.waitUntil(
        self.registration.showNotification(title || "New Message", options)
      );
      return;
    }

    // ── Call Notification (existing behavior) ──
    const options = {
      body: body || "You have an incoming call.",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: "talkio-call",
      renotify: true,
      requireInteraction: true, // Keep notification active until user interacts
      data: { type: "call", ...(data || {}) },
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

// ─── Notification Click / Action Handler ──────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { action, notification } = event;
  const { data } = notification;
  const notificationType = data?.type;

  // ── Chat Message: Reply Action ──
  if (notificationType === "chat_message" && action === "reply") {
    // The reply text is available in event.reply (Notification API)
    const replyText = event.reply;

    if (replyText && replyText.trim().length > 0) {
      event.waitUntil(
        sendReplyFromServiceWorker(data.channelId, replyText.trim())
      );
    }
    return;
  }

  // ── Chat Message: Open Chat or clicked notification body ──
  if (notificationType === "chat_message") {
    const senderUserId = data?.senderUserId;
    const targetUrl = senderUserId
      ? `${self.location.origin}/chat/${senderUserId}`
      : self.location.origin;

    event.waitUntil(focusOrOpenWindow(targetUrl));
    return;
  }

  // ── Call Notification: Decline ──
  if (action === "close") {
    return;
  }

  // ── Call Notification: Join Call or clicked notification body ──
  const callId = data?.callId;
  const audioOnly = data?.audioOnly ? "true" : "false";
  const callerId = data?.callerId;

  let targetUrl = self.location.origin;
  if (callId && callerId) {
    targetUrl = `${self.location.origin}/chat/${callerId}?joinCallId=${callId}&audioOnly=${audioOnly}`;
  }

  event.waitUntil(focusOrOpenWindow(targetUrl));
});

// ─── Helper: Focus existing Talkio tab or open a new one ──────────
async function focusOrOpenWindow(targetUrl) {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // If there's an existing open tab of Talkio, focus it and navigate
  for (const client of windowClients) {
    if (client.url.startsWith(self.location.origin) && "focus" in client) {
      await client.focus();
      return client.navigate(targetUrl);
    }
  }

  // If no tab is open, open a new one
  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }
}

// ─── Helper: Send reply message from service worker ──────────────
// Uses fetch() to call the backend API directly from the SW context.
// We need to:
// 1. Fetch a CSRF token (required for state-changing requests)
// 2. POST the reply to /api/chat/reply with credentials
async function sendReplyFromServiceWorker(channelId, text) {
  try {
    const baseUrl = self.location.origin;

    // 1. Fetch CSRF token
    const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      credentials: "include",
    });

    if (!csrfResponse.ok) {
      console.error("SW: Failed to fetch CSRF token:", csrfResponse.status);
      return;
    }

    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;

    // 2. Send the reply
    const response = await fetch(`${baseUrl}/api/chat/reply`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ channelId, text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("SW: Failed to send reply:", response.status, errorData);
    } else {
      console.log("SW: Reply sent successfully");

      // Show a brief confirmation notification
      await self.registration.showNotification("Talkio", {
        body: "Reply sent ✓",
        icon: "/icon-512.png",
        tag: "talkio-reply-confirm",
        requireInteraction: false,
        // Auto-close after a short time (silent notification)
      });

      // Close the confirmation notification after 2 seconds
      setTimeout(async () => {
        const notifications = await self.registration.getNotifications({
          tag: "talkio-reply-confirm",
        });
        notifications.forEach((n) => n.close());
      }, 2000);
    }
  } catch (error) {
    console.error("SW: Error sending reply:", error);
  }
}
