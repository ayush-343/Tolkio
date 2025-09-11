import { Routes, Route, Navigate } from "react-router";
import { lazy, Suspense } from "react";
const Homepage = lazy(() => import("./pages/HomePage.jsx"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const CallPage = lazy(() => import("./pages/CallPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));

import { Toaster } from "react-hot-toast";

import PageLoader from "./components/PageLoader.jsx";
import useAuthUser from "./hooks/useAuthUser.js";
import Layout from "./components/Layout.jsx";
import { useThemeStore } from "./store/useThemeStore.js";

const App = () => {
  //axios

  // react query tanstack query

  // Trying to fetch authenticated user
  const { isLoading, authUser } = useAuthUser();

  // Zustand theme store
  const { theme } = useThemeStore();

  const isAuthenticated = Boolean(authUser);
  const isOnboarded = authUser?.isOnboarded;

  console.log({ authUser });

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="h-screen" data-theme={theme}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated && isOnboarded ? ( // only authenticated and onboarded users can access
                <Layout showSidebar={true}>
                  <Homepage />
                </Layout>
              ) : (
                <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} /> // else redirect to login or onboarding
              )
            }
          />
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
          <Route
            path="/notifications"
            element={
              isAuthenticated && isOnboarded ? (
                <Layout showSidebar={true}>
                  <NotificationsPage />
                </Layout>
              ) : (
                <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
              )
            }
          />
          <Route
            path="/call/:id"
            element={
              isAuthenticated && isOnboarded ? (
                <CallPage />
              ) : (
                <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
              )
            }
          />
          <Route
            path="/chat"
            element={
              isAuthenticated && isOnboarded ? (
                <Layout showSidebar={false}>
                  <ChatPage />
                </Layout>
              ) : (
                <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
              )
            }
          />
          {/* Support direct links to a specific chat, e.g. /chat/:id */}
          <Route
            path="/chat/:id"
            element={
              isAuthenticated && isOnboarded ? (
                <Layout showSidebar={false}>
                  <ChatPage />
                </Layout>
              ) : (
                <Navigate to={!isAuthenticated ? "/login" : "/onboarding"} />
              )
            }
          />
        </Routes>
      </Suspense>

      <Toaster />
    </div>
  );
};

export default App;
