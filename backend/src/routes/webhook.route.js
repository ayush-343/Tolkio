import express from "express";
import {
  handleStreamWebhook,
} from "../controllers/webhook.controller.js";

const router = express.Router();

// Stream Chat webhook — no auth, no CSRF (verified via Stream x-signature header).
// The raw body middleware is applied in server.js specifically for this path.
router.post("/webhook", handleStreamWebhook);

export default router;
