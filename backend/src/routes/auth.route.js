import { validateBody } from '../middleware/validate.js';
import rateLimit from 'express-rate-limit';
import { signupBody, loginBody, onboardingBody } from '../identity/contracts.js';
import express from 'express';
import { getMe, login, logout, onboard, sighup } from '../controllers/auth.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router()
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

router.post("/signup", authLimiter, validateBody(signupBody), sighup);

router.post("/login", authLimiter, validateBody(loginBody), login);

//Logout is post request is because - post requests are for operations that change the state of the server
//and logging does that by destroying the session
router.post("/logout", logout);

router.post("/onboarding", protectRoute, validateBody(onboardingBody), onboard);

// TODO:  forgot password and Implement send-password reset email

//check if user is logged in or not
router.get("/me", getMe);

export default router; //export the router
