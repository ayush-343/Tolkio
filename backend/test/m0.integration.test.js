import { test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET_KEY: 'isolated-test-session-secret', CSRF_SECRET: 'isolated-test-csrf-secret',
  STREAM_API_KEY: 'test-key', STREAM_API_SECRET: 'isolated-test-stream-secret',
  VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', AI_SERVER_ENABLED: 'false',
  MONGO_URI: 'mongodb://127.0.0.1:1/never-connect-production',
});
const { createApp } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: FriendRequest } = await import('../src/models/FriendRequest.js');
const { chatGateway } = await import('../src/communication/service.js');
const { videoGateway } = await import('../src/lib/video.js');
const { streamClient } = await import('../src/lib/stream.js');
const { WebhookReceipt } = await import('../src/notifications/models.js');
const { CommunicationOperation } = await import('../src/communication/models.js');
const { processNextNotification, deliverMessageNotification } = await import('../src/notifications/service.js');
const { default: webpush } = await import('web-push');
let database, app, alice, bob, outsider;
let sends = 0, pushes = 0;
const channels = new Map();
const calls = new Map();
const members = ids => ids.map(user_id => ({ user_id, user: { id: user_id }, banned: false }));
before(async () => {
  database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(database.getUri());
  await Promise.all([WebhookReceipt.init(), CommunicationOperation.init()]);
  app = createApp();
  [alice, bob, outsider] = await User.create(['Alice', 'Bob', 'Outsider'].map(name => ({ fullName: name, email: `${name.toLowerCase()}@example.com`, password: 'test-password', isOnboarded: true,
    pushSubscriptions: [{ endpoint: 'https://push.example/test', keys: { p256dh: 'private-push-key', auth: 'private-auth-key' } }] })));
  mock.method(streamClient, 'upsertUsers', async () => ({}));
  mock.method(chatGateway, 'create', async (id, data) => {
    if (!channels.has(id)) channels.set(id, { channel: { id, type: 'messaging' }, members: members(data.members) });
    return channels.get(id);
  });
  mock.method(chatGateway, 'get', async id => {
    if (!channels.has(id)) throw Object.assign(new Error('Unavailable'), { status: 404 });
    return channels.get(id);
  });
  mock.method(chatGateway, 'send', async () => { sends++; return { message: { id: 'message-1' } }; });
  mock.method(videoGateway, 'create', async (id, data) => {
    calls.set(id, { call: { id, type: 'default', created_by: { id: data.created_by_id }, custom: data.custom }, members: members(data.members.map(m => m.user_id)) });
    return calls.get(id);
  });
  mock.method(videoGateway, 'get', async id => {
    if (!calls.has(id)) throw Object.assign(new Error('Unavailable'), { status: 404 });
    return calls.get(id);
  });
  mock.method(webpush, 'sendNotification', async () => { pushes++; });
});
beforeEach(async () => {
  sends = 0; pushes = 0; channels.clear(); calls.clear(); app.locals.draining = false;
  await Promise.all([WebhookReceipt.deleteMany({}), CommunicationOperation.deleteMany({})]);
  await FriendRequest.deleteMany({});
  await User.updateMany({}, { $set: { accountStatus: 'active', blockedUsers: [] } });
  await User.updateOne({ _id: alice._id }, { $set: { friends: [bob._id] } });
  await User.updateOne({ _id: bob._id }, { $set: { friends: [alice._id] } });
  await User.updateOne({ _id: outsider._id }, { $set: { friends: [] } });
});
after(async () => { mock.restoreAll(); await mongoose.disconnect(); await database?.stop(); });
async function session(user = alice) {
  const agent = request.agent(app);
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
  agent.jar.setCookie(`jwt=${token}`);
  const response = await agent.get('/api/csrf-token').expect(200);
  return { agent, csrf: response.body.csrfToken };
}
function secretsAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const key of ['password', 'pushSubscriptions', 'private-push-key', 'private-auth-key', 'blockedUsers']) assert.equal(serialized.includes(key), false, key);
}
test('login, self profile, discovery, and profile writes serialize only allowed fields', async () => {
  const { agent, csrf } = await session();
  const login = await agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ email: alice.email, password: 'test-password' }).expect(200);
  secretsAbsent(login.body); assert.equal(login.body.user.email, alice.email);
  const me = await agent.get('/api/auth/me').expect(200); secretsAbsent(me.body);
  const discovery = await agent.get('/api/users').expect(200); secretsAbsent(discovery.body);
  assert.ok(discovery.body.recommendedUsers.length);
  for (const user of discovery.body.recommendedUsers) { assert.equal(user.email, undefined); assert.equal(user.friends, undefined); }
  const refreshed = await session();
  const profile = await refreshed.agent.put('/api/users/profile').set('x-csrf-token', refreshed.csrf).send({ bio: 'Updated bio' }).expect(200);
  secretsAbsent(profile.body);
  assert.equal(profile.body.bio, 'Updated bio');
});
test('onboarding keeps structured language arrays and hides private fields', async () => {
  const { agent, csrf } = await session();
  const response = await agent.post('/api/auth/onboarding').set('x-csrf-token', csrf).send({ fullName: 'Alice', bio: 'Learning', location: 'India', nativeLanguage: 'english', learningLanguage: 'spanish', nativeLanguages: [{ language: 'english', proficiency: 'N' }], learningLanguages: [{ language: 'spanish', proficiency: 'A2' }] }).expect(200);
  secretsAbsent(response.body);
  assert.equal(response.body.user.learningLanguages[0].language, 'spanish');
});
test('communication requires authentication, CSRF, and bounded typed inputs', async () => {
  await request(app).get('/api/chat/token').expect(401);
  const { agent, csrf } = await session();
  await agent.post('/api/v1/conversations/direct').send({ targetUserId: bob.id }).expect(403);
  await agent.post('/api/v1/conversations/direct').set('x-csrf-token', csrf).send({ targetUserId: { $ne: null } }).expect(400);
  await agent.post('/api/chat/reply').set('x-csrf-token', csrf).send({ channelId: 'x', text: 'a'.repeat(2001) }).expect(400);
});
test('backend provisioning preserves legacy DM IDs and rejects outsiders', async () => {
  const { agent, csrf } = await session();
  const response = await agent.post('/api/v1/conversations/direct').set('x-csrf-token', csrf).send({ targetUserId: bob.id }).expect(200);
  assert.equal(response.body.data.channelId, [alice.id, bob.id].sort().join('-'));
  await agent.post('/api/v1/conversations/direct').set('x-csrf-token', csrf).send({ targetUserId: outsider.id }).expect(404);
});
test('push replies require correct channel membership, friendship, and non-banned members', async () => {
  const { agent, csrf } = await session();
  const id = [alice.id, bob.id].sort().join('-');
  channels.set(id, { channel: { type: 'messaging' }, members: members([alice.id, bob.id]) });
  await agent.post('/api/chat/reply').set('x-csrf-token', csrf).send({ channelId: id, text: 'Hello' }).expect(200);
  assert.equal(sends, 1);
  channels.get(id).members[0].banned = true;
  await agent.post('/api/chat/reply').set('x-csrf-token', csrf).send({ channelId: id, text: 'No' }).expect(404);
  assert.equal(sends, 1);
  const stranger = await session(outsider);
  await stranger.agent.post('/api/chat/reply').set('x-csrf-token', stranger.csrf).send({ channelId: id, text: 'No' }).expect(404);
  assert.equal(sends, 1);
});
test('blocks and suspended accounts prevent privileged operations', async () => {
  const { agent, csrf } = await session();
  await User.updateOne({ _id: bob._id }, { $set: { blockedUsers: [alice._id] } });
  await agent.post('/api/v1/conversations/direct').set('x-csrf-token', csrf).send({ targetUserId: bob.id }).expect(404);
  await User.updateOne({ _id: alice._id }, { $set: { accountStatus: 'suspended' } });
  await agent.get('/api/chat/token').expect(401);
  const response = await agent.get('/api/auth/me').expect(200); assert.equal(response.body.user, null);
});
test('push subscription contract rejects arbitrary server-side request destinations', async () => {
  const { agent, csrf } = await session();
  const subscription = { endpoint: 'https://localhost/admin', expirationTime: null, keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } };
  await agent.post('/api/users/push-subscribe').set('x-csrf-token', csrf).send({ subscription }).expect(400);
  subscription.endpoint = 'https://fcm.googleapis.com/fcm/send/test';
  await agent.post('/api/users/push-subscribe').set('x-csrf-token', csrf).send({ subscription }).expect(200);
});
test('concurrent call retries use a single provider operation', async () => {
  const { agent, csrf } = await session();
  const key = randomUUID();
  const count = videoGateway.create.mock.callCount();
  const submit = () => agent.post('/api/v1/calls/direct').set('x-csrf-token', csrf).set('Idempotency-Key', key).send({ targetUserId: bob.id, audioOnly: true });
  const responses = await Promise.all([submit(), submit()]);
  assert.ok(responses.every(response => [201, 409].includes(response.status)));
  assert.ok(responses.some(response => response.status === 201));
  assert.equal(videoGateway.create.mock.callCount() - count, 1);
});
test('call creation is server-side and push identity comes from verified membership', async () => {
  const { agent, csrf } = await session();
  const key = randomUUID();
  const created = await agent.post('/api/v1/calls/direct').set('x-csrf-token', csrf).set('Idempotency-Key', key).send({ targetUserId: bob.id, audioOnly: true }).expect(201);
  const callId = created.body.data.callId;
  await agent.get(`/api/v1/calls/${callId}/authorize`).expect(200);
  await agent.post('/api/users/push-notify-call').set('x-csrf-token', csrf).send({ targetUserId: bob.id, callId, callerName: 'Spoofed', isAudioOnly: false }).expect(200);
  assert.equal(pushes, 1);
  const notification = JSON.parse(webpush.sendNotification.mock.calls.at(-1).arguments[1]);
  assert.equal(notification.body, 'Alice is calling you...');
  assert.equal(notification.title, 'Incoming Voice Call');
  const other = await session(outsider);
  await other.agent.get(`/api/v1/calls/${callId}/authorize`).expect(404);
  await agent.post('/api/users/push-notify-call').set('x-csrf-token', csrf).send({ targetUserId: outsider.id, callId }).expect(404);
  assert.equal(pushes, 1);
  const repeated = await agent.post('/api/v1/calls/direct').set('x-csrf-token', csrf).set('Idempotency-Key', key).send({ targetUserId: bob.id, audioOnly: true }).expect(201);
  assert.equal(repeated.body.data.callId, callId);
  await agent.post('/api/v1/calls/direct').set('x-csrf-token', csrf).set('Idempotency-Key', key).send({ targetUserId: bob.id, audioOnly: false }).expect(409);
});
test('Chat and Video tokens are identity-bound and expire within one hour', async () => {
  const { agent } = await session();
  const response = await agent.get('/api/chat/token').expect(200);
  for (const value of [response.body.token, response.body.videoToken]) {
    const claims = jwt.verify(value, process.env.STREAM_API_SECRET);
    assert.equal(claims.user_id, alice.id);
    assert.ok(claims.exp > Date.now() / 1000);
    assert.ok(claims.exp <= Date.now() / 1000 + 3601);
  }
  assert.equal(response.headers['cache-control'], 'no-store');
});
test('readiness rejects draining services, while liveness stays available', async () => {
  await request(app).get('/health/ready').expect(200);
  app.locals.draining = true;
  await request(app).get('/health/ready').expect(503);
  await request(app).get('/health/live').expect(200);
  await request(app).get('/api/auth/me').expect(503);
});
test('signed webhook retries create one durable job; invalid signatures never persist', async () => {
  const raw = JSON.stringify({ type: 'message.new', message: { id: 'm1', text: 'Private message' }, user: { id: alice.id }, channel: { id: [alice.id, bob.id].sort().join('-'), type: 'messaging' } });
  const signature = createHmac('sha256', process.env.STREAM_API_SECRET).update(raw).digest('hex');
  await request(app).post('/api/chat/webhook').set('Content-Type', 'application/json').set('x-signature', 'bad').send(raw).expect(401);
  for (let index = 0; index < 2; index++) await request(app).post('/api/chat/webhook').set('Content-Type', 'application/json').set('x-signature', signature).send(raw).expect(200);
  assert.equal(await WebhookReceipt.countDocuments(), 1);
  assert.equal(JSON.stringify(await WebhookReceipt.findOne()).includes('Private message'), false);
  const failure = mock.method(WebhookReceipt, 'create', async () => { throw new Error('Storage unavailable'); });
  await request(app).post('/api/chat/webhook').set('Content-Type', 'application/json').set('x-signature', signature).send(raw).expect(503);
  failure.mock.restore();
});
test('notification leases exclude concurrent workers and recover expired claims', async () => {
  await WebhookReceipt.create({ key: 'test-job', channelId: 'channel', messageId: 'message' });
  let deliveries = 0;
  await Promise.all([processNextNotification({ deliver: async () => { deliveries++; } }), processNextNotification({ deliver: async () => { deliveries++; } })]);
  assert.equal(deliveries, 1);
  assert.equal((await WebhookReceipt.findOne()).status, 'completed');
  await WebhookReceipt.updateOne({}, { $set: { status: 'running', leaseOwner: 'crashed', leaseUntil: new Date(0) } });
  await processNextNotification({ deliver: async () => { deliveries++; } });
  assert.equal(deliveries, 2);
});
test('failed notification delivery schedules retry and eventually becomes inspectable', async () => {
  await WebhookReceipt.create({ key: 'failing-job' });
  await processNextNotification({ deliver: async () => { throw new Error('Provider outage'); } });
  let job = await WebhookReceipt.findOne();
  assert.equal(job.status, 'queued'); assert.equal(job.attempts, 1); assert.ok(job.nextRunAt > new Date());
  await WebhookReceipt.updateOne({}, { $set: { attempts: 5, nextRunAt: new Date(0) } });
  await processNextNotification({ deliver: async () => { throw new Error('Provider outage'); } });
  job = await WebhookReceipt.findOne(); assert.equal(job.status, 'failed');
});
test('signup/login/logout and friend acceptance/decline retain legacy contracts', async () => {
  const anonymous = request.agent(app);
  const csrf = (await anonymous.get('/api/csrf-token')).body.csrfToken;
  const signup = await anonymous.post('/api/auth/signup').set('x-csrf-token', csrf).send({ email: 'new@example.com', password: 'test-password', fullName: 'New learner' }).expect(201);
  secretsAbsent(signup.body); assert.equal(signup.body.user.isOnboarded, false);
  const authenticatedCsrf = (await anonymous.get('/api/csrf-token')).body.csrfToken;
  await anonymous.post('/api/auth/logout').set('x-csrf-token', authenticatedCsrf).expect(200);
  assert.equal((await anonymous.get('/api/auth/me')).body.user, null);
  const sender = await session();
  const recipient = await session(outsider);
  const other = await session(bob);
  const sent = await sender.agent.post(`/api/users/friend-request/${outsider.id}`).set('x-csrf-token', sender.csrf).expect(201);
  const id = sent.body.friendRequest._id;
  await other.agent.put(`/api/users/friend-request/${id}/accept`).set('x-csrf-token', other.csrf).expect(403);
  await recipient.agent.put(`/api/users/friend-request/${id}/accept`).set('x-csrf-token', recipient.csrf).expect(200);
  assert.ok((await User.findById(alice._id)).friends.some(value => String(value) === outsider.id));
  assert.ok((await User.findById(outsider._id)).friends.some(value => String(value) === alice.id));
  const next = await other.agent.post(`/api/users/friend-request/${outsider.id}`).set('x-csrf-token', other.csrf).expect(201);
  await recipient.agent.put(`/api/users/friend-request/${next.body.friendRequest._id}/decline`).set('x-csrf-token', recipient.csrf).expect(200);
});
test('notification delivery rechecks source channel, author and current membership', async () => {
  const channelId = [alice.id, bob.id].sort().join('-');
  channels.set(channelId, { channel: { type: 'messaging' }, members: members([alice.id, bob.id]) });
  const message = { id: 'message-1', cid: `messaging:${channelId}`, text: 'Hello', user: { id: alice.id, name: 'Alice' } };
  const messageMock = mock.method(streamClient, 'getMessage', async () => ({ message }));
  const job = { key: 'notification-key', channelId, channelType: 'messaging', senderId: alice.id, messageId: 'message-1' };
  await deliverMessageNotification(job);
  assert.equal(pushes, 1);
  message.cid = 'messaging:another-channel';
  await deliverMessageNotification(job);
  assert.equal(pushes, 1);
  message.cid = `messaging:${channelId}`;
  await User.updateOne({ _id: bob._id }, { $set: { blockedUsers: [alice._id] } });
  await deliverMessageNotification(job);
  assert.equal(pushes, 1);
  messageMock.mock.restore();
});
test('startup failure never opens a listener and shutdown closes HTTP and database', async () => {
  const { startServer } = await import('../src/server.js');
  let listened = false;
  await assert.rejects(startServer({ app: { listen() { listened = true; } }, connect: async () => { throw new Error('Database unavailable'); }, port: 0 }));
  assert.equal(listened, false);
  const running = await startServer({ connect: async () => {}, port: 0 });
  assert.equal(running.server.listening, true);
  await running.shutdown();
  assert.equal(running.server.listening, false);
  assert.equal(mongoose.connection.readyState, 0);
  await request(running.app).get('/health/ready').expect(503);
});
