import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET_KEY: "m1-test-session-secret",
  CSRF_SECRET: "m1-test-csrf-secret",
  STREAM_API_KEY: "test-key",
  STREAM_API_SECRET: "m1-test-provider-secret",
  COMMUNITY_ENABLED: "true",
  COMMUNITY_BETA_USERS: "*",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
});
const { createApp } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const {
  Circle,
  Membership,
  Invitation,
  OutboxJob,
  Report,
  AuditEvent,
  CommunityOperation,
  communityModels,
} = await import("../src/communities/models.js");
const service = await import("../src/communities/service.js");
const { circleProvider } = await import("../src/communities/provider.js");
const { safetyProvider, syncSafety } = await import(
  "../src/communities/safety.js"
);
const { processCommunityJob, syncCircle, reconcileCommunities } = await import(
  "../src/communities/worker.js"
);
const { circleNotificationRecipients, recordMessageEvent } = await import(
  "../src/notifications/service.js"
);
const { streamClient } = await import("../src/lib/stream.js");
let db, app, alice, bob, outsider;
const channels = new Map();
const provider = {
  verify: async () => true,
  async ensure(circle) {
    if (!channels.has(circle.channelId))
      channels.set(circle.channelId, new Set());
    return this.channel(circle.channelId);
  },
  channel(id) {
    return {
      removeMembers: async (ids) =>
        ids.forEach((v) => channels.get(id)?.delete(v)),
      addMembers: async (ids) => ids.forEach((v) => channels.get(id).add(v)),
      assignRoles: async () => {},
      updatePartial: async () => {},
      sendMessage: async () => ({}),
    };
  },
  members: async (id) =>
    [...(channels.get(id) || [])].map((user_id) => ({ user_id })),
};
before(async () => {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(db.getUri());
  await Promise.all(communityModels.map((m) => m.init()));
  app = createApp();
  for (const name of ["verify", "ensure", "channel", "members"])
    mock.method(circleProvider, name, provider[name].bind(provider));
  for (const name of ["block", "unblock", "restrictDM", "suspended"])
    mock.method(safetyProvider, name, async () => {});
  mock.method(safetyProvider, "blocked", async () => ({ blocks: [] }));
});
after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  await db?.stop();
});
beforeEach(async () => {
  await Promise.all([...communityModels, User].map((m) => m.deleteMany({})));
  channels.clear();
  [alice, bob, outsider] = await User.create(
    ["Alice", "Bob", "Outsider"].map((name) => ({
      fullName: name,
      email: `${name}@example.com`,
      password: "test-password",
      isOnboarded: true,
      accountStatus: "active",
      nativeLanguage: name === "Alice" ? "english" : "spanish",
      learningLanguage: name === "Alice" ? "spanish" : "english",
    })),
  );
  process.env.COMMUNITY_STAFF_IDS = outsider.id;
  process.env.COMMUNITY_ENABLED = "true";
});
const body = {
  name: "Travel in Spanish",
  description: "Practice holiday conversations.",
  languageCode: "es",
  visibility: "listed",
  minLevel: "A1",
  maxLevel: "B2",
  topics: ["travel"],
};
async function auth(user = alice) {
  const agent = request.agent(app);
  agent.jar.setCookie(
    `jwt=${jwt.sign({ userId: user.id }, process.env.JWT_SECRET_KEY)}`,
  );
  const {
    body: { csrfToken },
  } = await agent.get("/api/csrf-token");
  return { agent, csrf: csrfToken };
}
async function write(
  user,
  path,
  data = {},
  method = "post",
  key = randomUUID(),
) {
  const { agent, csrf } = await auth(user);
  return agent[method](`/api/v1${path}`)
    .set("x-csrf-token", csrf)
    .set("Idempotency-Key", key)
    .send(data);
}
async function circle(options = {}) {
  const response = await write(alice, "/circles", { ...body, ...options });
  assert.equal(response.status, 202, JSON.stringify(response.body));
  await syncCircle(response.body.data.id, provider);
  return Circle.findById(response.body.data.id);
}
async function join(user, c) {
  const result = await write(user, `/circles/${c.id}/join`);
  assert.equal(result.status, 202, JSON.stringify(result.body));
  await syncCircle(c.id, provider);
}

test("feature gate, authentication, CSRF, and strict circle fields", async () => {
  await request(app).get("/api/v1/circles").expect(401);
  const { agent } = await auth();
  await agent.post("/api/v1/circles").send(body).expect(403);
  process.env.COMMUNITY_ENABLED = "false";
  await agent.get("/api/v1/circles").expect(403);
  process.env.COMMUNITY_ENABLED = "true";
  assert.equal(
    (await write(alice, "/circles", { ...body, ownerId: bob.id })).status,
    400,
  );
  await service.assertReplicaSet();
});
test("circle provisioning is transactional and idempotent with mismatched key rejection", async () => {
  const key = randomUUID(),
    first = await write(alice, "/circles", body, "post", key),
    second = await write(alice, "/circles", body, "post", key);
  assert.equal(first.status, 202);
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(await Circle.countDocuments(), 1);
  assert.equal(await Membership.countDocuments(), 1);
  assert.equal(await OutboxJob.countDocuments(), 1);
  assert.equal(
    (
      await write(
        alice,
        "/circles",
        { ...body, name: "Changed name" },
        "post",
        key,
      )
    ).status,
    409,
  );
  assert.equal(first.body.data.status, "provisioning");
  await syncCircle(first.body.data.id, provider);
  assert.equal((await Membership.findOne()).state, "active");
  assert.equal((await Circle.findOne()).status, "active");
});
test("a transaction failure cannot leave a partial circle or audit record", async () => {
  await assert.rejects(
    service.mutate(alice.id, "failure", randomUUID(), {}, async (s) => {
      await service.createCircle(alice.id, body, s);
      throw new Error("crash");
    }),
  );
  assert.equal(await Circle.countDocuments(), 0);
  assert.equal(await OutboxJob.countDocuments(), 0);
  assert.equal(await AuditEvent.countDocuments(), 0);
});
test("invite-only metadata and member list remain private; invite belongs to its recipient", async () => {
  const c = await circle({ visibility: "invite_only" });
  const outsiderSession = await auth(outsider);
  await outsiderSession.agent.get(`/api/v1/circles/${c.id}`).expect(404);
  await outsiderSession.agent
    .get(`/api/v1/circles/${c.id}/members`)
    .expect(404);
  assert.equal(
    (await write(alice, `/circles/${c.id}/invitations`, { userId: bob.id }))
      .status,
    202,
  );
  const bobSession = await auth(bob);
  await bobSession.agent.get(`/api/v1/circles/${c.id}`).expect(200);
  assert.equal((await write(outsider, `/circles/${c.id}/join`)).status, 404);
  await join(bob, c);
  assert.equal(channels.get(c.channelId).has(bob.id), true);
});
test("expired invitations cannot be accepted", async () => {
  const c = await circle({ visibility: "invite_only" });
  await write(alice, `/circles/${c.id}/invitations`, { userId: bob.id });
  await Invitation.updateMany({}, { $set: { expiresAt: new Date(0) } });
  assert.equal((await write(bob, `/circles/${c.id}/join`)).status, 404);
});
test("concurrent joins reserve the last seat exactly once", async () => {
  const c = await circle();
  await Circle.updateOne({ _id: c.id }, { $set: { seats: 49 } });
  const results = await Promise.all([
    write(bob, `/circles/${c.id}/join`),
    write(outsider, `/circles/${c.id}/join`),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
  assert.equal((await Circle.findById(c.id)).seats, 50);
});
test("owner must transfer; moderators cannot change roles or remove owners", async () => {
  const c = await circle();
  await join(bob, c);
  assert.equal((await write(alice, `/circles/${c.id}/leave`)).status, 409);
  const m = await Membership.findOne({ circleId: c.id, userId: bob.id });
  assert.equal(
    (
      await write(
        alice,
        `/circles/${c.id}/members/${bob.id}`,
        { action: "role", role: "moderator", version: m.version },
        "patch",
      )
    ).status,
    202,
  );
  const owner = await Membership.findOne({ circleId: c.id, userId: alice.id });
  assert.equal(
    (
      await write(
        bob,
        `/circles/${c.id}/members/${alice.id}`,
        { action: "ban", version: owner.version },
        "patch",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await write(
        bob,
        `/circles/${c.id}/members/${bob.id}`,
        { action: "role", role: "owner", version: 2 },
        "patch",
      )
    ).status,
    400,
  );
  const current = await Circle.findById(c.id);
  assert.equal(
    (
      await write(alice, `/circles/${c.id}/transfer`, {
        userId: bob.id,
        version: current.version,
      })
    ).status,
    202,
  );
  assert.equal(
    await Membership.countDocuments({ circleId: c.id, role: "owner" }),
    1,
  );
  assert.equal((await Circle.findById(c.id)).ownerId.toString(), bob.id);
});
test("ban denies application and provider access; old jobs do not readmit", async () => {
  const c = await circle();
  await join(bob, c);
  const m = await Membership.findOne({ circleId: c.id, userId: bob.id });
  assert.equal(
    (
      await write(
        alice,
        `/circles/${c.id}/members/${bob.id}`,
        { action: "ban", version: m.version },
        "patch",
      )
    ).status,
    202,
  );
  const { agent } = await auth(bob);
  await agent.get(`/api/v1/circles/${c.id}/chat`).expect(404);
  await syncCircle(c.id, provider);
  assert.equal(channels.get(c.channelId).has(bob.id), false);
  while (
    await processCommunityJob({ sync: (id) => syncCircle(id, provider) })
  ) {
    /* Drain superseded versions. */
  }
  assert.equal(channels.get(c.channelId).has(bob.id), false);
  assert.equal((await write(bob, `/circles/${c.id}/join`)).status, 404);
});
test("membership version conflicts and nonmember chat authorization fail safely", async () => {
  const c = await circle();
  await join(bob, c);
  const { agent } = await auth(outsider);
  await agent.get(`/api/v1/circles/${c.id}/chat`).expect(404);
  assert.equal(
    (
      await write(
        alice,
        `/circles/${c.id}/members/${bob.id}`,
        { action: "ban", version: 999 },
        "patch",
      )
    ).status,
    409,
  );
  const b = await auth(bob);
  await b.agent.get(`/api/v1/circles/${c.id}/chat`).expect(200);
});
test("worker retries a crash after provider success and recovers an expired lease", async () => {
  const result = await write(alice, "/circles", body);
  let once = true;
  await processCommunityJob({
    sync: async (id) => {
      await syncCircle(id, provider);
      if (once) {
        once = false;
        throw new Error("crash");
      }
    },
  });
  const job = await OutboxJob.findOne();
  assert.equal(job.status, "queued");
  await OutboxJob.updateOne(
    { _id: job.id },
    {
      $set: { status: "running", leaseUntil: new Date(0), leaseOwner: "dead" },
    },
  );
  await processCommunityJob({ sync: (id) => syncCircle(id, provider) });
  assert.equal((await OutboxJob.findById(job.id)).status, "completed");
  assert.equal(channels.get(`circle-${result.body.data.id}`).size, 1);
});
test("exhausted retries are visible and staff can requeue; reconciliation repairs drift", async () => {
  const c = await circle();
  await OutboxJob.updateMany({}, { $set: { attempts: 5 } });
  await processCommunityJob({
    sync: async () => {
      throw new Error("provider down");
    },
  });
  let job = await OutboxJob.findOne({ status: "failed" });
  assert.ok(job);
  const noStaff = await auth(bob);
  await noStaff.agent.get("/api/v1/community/operations").expect(404);
  assert.equal(
    (await write(outsider, `/community/operations/${job.id}/retry`)).status,
    202,
  );
  channels.get(c.channelId).add(outsider.id);
  await reconcileCommunities();
  while (
    await processCommunityJob({
      sync: (id) => syncCircle(id, provider),
      safety: async () => {},
    })
  ) {}
  assert.equal(channels.get(c.channelId).has(outsider.id), false);
});
test("archive removes provider members and closes chat", async () => {
  const c = await circle();
  assert.equal(
    (await write(alice, `/circles/${c.id}/archive`, { version: c.version }))
      .status,
    202,
  );
  assert.equal(channels.get(c.channelId).size, 0);
  const { agent } = await auth();
  await agent.get(`/api/v1/circles/${c.id}/chat`).expect(404);
});
test("partner ranking is reciprocal, paginated, safe, and excludes blocks and sanctions", async () => {
  await User.updateOne(
    { _id: outsider.id },
    {
      $set: {
        nativeLanguage: "german",
        nativeLanguages: [{ language: "german" }],
        learningLanguage: "french",
        learningLanguages: [{ language: "french" }],
      },
    },
  );
  const { agent } = await auth();
  const first = await agent
    .get("/api/v1/discovery/partners?limit=1")
    .expect(200);
  assert.equal(first.body.data[0]._id, bob.id);
  assert.ok(first.body.meta.nextCursor);
  for (const forbidden of [
    "email",
    "password",
    "blockedUsers",
    "pushSubscriptions",
  ])
    assert.equal(JSON.stringify(first.body).includes(forbidden), false);
  const second = await agent
    .get(
      `/api/v1/discovery/partners?limit=1&after=${first.body.meta.nextCursor}`,
    )
    .expect(200);
  assert.equal(second.body.data[0]._id, outsider.id);
  await write(alice, `/blocks/${bob.id}`);
  await User.updateOne(
    { _id: outsider.id },
    { $set: { accountStatus: "suspended" } },
  );
  assert.deepEqual(
    (await agent.get("/api/v1/discovery/partners")).body.data,
    [],
  );
});
test("blocks persist retries, reconcile both directions, and preserve shared circles", async () => {
  const c = await circle();
  await join(bob, c);
  assert.equal((await write(alice, `/blocks/${bob.id}`)).status, 202);
  assert.equal(
    (await Membership.findOne({ circleId: c.id, userId: bob.id })).state,
    "active",
  );
  const calls = [];
  await syncSafety(alice.id, {
    blocked: async () => ({ blocks: [] }),
    block: async (...v) => calls.push(v),
    unblock: async () => {},
    restrictDM: async (...v) => calls.push(v),
    suspended: async () => {},
  });
  assert.ok(
    calls.some((v) => v[0] === alice.id && v[1] === bob.id && v[2] === true),
  );
  assert.equal(
    (await write(alice, `/blocks/${bob.id}`, {}, "delete")).status,
    202,
  );
  assert.equal((await User.findById(alice.id)).blockedUsers.length, 0);
});
test("reports are circle-scoped, retain evidence, and staff actions are audited", async () => {
  const c = await circle();
  await join(bob, c);
  const report = await write(bob, "/reports", {
    kind: "circle",
    circleId: c.id,
    reason: "Unsafe circle description",
  });
  assert.equal(report.status, 201);
  const b = await auth(bob);
  assert.equal(
    (await b.agent.get("/api/v1/moderation/reports")).body.data.length,
    0,
  );
  const a = await auth(alice);
  assert.equal(
    (await a.agent.get("/api/v1/moderation/reports")).body.data.length,
    1,
  );
  await Circle.updateOne(
    { _id: c.id },
    { $set: { description: "Changed description" } },
  );
  assert.equal(
    (await Report.findById(report.body.data.id)).evidence.description,
    body.description,
  );
  assert.equal(
    (
      await write(bob, `/moderation/reports/${report.body.data.id}/actions`, {
        action: "resolve",
        note: "Done",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write(alice, `/moderation/reports/${report.body.data.id}/actions`, {
        action: "escalate",
        note: "Needs platform review",
      })
    ).status,
    202,
  );
  assert.equal(
    (await a.agent.get("/api/v1/moderation/reports")).body.data.length,
    0,
  );
  assert.equal(
    (
      await write(
        outsider,
        `/moderation/reports/${report.body.data.id}/actions`,
        { action: "resolve", note: "Reviewed evidence" },
      )
    ).status,
    202,
  );
  assert.equal(
    await AuditEvent.countDocuments({ action: "report.resolve" }),
    1,
  );
});
test("message reports verify the source circle and preserve text after deletion", async () => {
  const c = await circle();
  await join(bob, c);
  const stub = mock.method(streamClient, "getMessage", async () => ({
    message: {
      id: "msg1",
      cid: `talkio_circle:${c.channelId}`,
      text: "Evidence text",
      user: { id: bob.id },
    },
  }));
  const report = await write(alice, "/reports", {
    kind: "message",
    circleId: c.id,
    messageId: "msg1",
    reason: "Message concern",
  });
  assert.equal(report.status, 201);
  stub.mock.restore();
  assert.equal(
    (await Report.findById(report.body.data.id)).evidence.text,
    "Evidence text",
  );
});
test("group notification recipients respect mentions, mutes, blocks, and banned membership", async () => {
  const c = await circle();
  await join(bob, c);
  await join(outsider, c);
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        mentioned_users: [{ id: bob.id }],
      })
    ).length,
    1,
  );
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        mentioned_users: [],
        talkioAnnouncement: true,
      })
    ).length,
    0,
  );
  await Membership.updateOne(
    { circleId: c.id, userId: bob.id },
    { $set: { notifications: "muted" } },
  );
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        mentioned_users: [{ id: bob.id }],
      })
    ).length,
    0,
  );
  await Membership.updateOne(
    { circleId: c.id, userId: bob.id },
    { $set: { notifications: "mentions", state: "banned" } },
  );
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        mentioned_users: [{ id: bob.id }],
      })
    ).length,
    0,
  );
  await User.updateOne(
    { _id: outsider.id },
    { $set: { blockedUsers: [alice.id] } },
  );
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        mentioned_users: [{ id: outsider.id }],
      })
    ).length,
    0,
  );
  await recordMessageEvent({
    type: "message.new",
    channel: { id: c.channelId, type: "talkio_circle" },
    message: { id: "group-message", text: "Hello", user: { id: alice.id } },
  });
});
test("only the backend announcement operation authorizes announcement notifications", async () => {
  const c = await circle();
  await join(bob, c);
  const key = randomUUID();
  await OutboxJob.create({
    userId: alice.id,
    circleId: c.id,
    kind: "announcement",
    key,
    messageId: "trusted-announcement",
  });
  assert.equal(
    (
      await circleNotificationRecipients(c, alice.id, {
        id: "trusted-announcement",
      })
    ).length,
    1,
  );
  assert.equal(
    (
      await circleNotificationRecipients(c, bob.id, {
        id: "trusted-announcement",
      })
    ).length,
    0,
  );
});

test("report fields cannot redirect a circle report to an arbitrary sanction target", async () => {
  const c = await circle();
  assert.equal(
    (
      await write(bob, "/reports", {
        kind: "circle",
        circleId: c.id,
        targetId: alice.id,
        reason: "Injected target",
      })
    ).status,
    400,
  );
});
test("announcement intent survives a crash and is delivered from the durable outbox", async () => {
  const c = await circle();
  await join(bob, c);
  const result = await write(alice, `/circles/${c.id}/announcements`, {
    text: "Practice tonight",
  });
  assert.equal(result.status, 202);
  const job = await OutboxJob.findOne({ kind: "announcement" });
  assert.equal(job.text, "Practice tonight");
  await OutboxJob.updateMany(
    { kind: "circle" },
    { $set: { status: "completed" } },
  );
  let deliveries = 0;
  await processCommunityJob({
    announcement: async () => {
      deliveries++;
      throw new Error("crash after send");
    },
  });
  assert.equal((await OutboxJob.findById(job.id)).status, "queued");
  await OutboxJob.updateOne(
    { _id: job.id },
    { $set: { nextRunAt: new Date(0) } },
  );
  await processCommunityJob({
    announcement: async (retry) => {
      deliveries++;
      assert.equal(retry.messageId, job.messageId);
    },
  });
  assert.equal(deliveries, 2);
  assert.equal((await OutboxJob.findById(job.id)).text, undefined);
});
test("block changes while synchronizing remain pending for reconciliation", async () => {
  await write(alice, `/blocks/${bob.id}`);
  await assert.rejects(
    syncSafety(alice.id, {
      blocked: async () => ({ blocks: [] }),
      block: async () => {
        await User.updateOne({ _id: alice.id }, { $inc: { safetyVersion: 1 } });
      },
      unblock: async () => {},
      restrictDM: async () => {},
      suspended: async () => {},
    }),
  );
  const user = await User.findById(alice.id);
  assert.notEqual(user.safetyVersion, user.safetySyncedVersion);
  assert.equal(user.safetyLeaseOwner, undefined);
});
test("legacy accounts without a stored status remain discoverable and can join", async () => {
  await User.collection.updateOne(
    { _id: bob._id },
    { $unset: { accountStatus: "" } },
  );
  const { agent } = await auth();
  const discovery = await agent.get("/api/v1/discovery/partners").expect(200);
  assert.ok(discovery.body.data.some((u) => u._id === bob.id));
  const c = await circle();
  await join(bob, c);
  assert.equal(channels.get(c.channelId).has(bob.id), true);
});
test("a failed unfreeze remains retryable after the provider has already removed its block", async () => {
  await User.updateOne(
    { _id: alice.id },
    { $set: { blockedUsers: [], safetyTargets: [bob.id], safetyVersion: 2 } },
  );
  const provider = {
    blocked: async () => ({ blocks: [] }),
    block: async () => {},
    unblock: async () => {},
    restrictDM: async () => {
      throw new Error("temporary unfreeze failure");
    },
    suspended: async () => {},
  };
  await assert.rejects(syncSafety(alice.id, provider));
  assert.ok((await User.findById(alice.id)).safetyTargets.length);
  let retried = false;
  provider.restrictDM = async (actor, target, blocked) => {
    assert.equal(target, bob.id);
    assert.equal(blocked, false);
    retried = true;
  };
  await syncSafety(alice.id, provider);
  assert.equal(retried, true);
  assert.equal((await User.findById(alice.id)).safetyTargets.length, 0);
});
test("staff can suspend and restore accounts independently of resolved reports", async () => {
  const path = `/moderation/users/${bob.id}/status`;
  assert.equal(
    (
      await write(alice, path, {
        action: "suspend",
        note: "Unauthorized action",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write(outsider, path, {
        action: "suspend",
        note: "Confirmed unsafe behavior",
      })
    ).status,
    202,
  );
  assert.equal((await User.findById(bob.id)).accountStatus, "suspended");
  const b = await auth(bob);
  await b.agent.get("/api/v1/circles").expect(401);
  assert.equal(
    (
      await write(outsider, path, {
        action: "restore",
        note: "Appeal reviewed",
      })
    ).status,
    202,
  );
  assert.equal((await User.findById(bob.id)).accountStatus, "active");
  assert.equal(
    await AuditEvent.countDocuments({ action: "account.restore" }),
    1,
  );
});
