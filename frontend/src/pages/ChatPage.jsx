import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useThemeStore } from "../store/useThemeStore.js";
import { axiosInstance } from "../lib/axios";
import { tokenProviderFor } from "../lib/provider-tokens";

import {
  Channel,
  ChannelHeader,
  Chat,
  MessageList,
  MessageInput,
  MessageSimple,
  Thread,
  Window,
} from "stream-chat-react";
import "stream-chat-react/dist/css/v2/index.css";
import toast from "react-hot-toast";
import { connectStreamUser } from "../lib/stream";
import { useVideoClient } from "../components/video-context";

import ChatLoader from "../components/ChatLoader.jsx";
import CallButton from "../components/CallButton.jsx";
import OutgoingCallModal from "../components/OutgoingCallModal.jsx";
import CallStatusMessage from "../components/CallStatusMessage.jsx";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

/**
 * Custom message renderer that intercepts call_status messages
 * and renders them as WhatsApp-style call status bubbles.
 */
const CustomMessage = (props) => {
  const { message } = props;

  // If this message has call_status data, render the call status bubble
  if (message?.call_status) {

    return (
      <CallStatusMessage
        message={message}
        isMyMessage={props.isMyMessage ?? false}
      />
    );
  }

  // Otherwise, use the default message component
  return <MessageSimple {...props} />;
};

const ChatPage = () => {
  const { id } = useParams();

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatError, setChatError] = useState("");

  // Outgoing call state (for showing "Calling..." modal)
  const [isCalling, setIsCalling] = useState(false);
  const [callReceiver, setCallReceiver] = useState(null);
  const [callIsAudioOnly, setCallIsAudioOnly] = useState(false);

  const { authUser } = useAuthUser();
  // Read the site-wide theme from the zustand theme store
  const { theme } = useThemeStore();
  // Get the video calling functions from global StreamVideoProvider
  const { startCall, activeCall, handleCallEnded, lastEndedCallInfo, clearLastEndedCallInfo } = useVideoClient() || {};

  // Map common site themes to Stream Chat theme variants.
  // Assumption: themes like 'dark', 'night', 'dracula', 'black', 'business', 'forest' are visually dark.
  // All other themes default to the light variant. Adjust the list if you use other dark theme names.
  const streamTheme = (() => {
    if (!theme) return "str-chat__theme-light";
    const t = String(theme).toLowerCase();
    const darkThemes = new Set([
      "dark",
      "night",
      "dracula",
      "black",
      "business",
      "forest",
    ]);
    if (darkThemes.has(t) || t.includes("dark")) return "str-chat__theme-dark";
    return "str-chat__theme-light";
  })();

  useEffect(() => {
    let cancelled = false;
    let watchedChannel;
    const initChat = async () => {
      setLoading(true);
      setChatError("");
      try {
        const { data: { data: conversation } } = await axiosInstance.post('/v1/conversations/direct', { targetUserId: id });
        if (cancelled) return;
        const client = await connectStreamUser(STREAM_API_KEY, authUser, tokenProviderFor(authUser._id));
        if (cancelled) return;
        watchedChannel = client.channel(conversation.channelType, conversation.channelId);
        await watchedChannel.watch();
        if (cancelled) { await watchedChannel.stopWatching(); return; }
        setChatClient(client);
        setChannel(watchedChannel);
      } catch (error) {
        if (!cancelled) setChatError(error.response?.data?.message || "Could not open this conversation. Confirm you are still friends and try again.");
      } finally { if (!cancelled) setLoading(false); }
    };
    if (authUser && id) initChat();
    return () => {
      cancelled = true;
      watchedChannel?.stopWatching().catch(() => {});
    };
  }, [authUser, id]);

  // When the activeCall ends (detected by StreamVideoProvider), hide the outgoing modal
  useEffect(() => {
    if (!activeCall && isCalling) {
      setIsCalling(false);
      setCallReceiver(null);
      setCallIsAudioOnly(false);
    }
  }, [activeCall, isCalling]);

  // Send a call status message to chat when a call ends (caller only)
  useEffect(() => {
    if (!lastEndedCallInfo || !channel || !lastEndedCallInfo.isCaller) {
      // If not the caller, just clear the info
      if (lastEndedCallInfo && !lastEndedCallInfo.isCaller) {
        clearLastEndedCallInfo?.();
      }
      return;
    }

    const sendCallStatus = async () => {
      const { isAudioOnly: audioOnly, duration, wasAnswered } = lastEndedCallInfo;
      const callType = audioOnly ? "audio" : "video";
      const typeLabel = audioOnly ? "Voice" : "Video";
      const status = wasAnswered ? "completed" : "missed";

      const fallbackText = wasAnswered
        ? `${typeLabel} call`
        : `Missed ${typeLabel.toLowerCase()} call`;

      try {
        await channel.sendMessage({
          text: fallbackText,
          call_status: {
            type: callType,
            status,
            duration: duration || 0,
          },
        });
      } catch (err) {
        console.error("Failed to send call status message:", err);
      }

      clearLastEndedCallInfo?.();
    };

    sendCallStatus();
  }, [lastEndedCallInfo, channel, clearLastEndedCallInfo]);

  // Shared call initiation logic for both audio and video
  const initiateCall = useCallback(async (audioOnly) => {
    if (!channel || !startCall || !authUser) return;

    const targetUserId = id;
    if (!targetUserId) return;

    try {
      // Get the other member's info from the channel state for display
      const members = Object.values(channel.state.members || {});
      const otherMember = members.find((m) => m.user_id !== authUser._id || m.user?.id !== authUser._id);
      const receiverName = otherMember?.user?.name || otherMember?.user?.id || targetUserId;
      const receiverImage = otherMember?.user?.image || null;

      setCallReceiver({ name: receiverName, image: receiverImage });
      setCallIsAudioOnly(audioOnly);
      setIsCalling(true);

      await startCall(targetUserId, receiverName, receiverImage, audioOnly);
    } catch (error) {
      console.error(`Failed to start ${audioOnly ? 'audio' : 'video'} call:`, error);
      toast.error("Could not start the call. Please try again.");
      setIsCalling(false);
      setCallReceiver(null);
      setCallIsAudioOnly(false);
    }
  }, [channel, startCall, authUser, id]);

  // WhatsApp-style: ring the other user for video call
  const handleVideoCall = useCallback(() => initiateCall(false), [initiateCall]);

  // WhatsApp-style: ring the other user for audio call
  const handleAudioCall = useCallback(() => initiateCall(true), [initiateCall]);

  // Cancel outgoing call
  const handleCancelCall = useCallback(async () => {
    if (activeCall) {
      try {
        await activeCall.leave();
      } catch {
        // ignore
      }
    }
    handleCallEnded?.();
    setIsCalling(false);
    setCallReceiver(null);
    setCallIsAudioOnly(false);
  }, [activeCall, handleCallEnded]);

  if (chatError) return <section className="mx-auto max-w-xl p-6" role="alert"><h1 className="text-xl font-semibold">Conversation unavailable</h1><p className="mt-3 text-base-content/80">{chatError}</p><Link className="btn btn-primary mt-5" to="/friends">Back to friends</Link></section>;
  if (loading || !chatClient || !channel) {
    return <ChatLoader />;
  }

  return (
    <div className="h-[93vh]">
      {/* Chat UI here */}
      <Chat client={chatClient} theme={streamTheme}>
        <Channel channel={channel} Message={CustomMessage}>
          <div className="w-full relative">
            <CallButton handleVideoCall={handleVideoCall} handleAudioCall={handleAudioCall} />
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>

      {/* Outgoing call modal — "Calling..." overlay */}
      {isCalling && callReceiver && !activeCall?.state?.callingState?.includes?.("JOINED") && (
        <OutgoingCallModal
          receiverName={callReceiver.name}
          receiverImage={callReceiver.image}
          isAudioOnly={callIsAudioOnly}
          onCancel={handleCancelCall}
        />
      )}
    </div>
  );
};
export default ChatPage;
