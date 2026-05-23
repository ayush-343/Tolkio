import { useLocation, Link } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import useLogout from "../hooks/useLogout";

import {
  BellIcon,
  DraftingCompass,
  HomeIcon,
  UserIcon,
  Settings,
  LogOut,
} from "lucide-react";

const Sidebar = ({ isMobileOpen, onClose }) => {
  const { authUser } = useAuthUser();
  const { logoutMutation } = useLogout();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container with Smooth Slide-in Animation */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-base-200 border-r border-base-300 z-50 flex flex-col h-full transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen lg:z-0 lg:flex ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 border-b border-base-300 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
            <DraftingCompass className="size-10 text-primary" />
            <span className="text-3xl font-semibold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Talkio
            </span>
          </Link>
          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            to="/"
            onClick={onClose}
            className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
              currentPath === "/" ? "btn-active" : ""
            }`}
          >
            <HomeIcon className="size-5 text-base-content opacity-70" />
            <span className="text-lg font-semibold">Home</span>
          </Link>
          <Link
            to="/friends"
            onClick={onClose}
            className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
              currentPath === "/friends" ? "btn-active" : ""
            }`}
          >
            <UserIcon className="size-5 text-base-content opacity-70" />
            <span className="text-lg font-semibold">Friends</span>
          </Link>
          <Link
            to="/notifications"
            onClick={onClose}
            className={`btn btn-ghost justify-start w-full px-3 gap-3 ${
              currentPath === "/notifications" ? "btn-active" : ""
            }`}
          >
            <BellIcon className="size-5 text-base-content opacity-70" />
            <span className="text-lg font-semibold">Notifications</span>
          </Link>
        </nav>

        {/* BOTTOM ACTIONS (SETTINGS & LOGOUT) */}
        <div className="p-4 space-y-2 mt-auto">
          <Link
            to="/settings"
            onClick={onClose}
            className={`btn justify-start w-full gap-3 ${
              currentPath === "/settings" ? "btn-active" : "btn-ghost"
            }`}
          >
            <Settings className="size-5 text-base-content opacity-70" />
            <span className="text-lg font-semibold">Settings</span>
          </Link>
          <button
            onClick={() => {
              onClose();
              logoutMutation();
            }}
            className="btn btn-ghost justify-start w-full gap-3"
          >
            <LogOut className="size-5 text-base-content opacity-70" />
            <span className="text-lg font-semibold">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
