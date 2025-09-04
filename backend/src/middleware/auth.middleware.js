import jwt from "jsonwebtoken"
import User from "../models/User.js"
import "dotenv/config"

export const protectRoute = async (req, res, next) => {
    try{
        const token = req.cookies.jwt;

        if (!token) { return res.status(401).json({ message: "Unauthorized - No token provided" }); }

        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        if (!decoded) {
            return res.status(401).json({ message: "Unauthorized - Invalid token" });
        }
                                                            // removing the password to prevent it from being sent in the response and be visible
        const user = await User.findById(decoded.userId).select("-password");

        if (!user) {
            return res.status(401).json({ message: "Unauthorized - User not found" });
        }

        req.user = user;
        next();
    }
    catch (error) {
        console.log("Error in protectRoute middleware: ", error);
        return res.status(401).json({ msg: "Unauthorized - Invalid token" });
    }
}