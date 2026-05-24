import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  StreamVideo,
  StreamVideoClient,
  CallingState,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { useQuery } from "@tanstack/react-query";

import useAuthUser from "../hooks/useAuthUser";
import { getStreamToken } from "../lib/api";
import IncomingCallModal from "./IncomingCallModal";
import CallScreen from "./CallScreen";
import { axiosInstance } from "../lib/axios";
import { registerServiceWorkerAndSubscribe } from "../lib/push";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

// Context so child components can access the video client & start calls
const VideoContext = createContext(null);
export const useVideoClient = () => useContext(VideoContext);

/**
 * Global StreamVideo provider.
 * - Initialises the video client once per authenticated user.
 * - Listens for incoming ringing calls on **every page**.
 * - Renders <IncomingCallModal> or <CallScreen> as overlays.
 * - Tracks call metadata (duration, type) for chat status messages.
 */
const StreamVideoProvider = ({ children }) => {
  const { authUser } = useAuthUser();
  const [videoClient, setVideoClient] = useState(null);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active call (either outgoing that we started, or incoming that we accepted)
  const [activeCall, setActiveCall] = useState(null);
  // Whether the active call is audio-only (no video)
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  // Incoming ringing call (before accept/reject)
  const [incomingCall, setIncomingCall] = useState(null);

  // Call metadata for building chat status messages after a call ends
  const callMetaRef = useRef(null);
  const [lastEndedCallInfo, setLastEndedCallInfo] = useState(null);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  // Initialise the StreamVideoClient
  useEffect(() => {
    if (!authUser || !tokenData?.token) return;

    const user = {
      id: authUser._id,
      name: authUser.fullName,
      image: authUser.profilePic,
    };

    const client = StreamVideoClient.getOrCreateInstance({
      apiKey: STREAM_API_KEY,
      user,
      token: tokenData.token,
    });

    setVideoClient(client);

    return () => {
      // Note: do not call disconnectUser here, because getOrCreateInstance reuses instances
      // and disconnecting it might break other active parts of the component if it remounts.
      // We can just clear the local react state:
      setVideoClient(null);
    };
  }, [authUser, tokenData]);

  // Register push notifications when videoClient is set up
  useEffect(() => {
    if (videoClient) {
      registerServiceWorkerAndSubscribe().catch((err) => {
        console.error("Failed to setup push subscription:", err);
      });
    }
  }, [videoClient]);

  // Listen for joinCallId in the search params to auto-join a call (e.g. from notification click)
  useEffect(() => {
    if (!videoClient || !authUser) return;

    const joinCallId = searchParams.get("joinCallId");
    const audioParam = searchParams.get("audioOnly");

    if (joinCallId) {
      const audioOnly = audioParam === "true";

      const autoJoin = async () => {
        try {
          const call = videoClient.call("default", joinCallId);
          await call.join();

          if (audioOnly) {
            try { await call.camera.disable(); } catch { /* ignore */ }
          }

          callMetaRef.current = {
            isAudioOnly: audioOnly,
            isCaller: false,
            connectedAt: Date.now(),
            receiverUserId: null,
          };

          setIsAudioOnly(audioOnly);
          setActiveCall(call);

          // Clear query params so refresh doesn't trigger another join
          const newParams = new URLSearchParams(searchParams);
          newParams.delete("joinCallId");
          newParams.delete("audioOnly");
          setSearchParams(newParams);
        } catch (err) {
          console.error("Auto-joining call failed:", err);
        }
      };

      autoJoin();
    }
  }, [videoClient, authUser, searchParams, setSearchParams]);

  // Listen for incoming ringing calls
  useEffect(() => {
    if (!videoClient) return;

    const handleCallEvent = () => {
      const calls = videoClient.state.calls;
      // Find an incoming ringing call (not created by me)
      const ringing = calls.find(
        (c) =>
          c.state.callingState === CallingState.RINGING &&
          !c.isCreatedByMe
      );

      if (ringing && !activeCall) {
        setIncomingCall(ringing);
      }
    };

    // Subscribe to call events
    const unsubscribe = videoClient.on("all", handleCallEvent);

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      else if (unsubscribe?.unsubscribe) unsubscribe.unsubscribe();
    };
  }, [videoClient, activeCall]);

  // Called by CallScreen when callingState reaches JOINED (both sides connected)
  const handleCallConnected = useCallback(() => {
    if (callMetaRef.current && !callMetaRef.current.connectedAt) {
      callMetaRef.current.connectedAt = Date.now();
    }
  }, []);

  // Accept incoming call
  const handleAcceptCall = useCallback(async (call, audioOnly = false) => {
    try {
      await call.join();
      // If audio-only, disable camera after joining
      if (audioOnly) {
        try { await call.camera.disable(); } catch { /* ignore */ }
      }

      // Track call metadata (receiver side)
      callMetaRef.current = {
        isAudioOnly: audioOnly,
        isCaller: false,
        connectedAt: Date.now(),
        receiverUserId: null, // not needed for receiver
      };

      setIncomingCall(null);
      setIsAudioOnly(audioOnly);
      setActiveCall(call);
    } catch (err) {
      console.error("Failed to accept call:", err);
      setIncomingCall(null);
    }
  }, []);

  // Reject incoming call
  const handleRejectCall = useCallback(async (call) => {
    try {
      await call.leave({ reject: true });
    } catch (err) {
      console.error("Failed to reject call:", err);
    } finally {
      setIncomingCall(null);
    }
  }, []);

  // When call ends (either side) — compute duration and expose metadata
  const handleCallEnded = useCallback(() => {
    const meta = callMetaRef.current;
    if (meta) {
      const wasAnswered = !!meta.connectedAt;
      const duration = wasAnswered
        ? Math.floor((Date.now() - meta.connectedAt) / 1000)
        : 0;

      setLastEndedCallInfo({
        isAudioOnly: meta.isAudioOnly,
        isCaller: meta.isCaller,
        wasAnswered,
        duration,
        receiverUserId: meta.receiverUserId,
      });
    }

    callMetaRef.current = null;
    setActiveCall(null);
    setIncomingCall(null);
    setIsAudioOnly(false);
  }, []);

  // Allow ChatPage to clear the ended call info after sending the chat message
  const clearLastEndedCallInfo = useCallback(() => {
    setLastEndedCallInfo(null);
  }, []);

  // Exposed to children so ChatPage can start calls
  // audioOnly=true → audio call (camera disabled), audioOnly=false → video call
  const startCall = useCallback(
    async (receiverUserId, receiverName, receiverImage, audioOnly = false) => {
      if (!videoClient || !authUser) return null;

      // Create a unique call ID using sorted user IDs + timestamp for uniqueness
      const callId = `${[authUser._id, receiverUserId].sort().join("-")}-${Date.now()}`;
      const call = videoClient.call("default", callId);

      await call.getOrCreate({
        ring: true,
        data: {
          members: [
            { user_id: authUser._id },
            { user_id: receiverUserId },
          ],
          custom: {
            // Store call type so the receiver knows if it's audio-only
            audioOnly: audioOnly,
          },
        },
      });

      // For audio-only calls, disable camera immediately
      if (audioOnly) {
        try { await call.camera.disable(); } catch { /* ignore */ }
      }

      // Notify target user via push notification
      try {
        await axiosInstance.post("/users/push-notify-call", {
          targetUserId: receiverUserId,
          callId,
          isAudioOnly: audioOnly,
          callerName: authUser.fullName,
        });
      } catch (err) {
        console.error("Failed to send push notification to receiver:", err);
      }

      // Track call metadata (caller side)
      callMetaRef.current = {
        isAudioOnly: audioOnly,
        isCaller: true,
        connectedAt: null, // will be set by handleCallConnected when receiver accepts
        receiverUserId,
      };

      setIsAudioOnly(audioOnly);
      setActiveCall(call);
      return { call, receiverName, receiverImage };
    },
    [videoClient, authUser]
  );

  if (!videoClient) {
    return <>{children}</>;
  }

  return (
    <VideoContext.Provider
      value={{
        videoClient,
        startCall,
        activeCall,
        isAudioOnly,
        setActiveCall,
        handleCallEnded,
        lastEndedCallInfo,
        clearLastEndedCallInfo,
      }}
    >
      <StreamVideo client={videoClient}>
        {children}

        {/* Global incoming call modal — shows on ANY page except settings */}
        {incomingCall && !activeCall && location.pathname !== "/settings" && (
          <IncomingCallModal
            call={incomingCall}
            onAccept={handleAcceptCall}
            onReject={handleRejectCall}
          />
        )}

        {/* Active call overlay — fullscreen on top of everything */}
        {activeCall && (
          <CallScreen
            call={activeCall}
            onCallEnded={handleCallEnded}
            isAudioOnly={isAudioOnly}
            onCallConnected={handleCallConnected}
          />
        )}
      </StreamVideo>
    </VideoContext.Provider>
  );
};

export default StreamVideoProvider;
