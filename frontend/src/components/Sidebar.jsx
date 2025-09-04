import { useLocation, Link } from "react-router";
import useAuthUser from "../hooks/useAuthUser";

import { BellIcon, DraftingCompass, HomeIcon, UserIcon } from "lucide-react";

const Sidebar = () => {
  const { authUser } = useAuthUser();
  const location = useLocation();
  const currentPath = location.pathname;
  return (
    <div className="w-64 bg-base-200 border-r border-base-300 hidden lg:flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-base-300">
        <Link to="/" className="flex items-center gap-2.5">
          <DraftingCompass className="size-10 text-primary" />
          <span className="text-3xl font-semibold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Talkio
          </span>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <Link
          to="/"
          className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
            currentPath === "/" ? "btn-active" : ""
          }`}
        >
          <HomeIcon className="size-5 text-base-content opacity-70" />
          <span className="text-lg font-semibold">Home</span>
        </Link>
        <Link
          to="/friends"
          className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
            currentPath === "/friends" ? "btn-active" : ""
          }`}
        >
          <UserIcon className="size-5 text-base-content opacity-70" />
          <span className="text-lg font-semibold">Friends</span>
        </Link>
        <Link
          to="/notifications"
          className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
            currentPath === "/notifications" ? "btn-active" : ""
          }`}
        >
          <BellIcon className="size-5 text-base-content opacity-70" />
          <span className="text-lg font-semibold">Notifications</span>
        </Link>
      </nav>
      {/* USER PROFILE SECTION */}
      <div className="p-4 border-t border-base-300 mt-auto">
        <div className="flex items-center gap-3">
          <div className="avatar">
            <div className="size-14 rounded-full">
              <img src={authUser?.profilePic} alt="User Avatar" />
            </div>
          </div>
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{authUser?.fullName}</p>
          <p className=" text-xs text-success flex items-center gap-1">
            <span className="size-2 rounded-full bg-success inline-block" />
            Online
          </p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
