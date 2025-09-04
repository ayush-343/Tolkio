import { generateStreamToken } from "../lib/stream.js";

export async function getStreamToken(req, res) {
    // Logic to get chat token


    try {
        // Generate chat token
        const token = generateStreamToken(req.user.id);

        res.status(200).json({ token });
    } catch (error) {
        console.log("Error in getStreamToken Controller:",error.message);
        res.status(500).json({ error: "Failed to generate chat token" });
    }
}