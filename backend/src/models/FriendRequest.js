import mongoose from "mongoose";

const sendFriendRequestSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "accepted"],
            default: "pending",
        },
    },
    {
        timestamps: true, // to get created at and updated at timestamps
    }
);

const FriendRequest = mongoose.model("FriendRequest", sendFriendRequestSchema);

export default FriendRequest;