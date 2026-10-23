// This exercises the actual Stream SDK and effective grants, not mocks.
import "../backend/node_modules/dotenv/config.js";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
if (
  process.env.PROVIDER_ENVIRONMENT !== "staging" ||
  process.argv[2] !== "--run"
)
  throw new Error(
    "Requires isolated staging credentials, PROVIDER_ENVIRONMENT=staging and --run.",
  );
const { StreamChat } = await import(
  "../backend/node_modules/stream-chat/dist/esm/index.mjs"
);
const { streamClient: server } = await import("../backend/src/lib/stream.js");
const { CHANNEL_TYPE, circleProvider } = await import(
  "../backend/src/communities/provider.js"
);
await circleProvider.verify();
const ids = Array.from({ length: 3 }, () => randomBytes(12).toString("hex"));
const channelId = `circle-${randomBytes(12).toString("hex")}`;
const clients = ids.map(() => new StreamChat(process.env.STREAM_API_KEY));
const channel = server.channel(CHANNEL_TYPE, channelId, {
  created_by_id: ids[0],
  members: ids.slice(0, 2),
});
async function denied(run, label) {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error.status === 403 || error.statusCode === 403 || error.code === 17,
      `${label}: unexpected error (not permission denied)`,
    );
    console.log(`PASS: ${label}`);
    return;
  }
  throw new Error(`FAILED: ${label} was permitted`);
}
try {
  await server.upsertUsers(
    ids.map((id) => ({
      id,
      role: "user",
      name: "Isolated M1 permission test",
    })),
  );
  await channel.create();
  await Promise.all(
    clients.map((client, index) =>
      client.connectUser({ id: ids[index] }, server.createToken(ids[index])),
    ),
  );
  const owner = clients[0].channel(CHANNEL_TYPE, channelId),
    member = clients[1].channel(CHANNEL_TYPE, channelId),
    outsider = clients[2].channel(CHANNEL_TYPE, channelId);
  await owner.watch();
  await member.watch();
  await member.sendMessage({ text: "Isolated staging permission test" });
  console.log("PASS: member read/write");
  await denied(() => outsider.watch(), "nonmember cannot read");
  await denied(
    () => outsider.sendMessage({ text: "Should be denied" }),
    "nonmember cannot send",
  );
  await denied(() => member.addMembers([ids[2]]), "member cannot admit others");
  await denied(
    () =>
      member.assignRoles([
        { user_id: ids[1], channel_role: "channel_moderator" },
      ]),
    "member cannot elevate roles",
  );
  await denied(
    () => owner.updatePartial({ set: { frozen: false } }),
    "creator cannot edit channel through SDK",
  );
  await denied(
    () =>
      clients[2]
        .channel(CHANNEL_TYPE, `circle-${randomBytes(12).toString("hex")}`, {
          members: [ids[2]],
        })
        .create(),
    "client cannot create circles",
  );
  await channel.removeMembers([ids[1]]);
  await denied(
    () => member.query({ messages: { limit: 10 } }),
    "removed member cannot read history",
  );
  await denied(
    () => member.sendMessage({ text: "Should be denied" }),
    "removed member cannot send",
  );
  await channel.removeMembers([ids[0]]);
  await denied(
    () => owner.query({ messages: { limit: 10 } }),
    "former creator cannot read history",
  );
  console.log(
    "All real circle SDK permission checks passed. Record the application ID and run date before enabling beta.",
  );
} finally {
  await Promise.allSettled(clients.map((c) => c.disconnectUser()));
  try {
    await channel.delete();
  } catch {
    console.error("Clean up the isolated permission-test channel in Stream.");
  }
  try {
    await server.deleteUsers(ids, {
      user: "hard",
      messages: "hard",
      conversations: "hard",
    });
  } catch {
    console.error("Clean up isolated permission-test users in Stream.");
  }
}
