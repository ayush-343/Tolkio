import { randomUUID } from "node:crypto";
import User from "../models/User.js";
import { streamClient } from "../lib/stream.js";
import { getVideoClient } from "../lib/video.js";
import { OutboxJob, Circle, Membership, Report } from "./models.js";
import { transaction, audit, manageMember } from "./service.js";
import { unavailable, staff, canManage } from "./policy.js";
import { httpError } from "../lib/errors.js";

export const safetyProvider = {
  block: (target, actor) => streamClient.blockUser(target, actor),
  unblock: (target, actor) => streamClient.unBlockUser(target, actor),
  blocked: (actor) => streamClient.getBlockedUsers(actor),
  async restrictDM(actor, target, blocked) {
    const channels = await streamClient.queryChannels(
      { type: "messaging", id: { $eq: [actor, target].sort().join("-") } },
      {},
      { limit: 1 },
    );
    if (channels.length)
      await channels[0].updatePartial({ set: { frozen: blocked } });
    if (blocked) {
      let next;
      do {
        const result = await getVideoClient().video.queryCalls({
          filter_conditions: { members: { $in: [actor] }, ended_at: null },
          limit: 100,
          ...(next ? { next } : {}),
        });
        for (const { call } of result.calls || []) {
          if (call.id?.startsWith([actor, target].sort().join("-") + "-"))
            await getVideoClient().video.call("default", call.id).end();
        }
        next = result.next;
      } while (next);
    }
  },
  async suspended(id, suspended) {
    if (suspended) {
      await streamClient.banUser(id);
      await streamClient.revokeUserToken(id);
      let next;
      do {
        const result = await getVideoClient().video.queryCalls({
          filter_conditions: { members: { $in: [id] }, ended_at: null },
          limit: 100,
          ...(next ? { next } : {}),
        });
        for (const { call } of result.calls || [])
          await getVideoClient().video.call(call.type, call.id).end();
        next = result.next;
      } while (next);
    } else await streamClient.unbanUser(id);
  },
};
export async function syncSafety(userId, provider = safetyProvider) {
  const leaseOwner = randomUUID();
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { safetyLeaseUntil: { $exists: false } },
        { safetyLeaseUntil: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        safetyLeaseOwner: leaseOwner,
        safetyLeaseUntil: new Date(Date.now() + 60000),
      },
    },
    { new: true },
  ).select("blockedUsers accountStatus safetyVersion safetyTargets");
  if (!user) throw new Error("Safety synchronization already leased.");
  const guard = { _id: userId, safetyLeaseOwner: leaseOwner };
  const renew = setInterval(() => {
    User.updateOne(guard, {
      $set: { safetyLeaseUntil: new Date(Date.now() + 60000) },
    }).catch(() => {});
  }, 10000);
  renew.unref();
  try {
    const id = String(userId),
      desired = new Set((user.blockedUsers || []).map(String));
    const current = await provider.blocked(id);
    const previous = new Set(
      (current.blocks || []).map((b) => b.blocked_user_id),
    );
    for (const target of new Set([
      ...desired,
      ...previous,
      ...(user.safetyTargets || []).map(String),
    ])) {
      const other = await User.findById(target).select("blockedUsers");
      const reverse = (other?.blockedUsers || []).some((v) => String(v) === id);
      if (desired.has(target)) await provider.block(target, id);
      else await provider.unblock(target, id);
      await provider.restrictDM(id, target, desired.has(target) || reverse);
    }
    await provider.suspended(id, user.accountStatus !== "active");
    const result = await User.updateOne(
      {
        ...guard,
        $expr: {
          $eq: [{ $ifNull: ["$safetyVersion", 0] }, user.safetyVersion || 0],
        },
      },
      {
        $set: {
          safetySyncedVersion: user.safetyVersion || 0,
          safetyTargets: [...desired],
        },
      },
    );
    if (!result.matchedCount)
      throw new Error("Safety policy changed during synchronization.");
  } finally {
    clearInterval(renew);
    await User.updateOne(guard, {
      $unset: { safetyLeaseOwner: 1, safetyLeaseUntil: 1 },
    });
  }
}
export async function setBlock(actor, target, blocked, session) {
  if (
    String(actor) === String(target) ||
    !(await User.exists({ _id: target }).session(session))
  )
    throw unavailable();
  const update = {
    $inc: { safetyVersion: 1 },
    $addToSet: { safetyTargets: target },
  };
  if (blocked) update.$addToSet.blockedUsers = target;
  else update.$pull = { blockedUsers: target };
  await User.updateOne({ _id: actor }, update, { session });
  await OutboxJob.create(
    [{ key: `safety:${actor}:${randomUUID()}`, userId: actor, kind: "safety" }],
    { session },
  );
  await audit(
    actor,
    undefined,
    blocked ? "user.block" : "user.unblock",
    target,
    session,
  );
  return {
    blocked,
    synchronization: "pending",
    sharedCirclesRemainVisible: true,
  };
}
export async function submitReport(userId, body, session) {
  let evidence,
    targetId = body.targetId;
  if (body.circleId) {
    const { access } = await import("./service.js");
    const { circle } = await access(
      userId,
      body.circleId,
      session,
      body.kind === "message",
    );
    evidence = { circleName: circle.name, description: circle.description };
    if (body.kind === "message") {
      const { message } = await streamClient.getMessage(body.messageId);
      if (
        message.cid !== `talkio_circle:${circle.channelId}` ||
        message.deleted_at
      )
        throw unavailable();
      evidence = {
        text: (message.text || "").slice(0, 4000),
        authorId: message.user?.id,
      };
      targetId = message.user?.id;
    }
  } else {
    const user = await User.findById(body.targetId)
      .session(session)
      .select("fullName bio");
    if (!user) throw unavailable();
    evidence = { fullName: user.fullName, bio: user.bio };
  }
  const [report] = await Report.create(
    [{ ...body, targetId, reporterId: userId, evidence }],
    { session },
  );
  await audit(userId, body.circleId, "report.create", targetId, session);
  return { id: report.id, status: report.status };
}
export async function sanctionUser(userId, targetId, body, session) {
  if (!staff(userId)) throw unavailable();
  if (staff(targetId))
    throw httpError(
      409,
      "STAFF_ACCOUNT",
      "Staff account sanctions require operator review.",
    );
  const target = await User.findById(targetId).session(session);
  if (!target) throw unavailable();
  await User.updateOne(
    { _id: targetId },
    {
      $set: {
        accountStatus: body.action === "suspend" ? "suspended" : "active",
      },
      $inc: { safetyVersion: 1 },
    },
    { session },
  );
  await OutboxJob.create(
    [
      {
        key: `sanction:${targetId}:${randomUUID()}`,
        kind: "safety",
        userId: targetId,
      },
    ],
    { session },
  );
  const memberships = await Membership.find({
    userId: targetId,
    state: { $in: ["active", "joining"] },
  }).session(session);
  for (const m of memberships) {
    const circle = await Circle.findById(m.circleId).session(session);
    if (!circle) continue;
    circle.syncVersion++;
    await circle.save({ session });
    const { enqueue } = await import("./service.js");
    await enqueue(circle, session);
  }
  await audit(userId, undefined, `account.${body.action}`, targetId, session, {
    note: body.note,
  });
  return {
    userId: String(targetId),
    accountStatus: body.action === "suspend" ? "suspended" : "active",
    synchronization: "pending",
  };
}
export async function reportAction(userId, id, body, session) {
  const report = await Report.findById(id).session(session);
  const actor = report?.circleId
    ? await Membership.findOne({ circleId: report.circleId, userId }).session(
        session,
      )
    : null;
  if (
    !report ||
    (!staff(userId) && (!canManage(actor) || report.status === "escalated"))
  )
    throw unavailable();
  if (report.status === "resolved")
    throw httpError(409, "REPORT_CLOSED", "This report is already resolved.");
  if (["suspend", "restore"].includes(body.action)) {
    if (!report.targetId) throw unavailable();
    await sanctionUser(userId, report.targetId, body, session);
  } else if (body.action === "ban") {
    if (!report.circleId || !report.targetId) throw unavailable();
    const target = await Membership.findOne({
      circleId: report.circleId,
      userId: report.targetId,
    }).session(session);
    if (!target) throw unavailable();
    await manageMember(
      userId,
      report.circleId,
      report.targetId,
      { action: "ban", version: target.version },
      session,
      staff(userId),
    );
  }
  report.status = body.action === "escalate" ? "escalated" : "resolved";
  await report.save({ session });
  await audit(
    userId,
    report.circleId,
    `report.${body.action}`,
    report.targetId,
    session,
    { reportId: report.id, note: body.note },
  );
  return { id: report.id, status: report.status };
}
export async function immediateSafety(userId) {
  try {
    await syncSafety(userId);
  } catch {
    /* Durable outbox owns retries. */
  }
}
export { transaction };
