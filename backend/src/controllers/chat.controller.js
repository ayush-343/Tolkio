import { generateStreamToken } from "../lib/stream.js";
import { getVideoClient } from '../lib/video.js';

export async function getStreamToken(req, res) {
    // Logic to get chat token


    try {
        // Generate chat token
        const token = generateStreamToken(req.user.id);

        const videoToken = getVideoClient().generateUserToken({ user_id: req.user.id, validity_in_seconds: 3600 });
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ token, videoToken, userId: req.user.id, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    } catch (error) {
        console.log("Error in getStreamToken Controller:",error.message);
        res.status(500).json({ error: "Failed to generate chat token" });
    }
}
