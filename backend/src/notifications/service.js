import { randomUUID } from 'node:crypto';
import { WebhookReceipt } from './models.js';
import { streamClient } from '../lib/stream.js';
import { communicationService } from '../communication/service.js';
import User from '../models/User.js';
import webpush from 'web-push';

export async function recordMessageEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Object.assign(new Error('Invalid message event.'), { status: 400 });
  if (payload.type !== 'message.new' || payload.message?.call_status || !payload.message?.text) return;
  const channelId = payload.channel?.id;
  const channelType = payload.channel?.type || 'messaging';
  const messageId = payload.message?.id;
  const senderId = payload.message?.user?.id || payload.user?.id;
  if (typeof channelId !== 'string' || channelId.length > 100 || typeof messageId !== 'string' || messageId.length > 200 || typeof senderId !== 'string' || !/^[a-f0-9]{24}$/.test(senderId) || channelType !== 'messaging') throw Object.assign(new Error('Invalid message event.'), { status: 400 });
  // Stable message identity deduplicates retries even without a provider event ID.
  const key = `message.new:${channelType}:${channelId}:${messageId}`;
  try { await WebhookReceipt.create({ key, channelId, channelType, messageId, senderId }); }
  catch (error) { if (error.code !== 11000) throw error; }
}

export async function deliverMessageNotification(job) {
  let state;
  try { state = await communicationService.authorizeChannel(job.senderId, job.channelId); }
  catch (error) { if (error.status === 404) return; throw error; }
  const response = await streamClient.getMessage(job.messageId);
  const message = response.message;
  if (message?.deleted_at || !message?.text || message.call_status || message.user?.id !== job.senderId || message.cid !== `${job.channelType}:${job.channelId}`) return;
  const ids = state.members.map(member => member.user_id || member.user?.id).filter(id => id !== job.senderId);
  const recipients = await User.find({ _id: { $in: ids } }).select('pushSubscriptions');
  const payload = JSON.stringify({ title: message.user?.name || 'New message', body: message.text.slice(0, 160), data: { type: 'chat_message', notificationId: job.key, channelId: job.channelId, channelType: job.channelType, senderId: job.senderId, senderName: message.user?.name || 'Someone', url: `/chat/${job.senderId}` } });
  for (const recipient of recipients) for (const subscription of recipient.pushSubscriptions || []) {
    try { await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } }, payload, { timeout: 10000 }); }
    catch (error) {
      if ([404, 410].includes(error.statusCode)) await User.updateOne({ _id: recipient._id }, { $pull: { pushSubscriptions: { endpoint: subscription.endpoint } } });
      else throw error;
    }
  }
}

export async function processNextNotification({ deliver = deliverMessageNotification, now = new Date(), owner = randomUUID() } = {}) {
  const job = await WebhookReceipt.findOneAndUpdate({
    expiresAt: { $gt: now },
    $or: [{ status: 'queued', nextRunAt: { $lte: now } }, { status: 'running', leaseUntil: { $lt: now } }],
  }, { $set: { status: 'running', leaseOwner: owner, leaseUntil: new Date(now.getTime() + 60000) }, $inc: { attempts: 1 } }, { sort: { nextRunAt: 1 }, new: true });
  if (!job) return false;
  const guard = { _id: job._id, status: 'running', leaseOwner: owner };
  const renew = setInterval(() => { WebhookReceipt.updateOne(guard, { $set: { leaseUntil: new Date(Date.now() + 60000) } }).catch(() => {}); }, 10000);
  renew.unref();
  try {
    await deliver(job);
    await WebhookReceipt.updateOne(guard, { $set: { status: 'completed' }, $unset: { leaseOwner: 1, leaseUntil: 1, error: 1 } });
  } catch {
    const delay = [1000, 5000, 30000, 120000, 600000][Math.min(job.attempts - 1, 4)];
    await WebhookReceipt.updateOne(guard, { $set: { status: job.attempts >= 6 ? 'failed' : 'queued', nextRunAt: new Date(Date.now() + delay + Math.floor(Math.random() * 500)), error: 'Notification delivery failed; inspect provider availability.' }, $unset: { leaseOwner: 1, leaseUntil: 1 } });
  } finally { clearInterval(renew); }
  return true;
}
