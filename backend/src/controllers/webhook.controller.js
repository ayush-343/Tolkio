import crypto from "crypto";
import User from "../models/User.js";
import { streamClient, sendMessageAsUser } from "../lib/stream.js";
import webpush from "web-push";

// Configure VAPID details (same as user.controller.js — shared config)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:ayushsrivastavamail@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Verify Stream webhook signature using HMAC-SHA256.
 * Stream signs the raw body with your API secret.
 * @param {Buffer} rawBody - The raw request body
 * @param {string} signature - The x-signature header value
 * @returns {boolean}
 */
function verifyStreamSignature(rawBody, signature) {
  const apiSecret = process.env.STREAM_API_SECRET;
  if (!apiSecret || !signature) return false;

  const hmac = crypto.createHmac("sha256", apiSecret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Handle Stream Chat webhook events.
 * Called by Stream when a new message is sent in any channel.
 * Sends web push notifications to all channel members except the sender.
 *
 * POST /api/chat/webhook
 * No auth required — verified via Stream signature.
 */
export async function handleStreamWebhook(req, res) {
  try {
    // 1. Verify webhook signature
    const signature = req.headers["x-signature"];
    const rawBody = req.rawBody; // Set by express.raw() middleware

    if (!rawBody || !verifyStreamSignature(rawBody, signature)) {
      console.warn("Stream webhook: invalid signature");
      return res.status(401).json({ message: "Invalid webhook signature" });
    }

    // 2. Parse the payload
    const payload = JSON.parse(rawBody.toString("utf-8"));
    const { type } = payload;

    // 3. Only process new message events
    if (type !== "message.new") {
      // Acknowledge other events without processing
      return res.status(200).json({ status: "ok" });
    }

    const { message, user: senderUser, channel } = payload;

    // Skip system messages, call status messages, or empty messages
    if (!message || !message.text || message.call_status) {
      return res.status(200).json({ status: "ok" });
    }

    const senderId = senderUser?.id;
    const senderName = senderUser?.name || senderUser?.id || "Someone";
    const channelId = channel?.id;
    const channelType = channel?.type || "messaging";

    if (!senderId || !channelId) {
      return res.status(200).json({ status: "ok" });
    }

    // 4. Get all channel members except the sender
    const members = channel?.members || [];
    const recipientIds = members
      .map((m) => m.user_id || m.user?.id)
      .filter((id) => id && id !== senderId);

    if (recipientIds.length === 0) {
      return res.status(200).json({ status: "ok" });
    }

    // 5. Look up recipients' push subscriptions from MongoDB
    const recipients = await User.find({
      _id: { $in: recipientIds },
      "pushSubscriptions.0": { $exists: true }, // Only users with at least one subscription
    }).select("pushSubscriptions");

    if (recipients.length === 0) {
      return res.status(200).json({ status: "ok", message: "No subscriptions" });
    }

    // 6. Truncate message text for notification body
    const maxBodyLength = 100;
    const bodyText =
      message.text.length > maxBodyLength
        ? message.text.substring(0, maxBodyLength) + "…"
        : message.text;

    // 7. Build notification payload
    const notificationPayload = JSON.stringify({
      title: senderName,
      body: bodyText,
      type: "chat_message",
      data: {
        channelId,
        channelType,
        senderUserId: senderId,
        senderName,
      },
    });

    // 8. Send push notifications to all recipients
    const sendPromises = [];

    for (const recipient of recipients) {
      for (const sub of recipient.pushSubscriptions) {
        sendPromises.push(
          (async () => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.keys.p256dh,
                    auth: sub.keys.auth,
                  },
                },
                notificationPayload
              );
            } catch (err) {
              // If 410 (Gone) or 404 (Not Found), remove stale subscription
              if (err.statusCode === 410 || err.statusCode === 404) {
                await User.findByIdAndUpdate(recipient._id, {
                  $pull: { pushSubscriptions: { endpoint: sub.endpoint } },
                });
                console.log(
                  `Removed stale push subscription for user ${recipient._id}`
                );
              } else {
                console.error(
                  "Failed to send chat push notification:",
                  sub.endpoint,
                  err.statusCode || err.message
                );
              }
            }
          })()
        );
      }
    }

    await Promise.all(sendPromises);

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error in handleStreamWebhook:", error.message);
    // Always return 200 to Stream so it doesn't retry endlessly
    res.status(200).json({ status: "error", message: error.message });
  }
}

/**
 * Reply to a message from a push notification.
 * The service worker sends the reply text + channel ID here.
 * We use the Stream server-side SDK to send the message on behalf of the authenticated user.
 *
 * POST /api/chat/reply
 * Requires auth (protectRoute middleware).
 */
export async function replyToMessage(req, res) {
  try {
    const { channelId, text } = req.body;

    if (!channelId || typeof channelId !== "string") {
      return res.status(400).json({ message: "channelId is required" });
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    // Sanitize: limit reply length
    const sanitizedText = text.trim().substring(0, 2000);

    const userId = req.user.id;

    // Send the message via Stream server-side SDK
    const response = await sendMessageAsUser(
      "messaging",
      channelId,
      userId,
      sanitizedText
    );

    res.status(200).json({
      message: "Reply sent successfully",
      messageId: response?.message?.id,
    });
  } catch (error) {
    console.error("Error in replyToMessage:", error.message);
    res.status(500).json({ message: "Failed to send reply" });
  }
}
