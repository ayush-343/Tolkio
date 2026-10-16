import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { WebhookReceipt } from './models.js';
import { processNextNotification } from './service.js';
import webpush from 'web-push';
let stopped = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopped = true; });
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
await connectDB();
await WebhookReceipt.init();
while (!stopped) {
  try { if (!await processNextNotification()) await new Promise(resolve => setTimeout(resolve, 1000)); }
  catch { console.error('Notification worker temporarily unavailable.'); await new Promise(resolve => setTimeout(resolve, 1000)); }
}
await mongoose.disconnect();
