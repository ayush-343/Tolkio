import express from 'express';
import { communityRoutes } from './communities/routes.js';
import dotenv from "dotenv";

import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { doubleCsrf } from "csrf-csrf";

import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import chatRoutes from './routes/chat.route.js';
import webhookRoutes from './routes/webhook.route.js';
import { aiRoutes } from './ai/routes.js';

import cors from 'cors';
import path from 'path';


import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import communicationRoutes from './routes/communication.route.js';
import { requestIdentity, errorHandler } from './lib/errors.js';

dotenv.config();

export function createApp() {
const app = express();
app.locals.draining = false;
app.use(requestIdentity);
app.get('/health/live', (_req, res) => res.json({ status: 'alive' }));
app.get('/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1 && !app.locals.draining;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});
app.use('/api', (_req, res, next) => {
  if (mongoose.connection.readyState !== 1 || app.locals.draining) return res.status(503).json({ message: 'The service is reconnecting. Please retry shortly.' });
  res.set('Cache-Control', 'no-store');
  next();
});

// Trust first proxy (Render, Railway, etc.) so express-rate-limit reads the real client IP
app.set('trust proxy', 1);

// Security: Hide X-Powered-By header
app.disable('x-powered-by');

// Security: Helmet for security headers (helps with some CSRF/XSS warnings from scanners too)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'wasm-unsafe-eval'"],
        "img-src": [
          "'self'",
          "data:",
          "https://flagcdn.com",
          "https://*.stream-io-cdn.com",
          "https://avatar.iran.liara.run",
        ],
        "connect-src": [
          "'self'",
          ...(process.env.AI_ASSET_ORIGIN ? [process.env.AI_ASSET_ORIGIN] : []),
          "https://*.stream-io-api.com",
          "wss://*.stream-io-api.com",
          "https://*.getstream.io",
          "wss://*.getstream.io",
          // Stream Video SDK domains
          "https://video.stream-io-api.com",
          "wss://video.stream-io-api.com",
          "https://*.stream-io-video.com",
          "wss://*.stream-io-video.com",
          // Push notification endpoints (various browser push services)
          "https://*.push.apple.com",
          "https://fcm.googleapis.com",
          "https://updates.push.services.mozilla.com",
        ],
        // Allow inline media for video calling
        "media-src": ["'self'", "blob:", "https://*.stream-io-cdn.com"],
        // Allow service worker registration
        "worker-src": ["'self'"],
        // Allow push notification popups
        "child-src": ["'self'", "blob:"],
        // Allow manifest.json to be loaded
        "manifest-src": ["'self'"],
      },
    },
  })
);

// Security: Rate limiting to prevent Brute force / DDoS
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs, // 15 minutes by default
  max: rateLimitMax, // limit each IP to N requests per windowMs
  message: { message: "Too many requests from this IP, please try again later." }
});
app.use('/api', apiLimiter);

const frontendDist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));


// it allows the frontend to send the cookies
// Allow local frontend dev servers and an optional FRONTEND_URL env var used in production
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins, // allow local dev servers + optional frontend URL
    credentials: true, // allow frontend to send the cookies
  })
);

// Stream Chat webhook needs raw body for HMAC signature verification.
// This must come BEFORE express.json() so the raw body is preserved.
app.use("/api/chat/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, _res, next) => {
    // Store raw body for signature verification, then parse JSON for downstream handlers
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString("utf-8"));
    } catch {
      // If parsing fails, the webhook controller will handle it
    }
    next();
  }
);

// Security: Prevent resource exhaustion by limiting JSON body payload size
app.use(express.json({ limit: '10kb' }));

app.use(cookieParser());

// Security: CSRF protection using double-submit cookie pattern (stateless)
const { doubleCsrfProtection, generateCsrfToken, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.JWT_SECRET_KEY,
  cookieName: "__csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  getTokenFromRequest: (req) => req.headers["x-csrf-token"],
  getSessionIdentifier: (req) => req.cookies.jwt || "",
});

// Expose a route for the frontend to obtain a CSRF token
app.get("/api/csrf-token", (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
});

// Mount the Stream Chat webhook BEFORE CSRF middleware.
// The webhook endpoint is verified via Stream's x-signature header, not CSRF tokens.
// The /reply endpoint lives in chatRoutes (after CSRF) so it's properly protected.
app.use("/api/chat", webhookRoutes);

// Apply CSRF protection globally to appease security scanners and ensure all state-changing routes are protected
app.use((req, res, next) => {
  // Make the cookie precondition explicit; csrf-csrf still performs the full
  // session-bound cryptographic validation, including the request header.
  if (req.cookies.__csrf === undefined && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next(invalidCsrfTokenError);
  return doubleCsrfProtection(req, res, next);
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
// Versioned AI routes use the same cookie authentication and global CSRF policy.
app.use("/api/v1", aiRoutes);
app.use("/api/v1", communicationRoutes);
app.use("/api/v1", communityRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.', requestId: req.requestId } }));
app.use(errorHandler);

// Serve static files from the frontend's dist directory
if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));

  // Rate limit for the catch-all route to prevent filesystem abuse
  const staticLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { message: "Too many requests, please try again later." },
  });

  // Missing model assets must never masquerade as the SPA HTML.
  app.use('/ai-models', (_req, res) => res.status(404).json({ message: 'Model artifact not found. Rebuild with npm run build:render.' }));
  // For application routes, serve the frontend's index.html
  app.get("*", staticLimiter, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

return app;
}
