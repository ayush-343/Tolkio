import express from 'express';
import { z } from 'zod';
import { communicationService } from '../communication/service.js';
import { protectRoute } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { directBody, callBody } from '../identity/contracts.js';
import { asyncRoute } from '../lib/errors.js';
const router = express.Router();
router.use(protectRoute);
router.post('/conversations/direct', validateBody(directBody), asyncRoute(async (req, res) => {
  res.json({ data: await communicationService.direct(req.user.id, req.body.targetUserId) });
}));
router.post('/calls/direct', validateBody(callBody), asyncRoute(async (req, res) => {
  const key = z.string().uuid().parse(req.get('Idempotency-Key'));
  res.status(201).json({ data: await communicationService.call(req.user.id, req.body.targetUserId, req.body.audioOnly, key) });
}));
router.get('/calls/:id/authorize', asyncRoute(async (req, res) => {
  res.json({ data: await communicationService.authorizeCall(req.user.id, req.params.id) });
}));
export default router;
