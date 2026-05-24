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

//apply auth middleware to all routes
router.use(protectRoute)

router.get("/", getRecommendedUsers);
router.get("/friends", getMyFriends);
router.put("/profile", updateProfile);

router.post("/friend-request/:id", sendFriendRequest);
router.put("/friend-request/:id/accept", acceptFriendRequest);
router.put("/friend-request/:id/decline", declineFriendRequest);

router.get("/friend-requests", getFriendRequest);
router.get("/outgoing-friend-requests", getOutgoingFriendRequests);

router.post("/push-subscribe", savePushSubscription);
router.post("/push-notify-call", sendCallNotification);

export default router;