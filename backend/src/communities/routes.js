import express from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { protectRoute } from "../middleware/auth.middleware.js";
import { asyncRoute, httpError } from "../lib/errors.js";
import { objectId } from "../identity/contracts.js";
import { publicUser, PUBLIC_USER_FIELDS } from "../identity/serializers.js";
import User from "../models/User.js";
import { languagesOf } from "../../../shared/languages.js";
import {
  communityEnabled,
  communityCapabilities,
  staff,
  unavailable,
} from "./policy.js";
import { Circle, Membership, Invitation, Report, OutboxJob } from "./models.js";
import * as service from "./service.js";
import * as contracts from "./contracts.js";
import {
  submitReport,
  reportAction,
  setBlock,
  immediateSafety,
  sanctionUser,
} from "./safety.js";
import { syncCircle } from "./worker.js";
import { CHANNEL_TYPE, circleProvider } from "./provider.js";
export const communityRoutes = express.Router();
communityRoutes.use(protectRoute);
communityRoutes.get("/community/capabilities", (req, res) =>
  res.json({ data: communityCapabilities(req.user) }),
);
communityRoutes.use((req, res, next) => {
  if (!communityEnabled(req.user.id) || !req.user.isOnboarded)
    return next(
      httpError(
        403,
        "COMMUNITY_DISABLED",
        "Community beta is not enabled for this account.",
      ),
    );
  next();
});
communityRoutes.use(rateLimit({ windowMs: 60000, limit: 120 }));
const id = (value) => objectId.parse(value);
const paging = (req) => ({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .parse(req.query.limit),
  after: req.query.after ? id(req.query.after) : null,
});
function mutation(
  path,
  schema,
  run,
  { method = "post", status = 202, immediate } = {},
) {
  communityRoutes[method](
    path,
    asyncRoute(async (req, res) => {
      const body = schema.parse(req.body),
        circleId = req.params.id ? id(req.params.id) : undefined;
      const response = await service.mutate(
        req.user.id,
        `${method}:${req.path}`,
        req.get("Idempotency-Key"),
        body,
        (session) => run(req, body, session, circleId),
      );
      if (immediate) await immediate(req, circleId, response);
      res.status(status).json({ data: response });
    }),
  );
}
const empty = z.object({}).strict();
communityRoutes.get(
  "/circles",
  asyncRoute(async (req, res) => {
    const { limit, after } = paging(req);
    const [own, invitations] = await Promise.all([
      Membership.find({
        userId: req.user.id,
        state: { $in: ["active", "joining", "removing"] },
      }),
      Invitation.find({
        userId: req.user.id,
        acceptedAt: null,
        expiresAt: { $gt: new Date() },
      }),
    ]);
    const banned = await Membership.find({
      userId: req.user.id,
      state: "banned",
    }).select("circleId");
    const filter = {
      status: { $ne: "archived" },
      _id: {
        $nin: banned.map((m) => m.circleId),
        ...(after ? { $gt: after } : {}),
      },
      $or: [
        { visibility: "listed" },
        {
          _id: {
            $in: [
              ...own.map((m) => m.circleId),
              ...invitations.map((i) => i.circleId),
            ],
          },
        },
      ],
    };
    if (req.query.languageCode)
      filter.languageCode = z.string().max(12).parse(req.query.languageCode);
    const circles = await Circle.find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1);
    res.json({
      data: circles.slice(0, limit).map((c) =>
        service.circleView(
          c,
          own.find((m) => String(m.circleId) === c.id),
        ),
      ),
      meta: {
        nextCursor: circles.length > limit ? circles[limit - 1].id : null,
      },
    });
  }),
);
mutation("/circles", contracts.circleBody, (req, body, session) =>
  service.createCircle(req.user.id, body, session),
);
communityRoutes.get(
  "/circles/:id",
  asyncRoute(async (req, res) => {
    const { circle, membership } = await service.access(
      req.user.id,
      id(req.params.id),
    );
    res.json({ data: service.circleView(circle, membership) });
  }),
);
const immediateCircle = async (_req, circleId) => {
  try {
    await syncCircle(circleId);
  } catch {
    /* Outbox retries. */
  }
};
mutation("/circles/:id/join", empty, (req, _body, s, c) =>
  service.joinCircle(req.user.id, c, s),
);
mutation(
  "/circles/:id/leave",
  empty,
  (req, _body, s, c) => service.leaveCircle(req.user.id, c, s),
  { immediate: immediateCircle },
);
mutation("/circles/:id/invitations", contracts.inviteBody, (req, b, s, c) =>
  service.invite(req.user.id, c, b.userId, s),
);
mutation("/circles/:id/transfer", contracts.transferBody, (req, b, s, c) =>
  service.transfer(req.user.id, c, b, s),
);
mutation(
  "/circles/:id",
  contracts.editBody,
  (req, b, s, c) => service.editCircle(req.user.id, c, b, s),
  { method: "patch" },
);
mutation(
  "/circles/:id/archive",
  z.object({ version: z.number().int().positive() }).strict(),
  (req, b, s, c) => service.editCircle(req.user.id, c, b, s, true),
  { immediate: immediateCircle },
);
mutation(
  "/circles/:id/members/:userId",
  contracts.memberBody,
  (req, b, s, c) =>
    service.manageMember(req.user.id, c, id(req.params.userId), b, s),
  { method: "patch", immediate: immediateCircle },
);
communityRoutes.get(
  "/circles/:id/members",
  asyncRoute(async (req, res) =>
    res.json({
      data: await service.memberList(req.user.id, id(req.params.id)),
    }),
  ),
);
mutation(
  "/circles/:id/preferences",
  z.object({ notifications: z.enum(["mentions", "muted"]) }).strict(),
  async (req, b, s, c) => {
    await service.access(req.user.id, c, s, true);
    await Membership.updateOne(
      { circleId: c, userId: req.user.id },
      { $set: b },
      { session: s },
    );
    return b;
  },
);
communityRoutes.get(
  "/circles/:id/chat",
  asyncRoute(async (req, res) => {
    const { circle } = await service.access(
      req.user.id,
      id(req.params.id),
      null,
      true,
    );
    await circleProvider.verify();
    const members = await circleProvider.members(circle.channelId);
    if (
      !members.some(
        (m) =>
          String(m.user_id || m.user?.id) === req.user.id &&
          !m.banned &&
          !m.user?.banned,
      )
    )
      throw unavailable();
    res.json({
      data: { channelType: CHANNEL_TYPE, channelId: circle.channelId },
    });
  }),
);
mutation(
  "/circles/:id/announcements",
  z.object({ text: z.string().trim().min(1).max(2000) }).strict(),
  async (req, b, s, c) => {
    const { circle, membership } = await service.access(
      req.user.id,
      c,
      s,
      true,
    );
    if (!["owner", "moderator"].includes(membership.role)) throw unavailable();
    const messageId = `announcement-${req.user.id}-${req.get("Idempotency-Key")}`;
    await OutboxJob.create(
      [
        {
          key: messageId,
          kind: "announcement",
          circleId: c,
          userId: req.user.id,
          messageId,
          text: b.text,
        },
      ],
      { session: s },
    );
    return { circleId: c, messageId, status: "queued" };
  },
);
communityRoutes.get(
  "/community/invitations",
  asyncRoute(async (req, res) => {
    const invitations = await Invitation.find({
      userId: req.user.id,
      acceptedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ _id: -1 })
      .limit(50);
    const circles = await Circle.find({
      _id: { $in: invitations.map((i) => i.circleId) },
      status: { $ne: "archived" },
    });
    res.json({
      data: invitations
        .filter((i) => circles.some((c) => c.id === String(i.circleId)))
        .map((i) => ({
          circleId: String(i.circleId),
          name: circles.find((c) => c.id === String(i.circleId)).name,
          expiresAt: i.expiresAt,
        })),
    });
  }),
);
communityRoutes.get(
  "/discovery/partners",
  asyncRoute(async (req, res) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .parse(req.query.limit);
    const after = req.query.after
      ? z
          .string()
          .max(100)
          .regex(/^\d+:[a-f0-9]{24}$/)
          .parse(req.query.after)
      : null;
    const actor = await User.findById(req.user.id).select(
      `${PUBLIC_USER_FIELDS} interests availability blockedUsers`,
    );
    // Compute rank inside Mongo so pagination does not truncate the candidate pool.
    const natives = languagesOf(actor, "native"),
      learning = languagesOf(actor, "learning");
    const { LANGUAGES } = await import("../../../shared/languages.js");
    const names = (codes) =>
      codes
        .flatMap((c) => [
          c,
          LANGUAGES.find((l) => l.code === c)?.label.toLowerCase(),
        ])
        .filter(Boolean);
    const normalized = (kind) => ({
      $map: {
        input: {
          $concatArrays: [
            { $ifNull: [`$${kind}Languages`, []] },
            [{ language: `$${kind}Language` }],
          ],
        },
        as: "l",
        in: { $toLower: { $ifNull: ["$$l.language", ""] } },
      },
    });
    const pipeline = [
      {
        $match: {
          _id: { $ne: actor._id, $nin: actor.blockedUsers || [] },
          accountStatus: { $nin: ["suspended", "deleted"] },
          isOnboarded: true,
          blockedUsers: { $ne: actor._id },
        },
      },
      {
        $set: {
          fitA: {
            $gt: [
              {
                $size: {
                  $setIntersection: [normalized("native"), names(learning)],
                },
              },
              0,
            ],
          },
          fitB: {
            $gt: [
              {
                $size: {
                  $setIntersection: [normalized("learning"), names(natives)],
                },
              },
              0,
            ],
          },
        },
      },
      {
        $set: {
          rank: {
            $add: [
              {
                $cond: [
                  { $and: ["$fitA", "$fitB"] },
                  1000,
                  { $cond: [{ $or: ["$fitA", "$fitB"] }, 500, 0] },
                ],
              },
              {
                $size: {
                  $setIntersection: [
                    { $ifNull: ["$interests", []] },
                    actor.interests || [],
                  ],
                },
              },
              {
                $size: {
                  $setIntersection: [
                    { $ifNull: ["$availability", []] },
                    actor.availability || [],
                  ],
                },
              },
            ],
          },
        },
      },
    ];
    if (after) {
      const [rank, object] = after.split(":");
      pipeline.push({
        $match: {
          $or: [
            { rank: { $lt: Number(rank) } },
            {
              rank: Number(rank),
              _id: { $gt: new actor._id.constructor(object) },
            },
          ],
        },
      });
    }
    pipeline.push(
      { $sort: { rank: -1, _id: 1 } },
      { $limit: limit + 1 },
      {
        $project: Object.fromEntries([
          ...PUBLIC_USER_FIELDS.split(" ").map((f) => [f, 1]),
          ["rank", 1],
          ["fitA", 1],
          ["fitB", 1],
        ]),
      },
    );
    const users = await User.aggregate(pipeline);
    const data = users
      .slice(0, limit)
      .map((u) => ({
        ...publicUser(u),
        reasons:
          u.fitA && u.fitB
            ? ["Reciprocal language match"]
            : u.fitA || u.fitB
              ? ["Language match"]
              : ["Explore a new connection"],
      }));
    const last = users[limit - 1];
    res.json({
      data,
      meta: {
        nextCursor: users.length > limit ? `${last.rank}:${last._id}` : null,
      },
    });
  }),
);
mutation(
  "/community/profile",
  contracts.preferencesBody,
  async (req, b, s) => {
    await User.updateOne({ _id: req.user.id }, { $set: b }, { session: s });
    return b;
  },
  { method: "patch" },
);
communityRoutes.get(
  "/community/profile",
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.user.id).select(
      "interests availability",
    );
    res.json({
      data: {
        interests: user.interests || [],
        availability: user.availability || [],
      },
    });
  }),
);
communityRoutes.get(
  "/blocks",
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.user.id).select("blockedUsers");
    res.json({
      data: (
        await User.find({ _id: { $in: user.blockedUsers } }).select(
          PUBLIC_USER_FIELDS,
        )
      ).map(publicUser),
    });
  }),
);
for (const [method, blocked] of [
  ["post", true],
  ["delete", false],
])
  mutation(
    "/blocks/:userId",
    empty,
    (req, _b, s) => setBlock(req.user.id, id(req.params.userId), blocked, s),
    { method, immediate: (req) => immediateSafety(req.user.id) },
  );
mutation(
  "/reports",
  contracts.reportBody,
  (req, b, s) => submitReport(req.user.id, b, s),
  { status: 201 },
);
communityRoutes.get(
  "/moderation/reports",
  asyncRoute(async (req, res) => {
    const { limit, after } = paging(req);
    const memberships = await Membership.find({
      userId: req.user.id,
      state: "active",
      role: { $in: ["owner", "moderator"] },
    });
    const filter = {
      status: { $in: staff(req.user.id) ? ["open", "escalated"] : ["open"] },
      ...(staff(req.user.id)
        ? {}
        : { circleId: { $in: memberships.map((m) => m.circleId) } }),
      ...(after ? { _id: { $gt: after } } : {}),
    };
    const reports = await Report.find(filter)
      .sort({ _id: 1 })
      .limit(limit + 1);
    res.json({
      data: reports
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          circleId: r.circleId,
          targetId: r.targetId,
          reason: r.reason,
          evidence: r.evidence,
          status: r.status,
        })),
      meta: {
        nextCursor: reports.length > limit ? reports[limit - 1].id : null,
      },
    });
  }),
);
mutation(
  "/moderation/reports/:reportId/actions",
  contracts.actionBody,
  (req, b, s) => reportAction(req.user.id, id(req.params.reportId), b, s),
  {
    immediate: async (_req, _id, result) => {
      const report = await Report.findById(result.id);
      if (report?.targetId) await immediateSafety(report.targetId);
      if (report?.circleId) await immediateCircle(null, report.circleId);
    },
  },
);
communityRoutes.get(
  "/community/operations",
  asyncRoute(async (req, res) => {
    if (!staff(req.user.id)) throw unavailable();
    const jobs = await OutboxJob.find({ status: "failed" })
      .select("kind circleId userId attempts error updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ data: jobs });
  }),
);
mutation("/community/operations/:jobId/retry", empty, async (req, _b, s) => {
  if (!staff(req.user.id)) throw unavailable();
  const job = await OutboxJob.findOneAndUpdate(
    { _id: id(req.params.jobId), status: "failed" },
    { $set: { status: "queued", attempts: 0, nextRunAt: new Date() } },
    { session: s, new: true },
  );
  if (!job) throw unavailable();
  await service.audit(req.user.id, job.circleId, "job.retry", undefined, s, {
    jobId: job.id,
  });
  return { id: job.id, status: job.status };
});

mutation(
  "/moderation/users/:userId/status",
  z
    .object({
      action: z.enum(["suspend", "restore"]),
      note: z.string().trim().min(3).max(1000),
    })
    .strict(),
  (req, b, s) => sanctionUser(req.user.id, id(req.params.userId), b, s),
  { immediate: async (_req, _id, result) => immediateSafety(result.userId) },
);
