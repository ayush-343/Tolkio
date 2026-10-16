import { streamClient } from "../lib/stream.js";
export const CHANNEL_TYPE = "talkio_circle";
export const MEMBER_GRANTS = [
  "read-channel",
  "create-message",
  "update-message-owner",
  "delete-message-owner",
  "create-reaction",
  "delete-reaction-owner",
];
export const CIRCLE_GRANTS = {
  user: [],
  guest: [],
  anonymous: [],
  moderator: [],
  channel_member: MEMBER_GRANTS,
  channel_moderator: MEMBER_GRANTS,
};
export const circleProvider = {
  async verify() {
    const config = await streamClient.getChannelType(CHANNEL_TYPE);
    for (const role of [
      "user",
      "guest",
      "anonymous",
      "moderator",
      "channel_member",
      "channel_moderator",
    ])
      if (!Array.isArray(config.grants?.[role]))
        throw new Error("Circle grants must be explicit.");
    // Validate every non-server role, including unexpected custom roles. Never
    // rely on a flag alone to prove effective grants are safe.
    for (const [role, grants] of Object.entries(config.grants || {})) {
      if (role === "admin") continue;
      const expected = ["channel_member", "channel_moderator"].includes(role)
        ? MEMBER_GRANTS
        : [];
      if (grants.some((g) => !expected.includes(g)))
        throw new Error("Unsafe circle grants.");
    }
    if (!MEMBER_GRANTS.every((g) => config.grants?.channel_member?.includes(g)))
      throw new Error("Circle grants missing.");
    return true;
  },
  async ensure(circle) {
    const channel = streamClient.channel(CHANNEL_TYPE, circle.channelId, {
      name: circle.name,
      created_by_id: String(circle.ownerId),
    });
    await channel.create();
    return channel;
  },
  channel: (id) => streamClient.channel(CHANNEL_TYPE, id),
  async members(id) {
    const result = [];
    for (let offset = 0; ; offset += 100) {
      const { members } = await streamClient
        .channel(CHANNEL_TYPE, id)
        .queryMembers({}, [], { limit: 100, offset });
      result.push(...members);
      if (members.length < 100) return result;
    }
  },
};
