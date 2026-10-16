import { validateBody } from '../middleware/validate.js';
import { replyBody } from '../identity/contracts.js';
import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getStreamToken } from "../controllers/chat.controller.js";
import { replyToMessage } from "../controllers/webhook.controller.js";

const router = express.Router();
router.get("/token", protectRoute, getStreamToken);

// Reply to a chat message from a push notification — requires auth + CSRF
router.post("/reply", protectRoute, validateBody(replyBody), replyToMessage);

export default router;
