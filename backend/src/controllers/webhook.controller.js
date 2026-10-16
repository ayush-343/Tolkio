import { communicationService } from '../communication/service.js';
import crypto from "crypto";
import { recordMessageEvent } from '../notifications/service.js';

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
  if (!req.rawBody || !verifyStreamSignature(req.rawBody, req.headers['x-signature'])) return res.status(401).json({ message: 'Invalid webhook signature' });
  let payload;
  try { payload = JSON.parse(req.rawBody.toString('utf8')); }
  catch { return res.status(400).json({ message: 'Invalid webhook JSON' }); }
  try {
    await recordMessageEvent(payload);
    return res.status(200).json({ status: 'accepted' });
  } catch (error) {
    return res.status(error.status === 400 ? 400 : 503).json({ message: error.status === 400 ? 'Invalid message event.' : 'Webhook persistence unavailable. Retry delivery.' });
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
export async function replyToMessage(req, res, next) {
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
    const response = await communicationService.reply(userId, channelId, sanitizedText);

    res.status(200).json({
      message: "Reply sent successfully",
      messageId: response?.message?.id,
    });
  } catch (error) {
    next(error);
  }
}
