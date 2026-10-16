import { validateBody } from '../middleware/validate.js';
import { profileBody, callNotificationBody, objectId, pushSubscriptionBody } from '../identity/contracts.js';
import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import {
  getMyFriends,
  getRecommendedUsers,
  sendFriendRequest,
  acceptFriendRequest,
  getFriendRequest,
  getOutgoingFriendRequests,
  declineFriendRequest,
  updateProfile,
  savePushSubscription,
  sendCallNotification,
} from '../controllers/user.controller.js';

const router = express.Router();
router.param('id', (req, _res, next, value) => {
  const parsed = objectId.safeParse(value);
  if (!parsed.success) return next(parsed.error);
  req.params.id = parsed.data;
  next();
});

//apply auth middleware to all routes
router.use(protectRoute)

router.get("/", getRecommendedUsers);
router.get("/friends", getMyFriends);
router.put("/profile", validateBody(profileBody), updateProfile);

router.post("/friend-request/:id", sendFriendRequest);
router.put("/friend-request/:id/accept", acceptFriendRequest);
router.put("/friend-request/:id/decline", declineFriendRequest);

router.get("/friend-requests", getFriendRequest);
router.get("/outgoing-friend-requests", getOutgoingFriendRequests);

router.post("/push-subscribe", validateBody(pushSubscriptionBody), savePushSubscription);
router.post("/push-notify-call", validateBody(callNotificationBody), sendCallNotification);

export default router;
