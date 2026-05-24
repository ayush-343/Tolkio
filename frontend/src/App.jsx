import { Navigate, Route, Routes } from "react-router-dom";

import HomePage from "./pages/Homepage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import FriendsPage from "./pages/FriendsPage.jsx";

import { Toaster } from "react-hot-toast";

import PageLoader from "./components/PageLoader.jsx";
import useAuthUser from "./hooks/useAuthUser.js";
import Layout from "./components/Layout.jsx";
import StreamVideoProvider from "./components/StreamVideoProvider.jsx";
import { useThemeStore } from "./store/useThemeStore.js";

const App = () => {
  const { isLoading, authUser } = useAuthUser();
  const { theme } = useThemeStore();

  const isAuthenticated = Boolean(authUser);
  const isOnboarded = authUser?.isOnboarded;

  if (isLoading) return <PageLoader />;

  return (
    <div
      className="min-h-screen bg-base-100 text-base-content transition-colors duration-200"
      data-theme={theme}
    >
      <Routes>
        {/* Public routes — no video provider needed */}
        <Route
          path="/signup"
          element={
            !isAuthenticated ? (
              <SignUpPage />
            ) : (
              <Navigate to={isOnboarded ? "/" : "/onboarding"} />
            )
          }
        />
        <Route
          path="/login"
          element={
            !isAuthenticated ? (
              <LoginPage />
            ) : (
              <Navigate to={isOnboarded ? "/" : "/onboarding"} />
            )
          }
        />
        <Route
          path="/onboarding"
          element={
            isAuthenticated ? (
              !isOnboarded ? (
                <OnboardingPage />
              ) : (
                <Navigate to="/" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* 
          All authenticated+onboarded routes are wrapped in StreamVideoProvider
          so incoming call detection works on EVERY page (WhatsApp style).
        */}
        <Route
          path="/*"
          element={
            isAuthenticated && isOnboarded ? (
              <StreamVideoProvider>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <Layout showSidebar={true}>
                        <HomePage />
                      </Layout>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <Layout showSidebar={true}>
                        <NotificationsPage />
                      </Layout>
                    }
                  />
                  <Route
                    path="/chat/:id"
                    element={
                      <Layout showSidebar={false}>
                        <ChatPage />
                      </Layout>
                    }
                  />
                  <Route
                    path="/friends"
                    element={
                      <Layout showSidebar={true}>
                        <FriendsPage />
                      </Layout>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <Layout showSidebar={true}>
                        <SettingsPage />
                      </Layout>
                    }
                  />
                </Routes>
              </StreamVideoProvider>
            ) : (
              <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
            )
          }
        />
      </Routes>

      <Toaster />
    </div>
  );
};
export default App;
