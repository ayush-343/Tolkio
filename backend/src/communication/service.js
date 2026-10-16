import { createHash, randomUUID } from 'node:crypto';
import User from '../models/User.js';
import { streamClient } from '../lib/stream.js';
import { videoGateway } from '../lib/video.js';
import { httpError } from '../lib/errors.js';
import { CommunicationOperation } from './models.js';
const ids = members => (members || []).map(member => String(member.user_id || member.user?.id || '')).sort();
const unavailable = () => httpError(404, 'RESOURCE_UNAVAILABLE', 'This conversation or call is unavailable.');
const active = user => user && (!user.accountStatus || user.accountStatus === 'active');
export const chatGateway = {
  create: (id, data) => streamClient.channel('messaging', id, data).create(),
  get: id => streamClient.channel('messaging', id).query({ state: true, watch: false, messages: { limit: 0 } }),
  send: (id, userId, text) => streamClient.channel('messaging', id).sendMessage({ text, user_id: userId }),
};
export function createCommunicationService({ users = User, chat = chatGateway, video = videoGateway } = {}) {
  async function friends(actorId, targetId) {
    if (!/^[a-f0-9]{24}$/.test(String(targetId)) || String(actorId) === String(targetId)) throw unavailable();
    const projection = '_id fullName friends blockedUsers accountStatus';
    const [actor, target] = await Promise.all([users.findById(String(actorId)).select(projection), users.findById(String(targetId)).select(projection)]);
    const includes = (values, id) => (values || []).some(value => String(value) === String(id));
    if (!active(actor) || !active(target) || !includes(actor.friends, targetId) || !includes(target.friends, actorId) || includes(actor.blockedUsers, targetId) || includes(target.blockedUsers, actorId)) throw unavailable();
    return { actor, target };
  }
  async function direct(actorId, targetId) {
    await friends(actorId, targetId);
    const members = [String(actorId), String(targetId)].sort();
    const channelId = members.join('-');
    await chat.create(channelId, { members, created_by_id: String(actorId) });
    await authorizeChannel(actorId, channelId);
    return { channelId, channelType: 'messaging' };
  }
  async function authorizeChannel(actorId, channelId) {
    const pair = channelId.split('-');
    if (pair.length !== 2 || !pair.every(id => /^[a-f0-9]{24}$/.test(id)) || pair.slice().sort().join('-') !== channelId || !pair.includes(String(actorId))) throw unavailable();
    await friends(actorId, pair.find(id => id !== String(actorId)));
    const state = await chat.get(channelId);
    const members = state.members || [];
    if (state.channel?.type !== 'messaging' || ids(members).join('-') !== channelId || state.channel?.frozen || members.some(member => member.banned || member.user?.banned)) throw unavailable();
    return state;
  }
  async function reply(actorId, channelId, text) {
    await authorizeChannel(actorId, channelId);
    return chat.send(channelId, String(actorId), text);
  }
  async function call(actorId, targetId, audioOnly, key) {
    const { actor } = await friends(actorId, targetId);
    const members = [String(actorId), String(targetId)].sort();
    const suffix = createHash('sha256').update(`${actorId}:${key}:${targetId}:${audioOnly}`).digest('hex').slice(0, 12);
    const callId = `${members.join('-')}-${suffix}`;
    const requestHash = createHash('sha256').update(JSON.stringify({ targetId, audioOnly })).digest('hex');
    let operation;
    try {
      operation = await CommunicationOperation.findOneAndUpdate({ userId: actorId, key }, { $setOnInsert: { requestHash, callId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      operation = await CommunicationOperation.findOne({ userId: actorId, key });
    }
    if (!operation || operation.requestHash !== requestHash) throw httpError(409, 'KEY_CONFLICT', 'This request key was already used for a different call.');
    if (operation.status !== 'ready') {
      const owner = randomUUID();
      const claim = await CommunicationOperation.findOneAndUpdate({ _id: operation._id, status: 'provisioning', $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 30000) } }, { new: true });
      if (!claim) {
        const latest = await CommunicationOperation.findById(operation._id);
        if (latest?.status !== 'ready') throw httpError(409, 'CALL_PROVISIONING', 'This call is already being prepared. Wait before trying again.');
      } else {
        const guard = { _id: operation._id, leaseOwner: owner };
        try {
          await video.create(callId, { created_by_id: String(actorId), members: members.map(user_id => ({ user_id })), custom: { audioOnly }, video: !audioOnly });
          await CommunicationOperation.updateOne(guard, { $set: { status: 'ready' } });
        } finally { await CommunicationOperation.updateOne(guard, { $unset: { leaseOwner: 1, leaseUntil: 1 } }); }
      }
    }
    return { callId, audioOnly, callerName: actor.fullName };
  }
  async function authorizeCall(actorId, callId, targetId, requireCreator = false) {
    if (!/^[\w-]{1,100}$/.test(callId)) throw unavailable();
    const state = await video.get(callId);
    const members = ids(state.members);
    if (members.length !== 2 || !members.includes(String(actorId)) || state.call?.ended_at || state.call?.type !== 'default' || state.call?.blocked_user_ids?.includes(String(actorId))) throw unavailable();
    const otherId = members.find(id => id !== String(actorId));
    if (targetId && otherId !== String(targetId)) throw unavailable();
    const creator = state.call.created_by?.id || state.call.created_by_id;
    if (requireCreator && creator !== String(actorId)) throw unavailable();
    const { actor } = await friends(actorId, otherId);
    return { targetUserId: otherId, callerName: actor.fullName, audioOnly: state.call.custom?.audioOnly === true };
  }
  return { friends, direct, authorizeChannel, reply, call, authorizeCall };
}
export const communicationService = createCommunicationService();
