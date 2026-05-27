import express from 'express';
import dotenv from "dotenv";

import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import chatRoutes from './routes/chat.route.js';

import cors from 'cors';
import path from 'path';


import { connectDB } from './lib/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Hide X-Powered-By header
app.disable('x-powered-by');

// Security: Helmet for security headers (helps with some CSRF/XSS warnings from scanners too)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": [
          "'self'",
          "data:",
          "https://flagcdn.com",
          "https://*.stream-io-cdn.com",
          "https://avatar.iran.liara.run",
        ],
        "connect-src": [
          "'self'",
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
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 300);
const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs, // 15 minutes by default
  max: rateLimitMax, // limit each IP to N requests per windowMs
  message: { message: "Too many requests from this IP, please try again later." }
});
app.use('/api', apiLimiter);

const __dirname = path.resolve(); // to get the current directory name


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

// Security: Prevent resource exhaustion by limiting JSON body payload size
app.use(express.json({ limit: '10kb' }));

app.use(cookieParser());

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/chat", chatRoutes)

// Serve static files from the frontend's dist directory
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  // For any routes (above) not handled by the API, serve the frontend's index.html
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/", "dist", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});

