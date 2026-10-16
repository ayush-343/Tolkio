import jwt from "jsonwebtoken"
import User from "../models/User.js"
import "dotenv/config"
import { PUBLIC_USER_FIELDS } from '../identity/serializers.js';

export const protectRoute = async (req, res, next) => {
    try{
        const token = req.cookies.jwt;

        // Missing/invalid tokens fail verification before any database access.
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ['HS256'] });

        if (!decoded) {
            return res.status(401).json({ message: "Unauthorized - Invalid token" });
        }
                                                            // removing the password to prevent it from being sent in the response and be visible
        const user = await User.findById(String(decoded.userId)).select(`${PUBLIC_USER_FIELDS} email isOnboarded friends accountStatus blockedUsers`);

        if (!user || (user.accountStatus && user.accountStatus !== "active")) {
            return res.status(401).json({ message: "Unauthorized - User not found" });
        }

        req.user = user;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: "Unauthorized - Invalid token" });
    }
}
