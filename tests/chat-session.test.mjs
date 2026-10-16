import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatSession } from '../frontend/src/lib/chat-session.js';
test('concurrent consumers share one connection and account switches disconnect first', async () => {
  const events = [];
  const client = { userID: null, async connectUser(user, provider) { events.push(`connect:${user.id}`); this.userID = user.id; assert.equal(typeof provider, 'function'); }, async disconnectUser() { events.push(`disconnect:${this.userID}`); this.userID = null; } };
  const session = createChatSession(() => client);
  await Promise.all([session.connect('key', { _id: 'a' }, async () => 'token'), session.connect('key', { _id: 'a' }, async () => 'token')]);
  assert.deepEqual(events, ['connect:a']);
  await session.connect('key', { _id: 'b' }, async () => 'token');
  assert.deepEqual(events, ['connect:a', 'disconnect:a', 'connect:b']);
  await session.disconnect();
  assert.equal(session.getUserId(), undefined);
  assert.equal(client.userID, null);
});
test('logout waits for an in-flight connection before disconnecting it', async () => {
  let finish;
  const events = [];
  const client = { userID: null, async connectUser(user) { await new Promise(resolve => { finish = resolve; }); this.userID = user.id; events.push('connected'); }, async disconnectUser() { this.userID = null; events.push('disconnected'); } };
  const session = createChatSession(() => client);
  const connecting = session.connect('key', { _id: 'a' }, async () => 'token');
  await Promise.resolve();
  const disconnecting = session.disconnect();
  finish(); await Promise.all([connecting, disconnecting]);
  assert.deepEqual(events, ['connected', 'disconnected']);
  assert.equal(session.getUserId(), undefined);
});
