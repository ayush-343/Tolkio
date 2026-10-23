import { httpError } from "../lib/errors.js";
const ids = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export const staff = (id) => ids("COMMUNITY_STAFF_IDS").includes(String(id));
export const communityEnabled = (id) =>
  process.env.COMMUNITY_ENABLED === "true" &&
  (ids("COMMUNITY_BETA_USERS").includes("*") ||
    ids("COMMUNITY_BETA_USERS").includes(String(id)) ||
    staff(id));
export const communityCapabilities = (user) => ({
  available: communityEnabled(user.id || user._id),
  canCreate: user.isOnboarded === true && communityEnabled(user.id || user._id),
  isStaff: staff(user.id || user._id),
  memberLimit: 50,
});
export const unavailable = () =>
  httpError(
    404,
    "RESOURCE_UNAVAILABLE",
    "This circle or member is unavailable.",
  );
export function canManage(actor, target, action) {
  if (!actor || actor.state !== "active") return false;
  if (action === "role" || action === "transfer") return actor.role === "owner";
  if (!["owner", "moderator"].includes(actor.role)) return false;
  return (
    !target ||
    (target.role !== "owner" &&
      (actor.role === "owner" || target.role === "member"))
  );
}
