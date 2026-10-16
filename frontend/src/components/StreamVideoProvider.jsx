import { VideoContext } from './video-context';
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  StreamVideo,
  StreamVideoClient,
  CallingState,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import toast from "react-hot-toast";

import useAuthUser from "../hooks/useAuthUser";
import { tokenProviderFor } from '../lib/provider-tokens';
import { registerVideoSession, disconnectVideoSession } from '../lib/video-session';
import IncomingCallModal from "./IncomingCallModal";
import CallScreen from "./CallScreen";
import { axiosInstance } from "../lib/axios";
import { registerServiceWorkerAndSubscribe } from "../lib/push";
import { localRuntime } from "../ai/runtime";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

// Context so child components can access the video client & start calls


/**
 * Global StreamVideo provider.
 * - Initialises the video client once per authenticated user.
 * - Listens for incoming ringing calls on **every page**.
 * - Renders <IncomingCallModal> or <CallScreen> as overlays.
 * - Tracks call metadata (duration, type) for chat status messages.
 */
const StreamVideoProvider = ({ children }) => {
  const { authUser } = useAuthUser();
  const userId = authUser?._id;
  const userName = authUser?.fullName;
  const userImage = authUser?.profilePic;
  const [videoClient, setVideoClient] = useState(null);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active call (either outgoing that we started, or incoming that we accepted)
  const [activeCall, setActiveCall] = useState(null);
  // Whether the active call is audio-only (no video)
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  // Incoming ringing call (before accept/reject)
  const [incomingCall, setIncomingCall] = useState(null);

  // On-device generation competes with video for GPU and battery resources.
  useEffect(() => {
    localRuntime.setCallActive(Boolean(activeCall));
    return () => localRuntime.setCallActive(false);
  }, [activeCall]);

  // Call metadata for building chat status messages after a call ends
  const callMetaRef = useRef(null);
  const [lastEndedCallInfo, setLastEndedCallInfo] = useState(null);

  // Track whether push was already registered (prevent re-registering on every render)
  const pushRegisteredRef = useRef(false);
  // Track the client instance to avoid re-creating on React effect re-runs
  const clientRef = useRef(null);

  useEffect(() => {
    if (!userId || !STREAM_API_KEY) return;
    const client = new StreamVideoClient({
      apiKey: STREAM_API_KEY,
      user: { id: userId, name: userName, image: userImage },
      tokenProvider: tokenProviderFor(userId, 'video'),
    });
    clientRef.current = client;
    registerVideoSession(client);
    setVideoClient(client);
    return () => {
      if (clientRef.current === client) clientRef.current = null;
      pushRegisteredRef.current = false;
      callMetaRef.current = null;
      setVideoClient(null);
      setActiveCall(null);
      setIncomingCall(null);
      disconnectVideoSession(client).catch(() => {});
    };
  }, [userId, userName, userImage]);

  // Register push notifications once when videoClient is set up
  useEffect(() => {
    if (videoClient && !pushRegisteredRef.current) {
      pushRegisteredRef.current = true;
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
      void audioParam;

      const autoJoin = async () => {
        try {
          const { data: { data: authorized } } = await axiosInstance.get(`/v1/calls/${encodeURIComponent(joinCallId)}/authorize`);
          const audioOnly = authorized.audioOnly;
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
          toast.error(err.response?.data?.message || "This call is unavailable.");
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
      const { data: { data: authorized } } = await axiosInstance.get(`/v1/calls/${encodeURIComponent(call.id)}/authorize`);
      audioOnly = authorized.audioOnly;
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
      toast.error(err.response?.data?.message || "This call is unavailable.");
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

      const { data: { data: provisioned } } = await axiosInstance.post('/v1/calls/direct',
        { targetUserId: receiverUserId, audioOnly },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } });
      const callId = provisioned.callId;
      const call = videoClient.call("default", callId);
      await call.get();

      // For audio-only calls, disable camera immediately
      if (audioOnly) {
        try { await call.camera.disable(); } catch { /* ignore */ }
      }

      // Notify target user via push notification (fire-and-forget)
      axiosInstance.post("/users/push-notify-call", {
        targetUserId: receiverUserId,
        callId,
        isAudioOnly: audioOnly,
      }).catch((err) => {
        console.error("Failed to send push notification to receiver:", err);
      });

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
