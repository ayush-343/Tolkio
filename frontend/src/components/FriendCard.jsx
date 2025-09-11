import { LANGUAGE_TO_FLAG } from "../constants/index.js";
import { getLanguageFlag } from "../lib/flags.jsx";
import { Link } from "react-router"; // added import

const FriendCard = ({ friend }) => {
  return (
    <div className="card bg-base-200 hover:shadow-lg transition-shadow ">
      <div className="card-body items-center p-4">
        {/* USER INFO */}
        <div className="flex items-center gap-3 mb-3">
          <div className="avatar size-12">
            <img src={friend.profilePic} alt={friend.fullName} />
          </div>
          <h3 className="font-bold truncate">{friend.fullName}</h3>
        </div>
        {/* ACTIONS */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="badge badge-secondary text-xs">
            {getLanguageFlag(friend.nativeLanguage)} {""}
            {friend.nativeLanguage}
          </span>
          <span className="badge badge-outline text-xs">
            {getLanguageFlag(friend.learningLanguage)} {""}
            {friend.learningLanguage}
          </span>
        </div>
        <Link to={`/chat/${friend._id}`} className="btn btn-outline w-full">
          Message
        </Link>
      </div>
    </div>
  );
};

export default FriendCard;

// ...existing code...
