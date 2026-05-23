import { StreamChat } from "stream-chat";

let client = null;
let connectedUserId = null;

export function getStreamClient(apiKey) {
  if (!client) {
    client = StreamChat.getInstance(apiKey);
  }
  return client;
}

export async function connectStreamUser(apiKey, user, token) {
  const c = getStreamClient(apiKey);
  const userId = user?.id ?? user?._id;
  if (!userId) throw new Error("connectStreamUser: missing user id");
  if (connectedUserId === userId) return c;
  // if some other user is connected, disconnect first
  if (connectedUserId && connectedUserId !== userId) {
    try {
      if (typeof c.disconnectUser === "function") await c.disconnectUser();
      else if (typeof c.disconnect === "function") await c.disconnect();
    } catch {
      // ignore
    }
    // reset the client instance to avoid stale state
    client = StreamChat.getInstance(apiKey);
  } else if (!connectedUserId) {
    // just fallback client if not connected
    const existingUser = c.user;
    if (existingUser && (existingUser.id === userId || existingUser._id === userId)) {
        connectedUserId = userId;
        return c;
    }
  }

  await c.connectUser({ id: userId, name: user.fullName, image: user.avatarUrl }, token);
  connectedUserId = userId;
  return c;
}

export async function disconnectStreamClient() {
  if (!client) return;
  try {
    if (typeof client.disconnectUser === "function") await client.disconnectUser();
    else if (typeof client.disconnect === "function") await client.disconnect();
  } catch {
    // ignore
  } finally {
    client = null;
    connectedUserId = null;
  }
}

export function getConnectedUserId() {
  return connectedUserId;
}
