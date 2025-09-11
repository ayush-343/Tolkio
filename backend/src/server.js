import express from 'express';
import dotenv from "dotenv";
import mongoose from 'mongoose';

import cookieParser from "cookie-parser";


import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import chatRoutes from './routes/chat.route.js';

import cors from 'cors';


import { connectDB } from './lib/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


// it allows the frontend to send the cookies
// Allow local frontend dev servers and an optional FRONTEND_URL env var used in production
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:5174",
].filter(Boolean);

app.use(
    cors({
        origin: (origin, cb) => {
            // allow requests with no origin (mobile apps, curl, same-origin)
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error("CORS not allowed"));
        },
        credentials: true, // allow frontend to send the cookies
    })
);

app.use(express.json());

app.use(cookieParser());

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/chat", chatRoutes)


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    connectDB();
});

