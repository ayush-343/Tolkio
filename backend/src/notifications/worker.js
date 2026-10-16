import 'dotenv/config';
import { communityModels } from '../communities/models.js';
import { processCommunityJob, reconcileCommunities } from '../communities/worker.js';
import { assertReplicaSet } from '../communities/service.js';
import { circleProvider } from '../communities/provider.js';
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
await Promise.all(communityModels.map(model => model.init()));
if (process.env.COMMUNITY_ENABLED === "true") { await assertReplicaSet(); await circleProvider.verify(); }
let lastReconcile = 0;
while (!stopped) {
  try {
    let work = await processNextNotification();
    if (process.env.COMMUNITY_ENABLED === 'true') {
      if (Date.now() - lastReconcile > 300000) { await reconcileCommunities(); lastReconcile = Date.now(); }
      work = await processCommunityJob() || work;
    }
    if (!work) await new Promise(resolve => setTimeout(resolve,1000));
  }
  catch { console.error('Notification worker temporarily unavailable.'); await new Promise(resolve => setTimeout(resolve, 1000)); }
}
await mongoose.disconnect();
