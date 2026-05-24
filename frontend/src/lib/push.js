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
 * Registers the service worker and subscribes the user to push notifications.
 * Requests notification permissions from the user.
 */
export async function registerServiceWorkerAndSubscribe() {
  if (!VAPID_PUBLIC_KEY) {
    console.warn("VITE_VAPID_PUBLIC_KEY is not defined. Skipping push setup.");
    return null;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Service Worker or Push Notifications are not supported in this browser.");
    return null;
  }

  try {
    // 1. Register the Service Worker
    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("Service Worker registered successfully:", registration);

    // 2. Request Permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was denied.");
      return null;
    }

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
