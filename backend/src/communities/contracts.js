import { z } from "zod";
import { objectId } from "../identity/contracts.js";
import { LANGUAGES } from "../../../shared/languages.js";
const level = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const circleBody = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(1).max(1000),
    languageCode: z
      .string()
      .refine((value) => LANGUAGES.some((l) => l.code === value)),
    minLevel: level.default("A1"),
    maxLevel: level.default("C2"),
    topics: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
    visibility: z.enum(["listed", "invite_only"]).default("listed"),
  })
  .strict()
  .refine(
    (v) =>
      ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(v.minLevel) <=
      ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(v.maxLevel),
    "Invalid level range",
  );
export const editBody = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    topics: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    version: z.number().int().positive(),
  })
  .strict();
export const inviteBody = z.object({ userId: objectId }).strict();
export const memberBody = z
  .object({
    action: z.enum(["role", "remove", "ban", "unban"]),
    role: z.enum(["moderator", "member"]).optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((v) => v.action !== "role" || !!v.role);
export const transferBody = inviteBody.extend({
  version: z.number().int().positive(),
});
const reason = z.string().trim().min(5).max(1000);
export const reportBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), targetId: objectId, reason }).strict(),
  z.object({ kind: z.literal("circle"), circleId: objectId, reason }).strict(),
  z
    .object({
      kind: z.literal("message"),
      circleId: objectId,
      messageId: z.string().min(1).max(200),
      reason,
    })
    .strict(),
]);
export const actionBody = z
  .object({
    action: z.enum(["resolve", "escalate", "ban", "suspend", "restore"]),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();
export const preferencesBody = z
  .object({
    interests: z.array(z.string().trim().min(1).max(40)).max(10),
    availability: z
      .array(z.enum(["weekday", "weekend", "morning", "afternoon", "evening"]))
      .max(5),
  })
  .strict();
