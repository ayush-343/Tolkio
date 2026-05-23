import React from "react";
import useAuthUser from "../hooks/useAuthUser";
import { Link, useLocation } from "react-router";
import { BellIcon, DraftingCompass, LogOutIcon, Menu } from "lucide-react";
import ThemeSelector from "./ThemeSelector.jsx";
import useLogout from "../hooks/useLogout.js";

const Navbar = ({ showSidebarButton, onToggleSidebar }) => {
  const { authUser } = useAuthUser();
  const location = useLocation();
  const inChatPage = location.pathname?.startsWith("/chat");

  // Using useLogout custom hook
  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-200 border-b border-base-300 sticky top-0 z-30 h-16 flex items-center">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between w-full">
          {/* LEFT SIDE: Hamburger / Logo */}
          <div className="flex items-center gap-2">
            {showSidebarButton && (
              <button
                onClick={onToggleSidebar}
                className="btn btn-ghost btn-circle lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-6 w-6 text-base-content opacity-70" />
              </button>
            )}
            
            {inChatPage && (
              <div className="pl-2 lg:pl-5">
                <Link to="/" className="flex items-center gap-2.5">
                  <DraftingCompass className="size-9 text-primary" />
                  <span className="text-3xl font-bold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary tracking-wider hidden sm:inline">
                    Talkio
                  </span>
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Notifications, Theme, User, Logout */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to={"/notifications"}>
              <button className="btn btn-ghost btn-circle">
                <BellIcon className="h-6 w-6 text-base-content opacity-70" />
              </button>
            </Link>

            <ThemeSelector />

            <div className="avatar">
              <div className="w-9 rounded-full">
                <img
                  src={authUser?.profilePic}
                  alt="User Avatar"
                  rel="noreferrer"
                />
              </div>
            </div>

            {/* LOGOUT BUTTON */}
            <button
              className="btn btn-ghost btn-circle"
              onClick={() => logoutMutation()}
            >
              <LogOutIcon className="h-6 w-6 text-base-content opacity-70" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
