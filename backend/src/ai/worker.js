import 'dotenv/config';
import mongoose from 'mongoose';
import { AIJob, AIBudget } from './models.js';
import { canBenchmark, serverEnabled } from './catalog.js';
import { inferOnServer } from './provider.js';
import User from '../models/User.js';
let stopped = false;
let active;
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { stopped = true; active?.abort(); });
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
await Promise.all([AIJob.init(), AIBudget.init()]);
while (!stopped) {
  // Never retry inference after an uncertain billed timeout or worker crash.
  await AIJob.updateMany({ status: 'running', startedAt: { $lt: new Date(Date.now() - 120000) } }, { $set: { status: 'failed', error: 'Interrupted request; cost may have been incurred. Retry manually.' }, $unset: { request: 1 } });
  const job = await AIJob.findOneAndUpdate({ status: 'queued', expiresAt: { $gt: new Date() } }, { $set: { status: 'running', startedAt: new Date() } }, { sort: { createdAt: 1 }, new: true });
  if (!job) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
  let timeout;
  try {
    if (!serverEnabled() || !canBenchmark(job.userId) || !await User.exists({ _id: job.userId })) throw new Error('Server access is no longer available.');
    active = new AbortController();
    timeout = setTimeout(() => active?.abort(), 60000);
    const result = await inferOnServer(job.request, job.modelId, active.signal);
    await AIJob.updateOne({ _id: job.id, status: 'running' }, { $set: { status: 'completed', result }, $unset: { request: 1 } });
  } catch {
    await AIJob.updateOne({ _id: job.id, status: 'running' }, { $set: { status: 'failed', error: 'Assistance failed or was interrupted. No automatic retry was made; cost may have been incurred.' }, $unset: { request: 1 } });
  } finally { clearTimeout(timeout); active = null; }
}
await mongoose.disconnect();
