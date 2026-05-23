import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

const Layout = ({ children, showSidebar = false }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 relative overflow-hidden">
        {showSidebar && (
          <Sidebar
            isMobileOpen={isMobileOpen}
            onClose={() => setIsMobileOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <Navbar
            showSidebarButton={showSidebar}
            onToggleSidebar={() => setIsMobileOpen((prev) => !prev)}
          />

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
};
export default Layout;
