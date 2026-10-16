import { StreamChat } from 'stream-chat';
import { createChatSession } from './chat-session';
const session = createChatSession(key => StreamChat.getInstance(key));
export const getStreamClient = session.getClient;
export const connectStreamUser = session.connect;
export const disconnectStreamClient = session.disconnect;
export const getConnectedUserId = session.getUserId;
