import { LANGUAGE_TO_FLAG } from "../constants/index.js";
import { getLanguageFlag } from "../lib/flags.jsx";
import { Link } from "react-router";
import { MessageSquare } from "lucide-react";

const FriendCard = ({ friend }) => {
  return (
    <div className="card bg-base-200 hover:shadow-lg transition-shadow border border-base-300">
      <div className="card-body items-center p-6 text-center">
        {/* USER INFO */}
        <div className="relative mb-2">
          <div className="avatar">
            <div className="w-20 rounded-full ring ring-base-100 ring-offset-base-100 ring-offset-2 bg-base-300">
              {friend.profilePic ? (
                <img src={friend.profilePic} alt={friend.fullName} />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-base-content/50">
                  <span className="text-2xl font-bold">
                    {friend.fullName?.charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <span className="absolute bottom-1 right-1 w-3 h-3 bg-success rounded-full ring-2 ring-base-200"></span>
        </div>

        <div className="w-full mb-4">
          <h3 className="font-bold text-lg truncate w-full">
            {friend.fullName}
          </h3>
          <p className="text-xs text-base-content/60 flex items-center justify-center gap-1 mt-1">
            <span>📍</span> {friend.location || "Unknown"}
          </p>
        </div>

        {/* LANGUAGES */}
        <div className="w-full space-y-2 mb-4 text-xs font-semibold">
          <div className="flex justify-between items-start bg-base-100/50 p-2 rounded-lg border border-base-300">
            <span className="text-base-content/60 tracking-widest text-[10px] mt-0.5">
              NATIVE
            </span>
            <div className="flex flex-col items-end gap-1">
              {friend.nativeLanguages && friend.nativeLanguages.length > 0 ? (
                friend.nativeLanguages.map((langObj, i) => (
                  <span key={i} className="badge badge-error gap-1 badge-sm py-2">
                    {getLanguageFlag(langObj.language)}{" "}
                    {langObj.language}
                  </span>
                ))
              ) : (
                <span className="badge badge-error gap-1 badge-sm py-2">
                  {getLanguageFlag(friend.nativeLanguage)}{" "}
                  {friend.nativeLanguage || "None"}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-start bg-base-100/50 p-2 rounded-lg border border-base-300">
            <span className="text-base-content/60 tracking-widest text-[10px] mt-0.5">
              LEARNING
            </span>
            <div className="flex flex-col items-end gap-1">
              {friend.learningLanguages && friend.learningLanguages.length > 0 ? (
                friend.learningLanguages.map((langObj, i) => (
                  <span key={i} className="badge badge-neutral gap-1 badge-sm py-2 bg-base-300 border-none text-base-content">
                    {getLanguageFlag(langObj.language)}{" "}
                    {langObj.language}
                  </span>
                ))
              ) : (
                <span className="badge badge-neutral gap-1 badge-sm py-2 bg-base-300 border-none text-base-content">
                  {getLanguageFlag(friend.learningLanguage)}{" "}
                  {friend.learningLanguage || "None"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <Link
          to={`/chat/${friend._id}`}
          className="btn btn-outline w-full gap-2"
        >
          <MessageSquare className="size-4" /> Message
        </Link>
      </div>
    </div>
  );
};

export default FriendCard;

// ...existing code...
