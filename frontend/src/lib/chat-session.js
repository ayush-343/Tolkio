// Serialize SDK operations so concurrent pages and logout cannot race.
export function createChatSession(factory) {
  let client;
  let userId;
  let queue = Promise.resolve();
  const enqueue = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  return {
    getClient: key => client ||= factory(key),
    getUserId: () => userId,
    connect: (key, user, tokenProvider) => enqueue(async () => {
      const id = String(user?.id || user?._id || '');
      if (!id) throw new Error('A signed-in user is required.');
      if (userId === id) return client;
      if (client?.userID) await client.disconnectUser();
      userId = undefined;
      client ||= factory(key);
      await client.connectUser({ id, name: user.fullName, image: user.profilePic }, tokenProvider);
      userId = id;
      return client;
    }),
    disconnect: () => enqueue(async () => {
      try { if (client) await client.disconnectUser(); }
      finally { client = undefined; userId = undefined; }
    }),
  };
}
