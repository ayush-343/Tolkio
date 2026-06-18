import { StreamChat } from 'stream-chat';
import "dotenv/config"

const apiKey = process.env.STREAM_API_KEY
const apiSecret = process.env.STREAM_API_SECRET

if (!apiKey || !apiSecret) {
    console.error("Stream API key or Secret is missing")
}

const streamClient = StreamChat.getInstance(apiKey, apiSecret);

// Export the client instance for webhook signature verification and server-side messaging
export { streamClient };

export const upsertStreamUser = async (UserData) => {
    try {
        await streamClient.upsertUsers([UserData]);
        return UserData
    } catch (error) {
        console.error("Error Upserting Stream user", error);
    }
}

export const generateStreamToken = (userId) => {
    try {
        // ensure userId is a string
        const userIdStr = userId.toString();
        return streamClient.createToken(userIdStr);
    } catch (error) {
        console.error("Error generating Stream token", error);
        
    }
}

/**
 * Send a message to a Stream Chat channel on behalf of a user.
 * Uses the server-side admin client so no user-side token is needed.
 * @param {string} channelType - e.g. "messaging"
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID to send as
 * @param {string} text - The message text
 */
export const sendMessageAsUser = async (channelType, channelId, userId, text) => {
    const channel = streamClient.channel(channelType, channelId);
    // The server-side client can send messages on behalf of any user
    const response = await channel.sendMessage({
        text,
        user_id: userId,
    });
    return response;
}
