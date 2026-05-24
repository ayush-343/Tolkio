import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import webpush from "web-push";

// Configure VAPID details
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:ayushsrivastavamail@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

//To get recommended users
export async function getRecommendedUsers(req, res) {

    try {
        const currentUserId = req.user.id;
        const currentUser = req.user;
        const recommendedUsers = await User.find({
            $and: [
                { _id: { $ne: currentUserId } }, //exclude the current user
                { _id: { $nin: currentUser.friends } }, // exclude users that are already friends , nin- not in
                { isOnboarded: true }, //only show Onboarded users
            ]
        })
        res.status(200).json({ recommendedUsers })
    } catch (error) {
        console.error("Error in getRecommendedUsers controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }

}

export async function getMyFriends(req, res) {
    try {
        const user = await User.findById(req.user.id)
            .select("friends")
            .populate("friends", "fullName profilePic nativeLanguage learningLanguage nativeLanguages learningLanguages"); // populate the friends with their details
        res.status(200).json(user.friends);
    } catch (error) {
        console.error("Error in getMyFriends controller", error.message);
        res.status(500).json({ message: "Internal S" })

    }

}


export async function sendFriendRequest(req, res) {
    try {
        //Get the User ID and the Recipient ID
        const myId = req.user.id
        const { id: recipientId } = req.params


        //prevent sending request to yourself
        if (myId === recipientId) {
            return res.status(400).json({ message: "You can't send friend request to yourself" })
        }


        //check if the recipient exists
        const recipient = await User.findById(recipientId)
        if (!recipient) {
            return res.status(404).json({ message: "User not found" })
        }


        // check if the user is already friends
        if (recipient.friends.includes(myId)) {
            return res.status(400).json({ message: "You are already friends with this user" })
        }


        // check if a request already exists
        const existingRequest = await FriendRequest.findOne({
            $or: [{ sender: myId, recipient: recipientId },
            { sender: recipientId, recipient: myId }],
        })
        if (existingRequest) {
            return res
                .status(400)
                .json({ message: "Friend request already exists between you and this user" })
        }


        //Finally Creating the Friend Request
        const friendRequest = await FriendRequest.create({
            sender: myId,
            recipient: recipientId
        })
        res.status(201).json({ message: "Friend request sent successfully", friendRequest })


    } catch (error) {
        console.error("Error in sendFriendRequest controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function acceptFriendRequest(req, res) {
    try {
        // Get the request ID from the URL parameters
        const { id: requestId } = req.params

        // Find the friend request
        const friendRequest = await FriendRequest.findById(requestId)

        // Check if the friend request exists
        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" })
        }

        //Check if the current user is the recipient
        if (friendRequest.recipient.toString() !== req.user.id) {
            return res.status(403).json({ message: "You are not authorized to accept this friend request" })
        }

        friendRequest.status = "accepted";
        await friendRequest.save();

        // $addToSet: adds elements to an array only if they do not already exist.

        //Add the sender to the recipient's friends list
        await User.findByIdAndUpdate(friendRequest.recipient, {
            $addToSet: { friends: friendRequest.sender }
        })

        //Add the recipient to the sender's friends list
        await User.findByIdAndUpdate(friendRequest.sender, {
            $addToSet: { friends: friendRequest.recipient }
        })

        //Delete the friend request
        await FriendRequest.findByIdAndDelete(requestId)

        res.status(200).json({ message: "Friend request accepted successfully" })

    } catch (error) {
        console.error("Error in acceptFriendRequest controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }

}

export async function getFriendRequest(req, res) {
    try {

        // Fetch the incoming requests
        const incomingReqs = await FriendRequest.find({
            recipient: req.user.id,
            status: "pending",
        }).populate("sender", "fullName profilePic nativeLanguage learningLanguage nativeLanguages learningLanguages");


        // Fetch the accepted requests
        const acceptedReqs = await FriendRequest.find({
            recipient: req.user.id,
            status: "accepted",
        }).populate("recipient", "fullName profilePic nativeLanguage learningLanguage nativeLanguages learningLanguages");

        res.status(200).json({ incomingReqs, acceptedReqs });

    } catch (error) {
        console.error("Error in getFriendRequest controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function getOutgoingFriendRequests(req, res) {
    try {
        // Fetch the outgoing requests
        const outgoingReqs = await FriendRequest.find({
            sender: req.user.id,
            status: "pending",
        }).populate("recipient", "fullName profilePic nativeLanguage learningLanguage nativeLanguages learningLanguages");

        res.status(200).json({ outgoingReqs });

    } catch (error) {
        console.error("Error in getOutgoingFriendRequests controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function declineFriendRequest(req, res) {
    try {
        const { id: requestId } = req.params;

        const friendRequest = await FriendRequest.findById(requestId);

        if (!friendRequest) {
            return res.status(404).json({ message: "Friend request not found" });
        }

        if (friendRequest.recipient.toString() !== req.user.id) {
            return res.status(403).json({ message: "You are not authorized to decline this friend request" });
        }

        friendRequest.status = "rejected";
        await friendRequest.save();

        await FriendRequest.findByIdAndDelete(requestId);

        res.status(200).json({ message: "Friend request declined successfully" });
    } catch (error) {
        console.error("Error in declineFriendRequest controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function updateProfile(req, res) {
    try {
        const { fullName, username, email, password, profilePic, nativeLanguage, nativeProficiency, learningLanguage, learningProficiency, nativeLanguages, learningLanguages } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (fullName !== undefined) user.fullName = fullName;

        // Handle empty strings for sparse unique field
        if (username !== undefined) {
            user.username = username === "" ? undefined : username;
        }

        if (email !== undefined) user.email = email;

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ message: "Password must be at least 6 characters long." });
            }
            user.password = password;
        }

        if (profilePic !== undefined) user.profilePic = profilePic;
        if (nativeLanguage !== undefined) user.nativeLanguage = nativeLanguage;
        if (nativeProficiency !== undefined) user.nativeProficiency = nativeProficiency;
        if (learningLanguage !== undefined) user.learningLanguage = learningLanguage;
        if (learningProficiency !== undefined) user.learningProficiency = learningProficiency;

        if (nativeLanguages !== undefined) user.nativeLanguages = nativeLanguages;
        if (learningLanguages !== undefined) user.learningLanguages = learningLanguages;

        await user.save();

        const updatedUser = await User.findById(userId).select("-password");

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Error in updateProfile controller:", error.message);

        // Send duplicate key error or validation error back
        if (error.code === 11000) {
            return res.status(400).json({ message: "Username or email is already taken" });
        }
        res.status(500).json({ message: error.message || "Internal server error" });
    }
}

export async function savePushSubscription(req, res) {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: "Invalid subscription data" });
        }

        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Avoid duplicate subscriptions by checking endpoint
        const exists = user.pushSubscriptions.some(
            (sub) => sub.endpoint === subscription.endpoint
        );

        if (!exists) {
            user.pushSubscriptions.push(subscription);
            await user.save();
        }

        res.status(200).json({ message: "Push subscription saved successfully" });
    } catch (error) {
        console.error("Error in savePushSubscription:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}

export async function sendCallNotification(req, res) {
    try {
        const { targetUserId, callId, isAudioOnly, callerName } = req.body;
        if (!targetUserId || !callId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const recipient = await User.findById(targetUserId);
        if (!recipient || !recipient.pushSubscriptions || recipient.pushSubscriptions.length === 0) {
            return res.status(200).json({ message: "Recipient has no push subscriptions" });
        }

        const payload = JSON.stringify({
            title: isAudioOnly ? "Incoming Voice Call" : "Incoming Video Call",
            body: `${callerName} is calling you...`,
            data: {
                callId,
                audioOnly: isAudioOnly,
                callerId: req.user.id,
            }
        });

        const sendPromises = recipient.pushSubscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.keys.p256dh,
                            auth: sub.keys.auth,
                        },
                    },
                    payload
                );
            } catch (err) {
                // If 410 (Gone) or 404 (Not Found), delete subscription from user
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await User.findByIdAndUpdate(recipient._id, {
                        $pull: { pushSubscriptions: { endpoint: sub.endpoint } }
                    });
                } else {
                    console.error("Failed to send push notification to endpoint:", sub.endpoint, err);
                }
            }
        });

        await Promise.all(sendPromises);
        res.status(200).json({ message: "Notifications sent successfully" });
    } catch (error) {
        console.error("Error in sendCallNotification:", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}