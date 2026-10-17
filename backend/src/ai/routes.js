import express from 'express';
import { communityCapabilities } from '../communities/policy.js';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { protectRoute } from '../middleware/auth.middleware.js';
import { catalog, capabilities, canBenchmark, serverEnabled } from './catalog.js';
import { AIJob, AIBudget } from './models.js';
import { validateTask, validateOutput } from '../../../shared/ai/contracts.js';
export const aiRoutes = express.Router();
aiRoutes.use(protectRoute);
aiRoutes.get('/capabilities', (req, res) => res.json({ data: { ...capabilities(req.user.id), community: communityCapabilities(req.user) } }));
aiRoutes.get('/ai/models', (_req, res, next) => { try { res.json({ data: catalog() }); } catch (e) { next(e); } });
aiRoutes.post('/ai/validate-draft', (req, res) => {
  try {
    const output = validateOutput('quiz', JSON.stringify(req.body.output));
    // Validation is not publication. The existing app has no host/circle publication service yet.
    res.json({ data: { output, status: 'unpublished', requiresHostReview: true } });
  } catch (e) { res.status(400).json({ error: { code: 'INVALID_DRAFT', message: e.message } }); }
});
aiRoutes.post('/ai/jobs', rateLimit({ windowMs: 60000, limit: 10 }), async (req, res, next) => {
  let requestKey;
  let requestHash;
  try {
    if (!serverEnabled() || !canBenchmark(req.user.id)) return res.status(403).json({ error: { code: 'AI_DISABLED', message: 'Server assistance is not enabled for this account.' } });
    const request = validateTask(req.body);
    if (request.execution !== 'server' || req.body.serverConsent !== true) return res.status(400).json({ error: { code: 'CONSENT_REQUIRED', message: 'Choose server assistance explicitly.' } });
    requestKey = req.get('Idempotency-Key');
    if (!requestKey || !/^[a-zA-Z0-9-]{8,80}$/.test(requestKey)) return res.status(400).json({ error: { code: 'INVALID_KEY', message: 'A request key is required.' } });
    requestHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
    let job = await AIJob.findOne({ userId: req.user.id, requestKey });
    if (job) {
      if (job.requestHash !== requestHash) return res.status(409).json({ error: { code: 'KEY_CONFLICT', message: 'Request key already used.' } });
      return res.status(202).json({ data: { id: job.id, status: job.status } });
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const day = new Date().toISOString().slice(0, 10);
        for (const [id, limit] of [[`global:${day}`, Number(process.env.AI_DAILY_REQUEST_LIMIT)], [`${req.user.id}:${day}`, 20]]) {
          await AIBudget.updateOne({ _id: id }, { $setOnInsert: { count: 0, expiresAt: new Date(Date.now() + 172800000) } }, { upsert: true, session });
          const reserved = await AIBudget.updateOne({ _id: id, count: { $lt: limit } }, { $inc: { count: 1 } }, { session });
          if (!reserved.modifiedCount) throw Object.assign(new Error('The daily server assistance limit has been reached.'), { status: 429 });
        }
        [job] = await AIJob.create([{ userId: req.user.id, requestKey, requestHash, request, modelId: process.env.AI_SERVER_MODEL }], { session });
      });
    } finally { await session.endSession(); }
    return res.status(202).json({ data: { id: job.id, status: job.status } });
  } catch (e) {
    if (e.code === 11000) {
      try {
        const existing = await AIJob.findOne({ userId: req.user.id, requestKey });
        if (existing && existing.requestHash === requestHash) return res.status(202).json({ data: { id: existing.id, status: existing.status } });
      } catch (lookupError) { return next(lookupError); }
      return res.status(409).json({ error: { code: 'KEY_CONFLICT', message: 'Request key already used.' } });
    }
    if (e.status || /Select|Enter|Unsupported|Choose/.test(e.message)) return res.status(e.status || 400).json({ error: { code: 'AI_REQUEST_REJECTED', message: e.message } });
    next(e);
  }
});
aiRoutes.get('/ai/jobs/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
    const job = await AIJob.findOne({ _id: req.params.id, userId: req.user.id, expiresAt: { $gt: new Date() } });
    if (!job) return res.sendStatus(404);
    res.json({ data: { id: job.id, status: job.status, result: job.result, error: job.error } });
  } catch (e) { next(e); }
});
