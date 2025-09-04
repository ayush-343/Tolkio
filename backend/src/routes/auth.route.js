import express from 'express';
import { login, logout, onboard, sighup } from '../controllers/auth.controller.js';
import { protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router()

router.post("/signup", sighup);

router.post("/login", login);

//Logout is post request is because - post requests are for operations that change the state of the server
//and logging does that by destroying the session
router.post("/logout", logout);

router.post("/onboarding", protectRoute, onboard);

// TODO:  forgot password and Implement send-password reset email

//check if user is logged in or not
router.get("/me", protectRoute, (req, res) => {
    res.status(200).json({success:true, user: req.user })
})

export default router; //export the router