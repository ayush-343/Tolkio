import { axiosInstance } from "./axios";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  if (!base64String) {
    return new Uint8Array();
  }
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if push notifications are supported on this platform.
 */
export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

/**
 * Returns the current notification permission state.
 * "granted" | "denied" | "default" (not yet asked)
 */
export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Registers the service worker only (no permission request).
 * Safe to call on page load — does NOT trigger any browser prompt.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registered successfully.");
    return registration;
  } catch (error) {
    console.error("Service Worker registration failed:", error);
    return null;
  }
}

/**
 * Requests notification permission and subscribes to push.
 * MUST be called from a user gesture (click/tap) on iOS.
 * Returns the subscription object or null.
 */
export async function requestPermissionAndSubscribe() {
  if (!isPushSupported()) {
    console.warn("Push notifications are not supported on this platform.");
    return null;
  }

  try {
    // 1. Request Permission (must be user-gesture-triggered for iOS)
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was denied.");
      return null;
    }

    // 2. Get SW registration
    const registration = await navigator.serviceWorker.ready;

    // 3. Subscribe to Push Manager
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    // 4. Send subscription details to backend
    await axiosInstance.post("/users/push-subscribe", { subscription });
    console.log("Push Notification subscription saved on backend.");

    return subscription;
  } catch (error) {
    console.error("Error setting up Push Notifications:", error);
    return null;
  }
}

/**
 * Combined convenience function:
 * - Registers SW silently
 * - If permission is already "granted", subscribes automatically
 * - If permission is "default" (not yet asked), does nothing (waits for user gesture)
 *
 * Called on app load from StreamVideoProvider.
 */
export async function registerServiceWorkerAndSubscribe() {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("VITE_VAPID_PUBLIC_KEY is not defined. Skipping push setup.");
    return null;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push Notifications are not supported in this browser.");
    return null;
  }

  try {
    // Always register the SW first
    await registerServiceWorker();

    // Only auto-subscribe if permission was already granted previously
    if (Notification.permission === "granted") {
      return await requestPermissionAndSubscribe();
    }

    // If "default", we wait — the user will click the enable button
    // If "denied", there's nothing we can do
    if (Notification.permission === "default") {
      console.log("Notification permission not yet requested. Waiting for user gesture.");
    }

    return null;
  } catch (error) {
    console.error("Error in registerServiceWorkerAndSubscribe:", error);
    return null;
  }
}
