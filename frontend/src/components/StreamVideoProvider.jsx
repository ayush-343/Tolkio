import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
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

    const client = new StreamVideoClient({
      apiKey: STREAM_API_KEY,
      user,
      token: tokenData.token,
    });

    setVideoClient(client);

    return () => {
      client.disconnectUser().catch(() => {});
      setVideoClient(null);
    };
  }, [authUser, tokenData]);

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

        {/* Global incoming call modal — shows on ANY page */}
        {incomingCall && !activeCall && (
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
