import { upsertStreamUser } from "../lib/stream.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

export async function sighup(req, res) {
    const { email, password, fullName, confirmPassword } = req.body;

    try {
        if (!email || !password || !fullName) {
            return res.status(400).json({ message: "Please fill in all fields" });
        }
        if (typeof password !== "string" || password.length < 6) {
            return res.status(400).json({ message: "Password must be a string of at least 6 characters" });
        }
        if (confirmPassword !== undefined && confirmPassword !== password) {
            return res.status(400).json({ message: "Passwords do not match" });
        }


        // To avoid invalid email (linear-time safe regex to prevent ReDoS)
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (typeof email !== "string" || !emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }

        //Check Existing User — sanitize email to prevent NoSQL injection
        const sanitizedEmail = String(email).toLowerCase();
        const existingUser = await User.findOne({ email: sanitizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: "Email already in use, please use a different one " });
        }



        //Make User with random ProfilePic
        const idx = Math.floor(Math.random() * 100) + 1; //generate a unm between 1 and 100
        const randomAvatar = `https://avatar.iran.liara.run/public/${idx}.png`
        //Create a User
        const newUser = await User.create({
            email,
            password,
            fullName,
            profilePic: randomAvatar,
        });


        // Create a new user in Stream
        try {

            await upsertStreamUser({
                id: newUser._id.toString(),
                name: newUser.fullName,
                image: newUser.profilePic || "",

            })
            console.log(`Stream User Created for ${newUser.fullName}`);
        } catch (error) {
            console.log("Error creating Stream User", error);

        }



        // CREATED THE USER IN STREAM A WELL

        // Create a token for Auth
        const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET_KEY, {
            expiresIn: "7d"
        })

        // Return the token
        res.cookie('jwt', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,  //prevent XSS attacks
            sameSite: 'strict', // prevent CSRF attacks
            secure: process.env.NODE_ENV === "production"
        })

        const safeUser = newUser.toObject();
        delete safeUser.password;

        res.status(201).json({ success: true, user: safeUser })

    } catch (error) {
        console.log("Error in signup controller ", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export async function login(req, res) {
    try {

        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });

        }
        if (typeof email !== "string" || typeof password !== "string") {
            return res.status(400).json({ message: "Invalid input types" });
        }

        // Sanitize email to prevent NoSQL injection
        const sanitizedEmail = String(email).toLowerCase();
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) return res.status(401).json({ message: "Invalid email or password" })

        const isPasswordCorrect = await user.matchPassword(password);
        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid email or password" });
        }


        // Create a token for Auth
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, {
            expiresIn: "7d"
        })

        // Return the token
        res.cookie('jwt', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,  //prevent XSS attacks
            sameSite: 'strict', // prevent CSRF attacks
            secure: process.env.NODE_ENV === "production"
        })

        res.status(200).json({ success: true, user })

    } catch (error) {
        console.log("Error in login controller ", error);
        res.status(500).json({ message: "Internal Server Error" });

    }
}

export async function logout(req, res) {
    res.clearCookie("jwt")
    res.status(200).json({ success: true, message: "Logged out successfully" });
}

export async function getMe(req, res) {
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(200).json({ success: true, user: null });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        if (!decoded?.userId) {
            return res.status(200).json({ success: true, user: null });
        }

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            return res.status(200).json({ success: true, user: null });
        }

        return res.status(200).json({ success: true, user });
    } catch (error) {
        res.clearCookie("jwt", {
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
        });
        return res.status(200).json({ success: true, user: null });
    }
}


export async function onboard(req, res) {
    try {
        const userId = req.user._id;
        const { fullName, bio, nativeLanguage, learningLanguage, location } = req.body;

        if (!fullName || !bio || !nativeLanguage || !learningLanguage || !location) {
            return res.status(400).json({
                message: "All fields are required",
                missingFields: [
                    !fullName && "fullname",
                    !bio && "bio",
                    !nativeLanguage && "nativeLanguage",
                    !learningLanguage && "learningLanguage",
                    !location && "location",
                ].filter(Boolean),
            });
        }

        // Whitelist only the allowed fields to prevent mass-assignment attacks and NoSQL injection
        const allowedFields = {};
        const ONBOARD_FIELDS = ["fullName", "bio", "nativeLanguage", "learningLanguage", "location",
            "nativeProficiency", "learningProficiency", "profilePic"];
        const ARRAY_FIELDS = ["nativeLanguages", "learningLanguages"];

        for (const field of ONBOARD_FIELDS) {
            if (typeof req.body[field] === "string") {
                allowedFields[field] = req.body[field];
            }
        }
        
        for (const field of ARRAY_FIELDS) {
            if (Array.isArray(req.body[field])) {
                // Ensure all array elements are strings to prevent NoSQL injection
                allowedFields[field] = req.body[field].filter(item => typeof item === "string");
            }
        }
        
        allowedFields.isOnboarded = true;

        const updateUser = await User.findByIdAndUpdate(String(userId), { $set: allowedFields }, { new: true })

        if (!updateUser) {
            return res.status(404).json({ message: "User not found" });
        }
        // update user in database
        try {
            await upsertStreamUser({
                id: updateUser._id.toString(),
                name: updateUser.fullName,
                image: updateUser.profilePic,
            })
            console.log(`Stream user updated after onboard for ${updateUser, fullName}`);

        } catch (streamError) {
            console.log("Error in updating stream user during onboarding ", streamError.message);
        }


        res.status(200).json({ success: true, user: updateUser })
    } catch (error) {


        console.error("Onboarding error: ", error);
        console.log("Error in onboard controller ", error);
    }

}