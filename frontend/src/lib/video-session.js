let current;
export function registerVideoSession(client) { current = client; }
export async function disconnectVideoSession(client = current) {
  if (!client) return;
  if (current === client) current = null;
  try {
    await Promise.allSettled((client.state.calls || []).map(call => call.leave()));
  } finally { await client.disconnectUser(); }
}
