import mongoose from "mongoose";
const { Schema } = mongoose;
const oid = { type: Schema.Types.ObjectId, required: true };
function model(name, fields, indexes = []) {
  const schema = new Schema(fields, { timestamps: true });
  for (const [keys, options] of indexes) schema.index(keys, options);
  return mongoose.model(name, schema);
}
export const Circle = model(
  "Circle",
  {
    name: String,
    description: String,
    languageCode: String,
    minLevel: String,
    maxLevel: String,
    topics: [String],
    ownerId: oid,
    visibility: { type: String, enum: ["listed", "invite_only"] },
    status: {
      type: String,
      enum: ["provisioning", "active", "archived", "failed"],
      default: "provisioning",
    },
    channelId: String,
    seats: { type: Number, default: 1 },
    version: { type: Number, default: 1 },
    syncVersion: { type: Number, default: 1 },
    syncedVersion: { type: Number, default: 0 },
    leaseOwner: String,
    leaseUntil: Date,
    syncError: String,
  },
  [[{ status: 1, languageCode: 1, _id: 1 }, {}]],
);
export const Membership = model(
  "Membership",
  {
    circleId: oid,
    userId: oid,
    role: {
      type: String,
      enum: ["owner", "moderator", "member"],
      default: "member",
    },
    state: {
      type: String,
      enum: ["invited", "joining", "active", "removing", "left", "banned"],
    },
    version: { type: Number, default: 1 },
    syncedVersion: { type: Number, default: 0 },
    notifications: {
      type: String,
      enum: ["mentions", "muted"],
      default: "mentions",
    },
  },
  [
    [{ circleId: 1, userId: 1 }, { unique: true }],
    [{ userId: 1, state: 1 }, {}],
  ],
);
export const Invitation = model(
  "Invitation",
  {
    circleId: oid,
    userId: oid,
    invitedBy: oid,
    expiresAt: Date,
    acceptedAt: Date,
    revokedAt: Date,
  },
  [
    [{ circleId: 1, userId: 1 }, { unique: true }],
    [{ userId: 1, acceptedAt: 1, expiresAt: 1 }, {}],
  ],
);
export const AuditEvent = model("AuditEvent", {
  actorId: oid,
  circleId: Schema.Types.ObjectId,
  targetId: Schema.Types.ObjectId,
  action: String,
  details: Schema.Types.Mixed,
});
export const OutboxJob = model(
  "CommunityOutboxJob",
  {
    key: { type: String, unique: true },
    circleId: Schema.Types.ObjectId,
    userId: Schema.Types.ObjectId,
    kind: { type: String, enum: ["circle", "safety", "announcement"] },
    version: Number,
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    messageId: String,
    text: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: Date.now },
    leaseOwner: String,
    leaseUntil: Date,
    error: String,
  },
  [
    [{ status: 1, nextRunAt: 1, leaseUntil: 1 }, {}],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
);
export const CommunityOperation = model(
  "CommunityOperation",
  {
    userId: oid,
    scope: String,
    key: String,
    hash: String,
    response: Schema.Types.Mixed,
    expiresAt: Date,
  },
  [
    [{ userId: 1, scope: 1, key: 1 }, { unique: true }],
    [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ],
);
export const Report = model(
  "Report",
  {
    reporterId: oid,
    circleId: Schema.Types.ObjectId,
    targetId: Schema.Types.ObjectId,
    messageId: String,
    kind: { type: String, enum: ["user", "circle", "message"] },
    reason: String,
    evidence: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["open", "resolved", "escalated"],
      default: "open",
    },
  },
  [[{ circleId: 1, status: 1, _id: 1 }, {}]],
);
export const communityModels = [
  Circle,
  Membership,
  Invitation,
  AuditEvent,
  OutboxJob,
  CommunityOperation,
  Report,
];
