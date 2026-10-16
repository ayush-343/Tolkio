import mongoose from "mongoose";
import { createHash } from "node:crypto";
import {
  Circle,
  Membership,
  Invitation,
  AuditEvent,
  OutboxJob,
  CommunityOperation,
} from "./models.js";
import User from "../models/User.js";
import { publicUser, PUBLIC_USER_FIELDS } from "../identity/serializers.js";
import { httpError } from "../lib/errors.js";
import { canManage, unavailable } from "./policy.js";

export async function transaction(run) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await run(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
export async function assertReplicaSet() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw new Error("Community requires a MongoDB replica set.");
}
export async function enqueue(circle, session) {
  await OutboxJob.updateOne(
    { key: `circle:${circle.id}:${circle.syncVersion}` },
    {
      $setOnInsert: {
        circleId: circle._id,
        kind: "circle",
        version: circle.syncVersion,
      },
    },
    { upsert: true, session },
  );
}
export async function audit(
  actorId,
  circleId,
  action,
  targetId,
  session,
  details,
) {
  await AuditEvent.create([{ actorId, circleId, action, targetId, details }], {
    session,
  });
}
export async function mutate(userId, scope, key, body, run) {
  if (!/^[\w-]{8,80}$/.test(key || ""))
    throw httpError(400, "INVALID_KEY", "A request key is required.");
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const query = { userId, scope, key };
  async function replay(existing) {
    if (existing.hash !== hash)
      throw httpError(
        409,
        "KEY_CONFLICT",
        "This request key was used for different content.",
      );
    return existing.response;
  }
  try {
    return await transaction(async (session) => {
      let existing = await CommunityOperation.findOne(query).session(session);
      if (existing && existing.expiresAt > new Date()) return replay(existing);
      if (existing)
        await CommunityOperation.deleteOne({ _id: existing._id }, { session });
      const response = await run(session);
      await CommunityOperation.create(
        [
          {
            ...query,
            hash,
            response,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
        { session },
      );
      return response;
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await CommunityOperation.findOne(query);
    if (existing && existing.expiresAt > new Date()) return replay(existing);
    throw httpError(
      409,
      "CONFLICT",
      "This resource changed. Refresh and retry.",
    );
  }
}
export async function access(userId, circleId, session, memberOnly = false) {
  if (!mongoose.isValidObjectId(circleId)) throw unavailable();
  const circle = await Circle.findById(circleId).session(session || null);
  const membership = await Membership.findOne({ circleId, userId }).session(
    session || null,
  );
  const invited = await Invitation.exists({
    circleId,
    userId,
    expiresAt: { $gt: new Date() },
    acceptedAt: null,
  }).session(session || null);
  if (
    !circle ||
    membership?.state === "banned" ||
    (memberOnly
      ? membership?.state !== "active" || circle.status !== "active"
      : circle.visibility !== "listed" &&
        !["active", "joining", "removing"].includes(membership?.state) &&
        !invited)
  )
    throw unavailable();
  return { circle, membership };
}
export function circleView(circle, membership) {
  return {
    id: circle.id,
    name: circle.name,
    description: circle.description,
    languageCode: circle.languageCode,
    minLevel: circle.minLevel,
    maxLevel: circle.maxLevel,
    topics: circle.topics,
    visibility: circle.visibility,
    status: circle.status,
    memberCount: circle.seats,
    version: circle.version,
    syncPending: circle.syncVersion !== circle.syncedVersion,
    syncError: circle.syncError || null,
    membership: membership
      ? {
          role: membership.role,
          state: membership.state,
          version: membership.version,
          notifications: membership.notifications,
        }
      : null,
  };
}
async function changed(circle, session) {
  circle.version++;
  circle.syncVersion++;
  await circle.save({ session });
  await enqueue(circle, session);
}
export async function createCircle(userId, body, session) {
  const [circle] = await Circle.create([{ ...body, ownerId: userId }], {
    session,
  });
  circle.channelId = `circle-${circle.id}`;
  await circle.save({ session });
  const [membership] = await Membership.create(
    [{ circleId: circle._id, userId, role: "owner", state: "joining" }],
    { session },
  );
  await enqueue(circle, session);
  await audit(userId, circle.id, "circle.create", undefined, session);
  return circleView(circle, membership);
}
export async function joinCircle(userId, circleId, session) {
  const { circle, membership } = await access(userId, circleId, session);
  if (!["active", "provisioning"].includes(circle.status)) throw unavailable();
  if (["joining", "active"].includes(membership?.state))
    return circleView(circle, membership);
  if (membership?.state === "removing")
    throw httpError(
      409,
      "REMOVAL_PENDING",
      "Wait for your previous membership to finish closing.",
    );
  if (circle.visibility === "invite_only") {
    const accepted = await Invitation.findOneAndUpdate(
      { circleId, userId, expiresAt: { $gt: new Date() }, acceptedAt: null },
      { $set: { acceptedAt: new Date() } },
      { session, new: true },
    );
    if (!accepted) throw unavailable();
  }
  if (circle.seats >= 50)
    throw httpError(
      409,
      "CIRCLE_FULL",
      "This circle has reached its 50-member limit.",
    );
  circle.seats++;
  const next = await Membership.findOneAndUpdate(
    { circleId, userId },
    { $set: { state: "joining", role: "member" }, $inc: { version: 1 } },
    { upsert: true, new: true, session },
  );
  await changed(circle, session);
  await audit(userId, circle.id, "member.join", userId, session);
  return circleView(circle, next);
}
export async function leaveCircle(userId, circleId, session) {
  const { circle, membership } = await access(userId, circleId, session);
  if (!membership || ["left", "removing"].includes(membership.state))
    return circleView(circle, membership);
  if (membership.role === "owner")
    throw httpError(
      409,
      "OWNER_TRANSFER_REQUIRED",
      "Transfer ownership before leaving.",
    );
  if (["active", "joining"].includes(membership.state)) circle.seats--;
  if (membership.state !== "banned") {
    membership.state = "removing";
    membership.version++;
    await membership.save({ session });
  }
  await changed(circle, session);
  await audit(userId, circle.id, "member.leave", userId, session);
  return circleView(circle, membership);
}
export async function manageMember(
  userId,
  circleId,
  targetId,
  body,
  session,
  staffOverride = false,
) {
  const circle = await Circle.findById(circleId).session(session);
  const actor = await Membership.findOne({ circleId, userId }).session(session);
  const target = await Membership.findOne({
    circleId,
    userId: targetId,
  }).session(session);
  if (
    !circle ||
    circle.status === "archived" ||
    !target ||
    (!staffOverride && !canManage(actor, target, body.action)) ||
    target.role === "owner"
  )
    throw unavailable();
  if (target.version !== body.version)
    throw httpError(
      409,
      "VERSION_CONFLICT",
      "Membership changed. Refresh before trying again.",
    );
  if (body.action === "role") {
    if (target.state !== "active")
      throw httpError(
        409,
        "MEMBER_NOT_ACTIVE",
        "Wait for membership to become active.",
      );
    target.role = body.role;
  } else if (body.action === "unban") {
    if (target.state !== "banned")
      throw httpError(409, "NOT_BANNED", "This member is not banned.");
    target.state = "left";
  } else {
    if (["active", "joining"].includes(target.state)) circle.seats--;
    target.state =
      body.action === "ban"
        ? "banned"
        : target.state === "banned"
          ? "banned"
          : "removing";
  }
  target.version++;
  await target.save({ session });
  await changed(circle, session);
  await audit(userId, circle.id, `member.${body.action}`, targetId, session);
  return {
    userId: String(targetId),
    state: target.state,
    version: target.version,
  };
}
export async function invite(userId, circleId, targetId, session) {
  const { circle, membership } = await access(userId, circleId, session, true);
  if (!canManage(membership)) throw unavailable();
  const target = await User.findOne({
    _id: targetId,
    accountStatus: { $nin: ["suspended", "deleted"] },
    isOnboarded: true,
  }).session(session);
  const actor = await User.findById(userId)
    .session(session)
    .select("blockedUsers");
  if (
    !target ||
    (target.blockedUsers || []).some((id) => String(id) === String(userId)) ||
    (actor?.blockedUsers || []).some((id) => String(id) === String(targetId))
  )
    throw unavailable();
  const current = await Membership.findOne({
    circleId,
    userId: targetId,
  }).session(session);
  if (
    current &&
    ["banned", "active", "joining", "removing"].includes(current.state)
  )
    throw httpError(
      409,
      "INVITATION_UNAVAILABLE",
      "This user cannot be invited right now.",
    );
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await Invitation.updateOne(
    { circleId, userId: targetId },
    { $set: { invitedBy: userId, expiresAt, acceptedAt: null } },
    { upsert: true, session },
  );
  await Membership.updateOne(
    { circleId, userId: targetId },
    { $set: { state: "invited", role: "member" }, $inc: { version: 1 } },
    { upsert: true, session },
  );
  await audit(userId, circle.id, "member.invite", targetId, session);
  return { circleId, userId: targetId, expiresAt };
}
export async function transfer(userId, circleId, body, session) {
  const { circle, membership } = await access(userId, circleId, session, true);
  const target = await Membership.findOne({
    circleId,
    userId: body.userId,
    state: "active",
  }).session(session);
  if (membership.role !== "owner" || !target || String(userId) === body.userId)
    throw unavailable();
  if (circle.version !== body.version)
    throw httpError(
      409,
      "VERSION_CONFLICT",
      "Circle changed. Refresh before trying again.",
    );
  membership.role = "moderator";
  membership.version++;
  target.role = "owner";
  target.version++;
  circle.ownerId = target.userId;
  await membership.save({ session });
  await target.save({ session });
  await changed(circle, session);
  await audit(userId, circle.id, "circle.transfer", target.userId, session);
  return circleView(circle, membership);
}
export async function editCircle(
  userId,
  circleId,
  body,
  session,
  archive = false,
) {
  const { circle, membership } = await access(userId, circleId, session, true);
  if (!canManage(membership) || (archive && membership.role !== "owner"))
    throw unavailable();
  if (circle.version !== body.version)
    throw httpError(
      409,
      "VERSION_CONFLICT",
      "Circle changed. Refresh before trying again.",
    );
  if (archive) circle.status = "archived";
  else
    for (const key of ["name", "description", "topics"])
      if (body[key] !== undefined) circle[key] = body[key];
  await changed(circle, session);
  await audit(
    userId,
    circle.id,
    archive ? "circle.archive" : "circle.edit",
    undefined,
    session,
  );
  return circleView(circle, membership);
}
export async function memberList(userId, circleId) {
  const { membership } = await access(userId, circleId, null, true);
  const rows = await Membership.find({
    circleId,
    state: {
      $in: canManage(membership)
        ? ["active", "joining", "removing", "banned"]
        : ["active"],
    },
  });
  const users = await User.find({
    _id: { $in: rows.map((m) => m.userId) },
  }).select(PUBLIC_USER_FIELDS);
  return rows.map((m) => ({
    user: publicUser(users.find((u) => String(u._id) === String(m.userId))),
    role: m.role,
    state: m.state,
    version: m.version,
  }));
}
