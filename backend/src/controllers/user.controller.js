import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

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
        res.status(200).json({recommendedUsers})
    } catch (error) {
        console.error("Error in getRecommendedUsers controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }

}

export async function getMyFriends(req, res) {
    try {
        const user = await User.findById(req.user.id)
            .select("friends")
            .populate("friends", "fullName profilePic nativeLanguage learningLanguage "); // populate the friends with their details
        res.status(200).json(user.friends);
    } catch (error) {
        console.error("Error in getMyFriends controller", error.message);
        res.status(500).json({message: "Internal S"})

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
            $or :[{sender: myId, recipient: recipientId}, 
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
        }).populate("sender", "fullName profilePic nativeLanguage learningLanguage");


        // Fetch the accepted requests
        const acceptedReqs = await FriendRequest.find({
            recipient: req.user.id,
            status: "accepted",
        }).populate("recipient", "fullName profilePic nativeLanguage learningLanguage");

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
        }).populate("recipient", "fullName profilePic nativeLanguage learningLanguage");

        res.status(200).json({ outgoingReqs });

    } catch (error) {
        console.error("Error in getOutgoingFriendRequests controller", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}