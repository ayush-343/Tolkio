import { randomUUID } from "node:crypto";
import { Circle, Membership, OutboxJob } from "./models.js";
import User from "../models/User.js";
import { circleProvider } from "./provider.js";
import { syncSafety } from "./safety.js";

export async function syncCircle(circleId, provider = circleProvider) {
  const owner = randomUUID();
  const circle = await Circle.findOneAndUpdate(
    {
      _id: circleId,
      $or: [
        { leaseUntil: { $exists: false } },
        { leaseUntil: { $lt: new Date() } },
      ],
    },
    { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 60000) } },
    { new: true },
  );
  if (!circle) throw new Error("Circle synchronization already leased.");
  const guard = { _id: circleId, leaseOwner: owner };
  let lost = false;
  const renew = setInterval(() => {
    Circle.updateOne(guard, {
      $set: { leaseUntil: new Date(Date.now() + 60000) },
    })
      .then((r) => {
        if (!r.matchedCount) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 10000);
  renew.unref();
  try {
    await provider.verify();
    const channel = await provider.ensure(circle);
    const rows = await Membership.find({ circleId });
    const activeUsers = await User.find({
      _id: { $in: rows.map((m) => m.userId) },
      accountStatus: { $nin: ["suspended", "deleted"] },
    }).select("_id");
    const allowed = new Set(activeUsers.map((u) => String(u._id)));
    const desired =
      circle.status === "archived"
        ? []
        : rows.filter(
            (m) =>
              ["joining", "active"].includes(m.state) &&
              allowed.has(String(m.userId)),
          );
    const actual = await provider.members(circle.channelId);
    // Remove first, before admitting anyone. Metadata never grants provider roles:
    // every participant uses the narrowly scoped channel_member role.
    for (const member of actual) {
      if (lost) throw new Error("Lease lost.");
      const id = String(member.user_id || member.user?.id);
      if (!desired.some((m) => String(m.userId) === id))
        await channel.removeMembers([id]);
    }
    for (const member of desired) {
      if (lost) throw new Error("Lease lost.");
      // Re-read the desired state immediately before admission. A later mutation
      // supersedes this pass and is picked up by its own durable job.
      const latest = await Membership.findById(member._id);
      if (
        !latest ||
        latest.version !== member.version ||
        !["joining", "active"].includes(latest.state)
      )
        continue;
      if (
        !actual.some(
          (m) => String(m.user_id || m.user?.id) === String(member.userId),
        )
      )
        await channel.addMembers([String(member.userId)]);
      await channel.assignRoles([
        { user_id: String(member.userId), channel_role: "channel_member" },
      ]);
    }
    await channel.updatePartial({
      set: { name: circle.name, frozen: circle.status === "archived" },
    });
    if (lost) throw new Error("Lease lost.");
    const committed = await Circle.updateOne(
      { ...guard, syncVersion: circle.syncVersion },
      {
        $set: {
          syncedVersion: circle.syncVersion,
          status: circle.status === "archived" ? "archived" : "active",
        },
        $unset: { syncError: 1 },
      },
    );
    if (!committed.matchedCount)
      throw new Error("Desired membership changed during synchronization.");
    for (const member of rows) {
      const next =
        circle.status === "archived"
          ? member.state === "banned"
            ? "banned"
            : "left"
          : member.state === "joining" && allowed.has(String(member.userId))
            ? "active"
            : member.state === "removing"
              ? "left"
              : member.state;
      await Membership.updateOne(
        { _id: member._id, version: member.version },
        { $set: { state: next, syncedVersion: member.version } },
      );
    }
  } finally {
    clearInterval(renew);
    await Circle.updateOne(guard, { $unset: { leaseOwner: 1, leaseUntil: 1 } });
  }
}
export async function deliverAnnouncement(job, provider = circleProvider) {
  const circle = await Circle.findById(job.circleId);
  const membership = await Membership.findOne({
    circleId: job.circleId,
    userId: job.userId,
    state: "active",
    role: { $in: ["owner", "moderator"] },
  });
  const actor = await User.exists({
    _id: job.userId,
    accountStatus: { $nin: ["suspended", "deleted"] },
  });
  if (!circle || circle.status !== "active" || !membership || !actor) return;
  await provider
    .channel(circle.channelId)
    .sendMessage({
      id: job.messageId,
      text: job.text,
      user_id: String(job.userId),
      talkioAnnouncement: true,
    });
}
export async function processCommunityJob({
  now = new Date(),
  owner = randomUUID(),
  sync = syncCircle,
  safety = syncSafety,
  announcement = deliverAnnouncement,
} = {}) {
  const job = await OutboxJob.findOneAndUpdate(
    {
      $or: [
        { status: "queued", nextRunAt: { $lte: now } },
        { status: "running", leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        leaseOwner: owner,
        leaseUntil: new Date(now.getTime() + 60000),
      },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { nextRunAt: 1 } },
  );
  if (!job) return false;
  const guard = { _id: job._id, leaseOwner: owner, status: "running" };
  const renew = setInterval(() => {
    OutboxJob.updateOne(guard, {
      $set: { leaseUntil: new Date(Date.now() + 60000) },
    }).catch(() => {});
  }, 10000);
  renew.unref();
  try {
    if (job.kind === "announcement") await announcement(job);
    else if (job.kind === "safety") await safety(job.userId);
    else await sync(job.circleId);
    await OutboxJob.updateOne(guard, {
      $set: {
        status: "completed",
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      $unset: { leaseOwner: 1, leaseUntil: 1, error: 1, text: 1 },
    });
  } catch {
    const failed = job.attempts >= 6;
    await OutboxJob.updateOne(guard, {
      $set: {
        status: failed ? "failed" : "queued",
        nextRunAt: new Date(
          Date.now() +
            [1000, 5000, 30000, 120000, 600000][Math.min(job.attempts - 1, 4)] +
            Math.floor(Math.random() * 500),
        ),
        error: "Provider synchronization failed.",
      },
      $unset: { leaseOwner: 1, leaseUntil: 1 },
    });
    if (job.circleId)
      await Circle.updateOne(
        { _id: job.circleId },
        {
          $set: {
            syncError: failed
              ? "Access synchronization needs staff attention."
              : "Retrying access synchronization.",
          },
        },
      );
    if (failed && job.circleId)
      await Circle.updateOne(
        { _id: job.circleId, status: "provisioning" },
        { $set: { status: "failed" } },
      );
    if (failed)
      console.error(
        JSON.stringify({
          event: "community.sync.failed",
          jobId: job.id,
          circleId: job.circleId,
        }),
      );
  } finally {
    clearInterval(renew);
  }
  return true;
}
export async function reconcileCommunities() {
  // Include completed versions: reconciliation must repair provider-only drift.
  for await (const circle of Circle.find().cursor()) {
    const key = `reconcile:${circle.id}:${Math.floor(Date.now() / 300000)}`;
    await OutboxJob.updateOne(
      { key },
      {
        $setOnInsert: {
          kind: "circle",
          circleId: circle._id,
          version: circle.syncVersion,
        },
      },
      { upsert: true },
    );
  }
  for await (const user of User.find({
    $or: [
      { blockedUsers: { $exists: true, $ne: [] } },
      { accountStatus: "suspended" },
      {
        $expr: {
          $ne: [
            { $ifNull: ["$safetyVersion", 0] },
            { $ifNull: ["$safetySyncedVersion", 0] },
          ],
        },
      },
    ],
  })
    .select("_id")
    .cursor()) {
    await OutboxJob.updateOne(
      { key: `safety-reconcile:${user.id}:${Math.floor(Date.now() / 300000)}` },
      { $setOnInsert: { kind: "safety", userId: user._id } },
      { upsert: true },
    );
  }
}
