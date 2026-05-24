import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useThemeStore } from "../store/useThemeStore.js";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

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
import { useVideoClient } from "../components/StreamVideoProvider.jsx";

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
    const isMyMessage = message.user?.id === props?.Message?.props?.client?.userID
      || message?.user?.id === message?.channel?.data?.created_by?.id;

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

  // Outgoing call state (for showing "Calling..." modal)
  const [isCalling, setIsCalling] = useState(false);
  const [callReceiver, setCallReceiver] = useState(null);
  const [callIsAudioOnly, setCallIsAudioOnly] = useState(false);

  const { authUser } = useAuthUser();
  // Read the site-wide theme from the zustand theme store
  const { theme } = useThemeStore();
  // Get the video calling functions from global StreamVideoProvider
  const { startCall, activeCall, isAudioOnly, handleCallEnded, lastEndedCallInfo, clearLastEndedCallInfo } = useVideoClient() || {};

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

  const { data: tokenData, isLoading: tokenLoading } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser, // only run if authUser is truthy
  });

  useEffect(() => {
    const initChat = async () => {
      if (!authUser) return;
      // If token query is still loading, skip until it finishes
      if (tokenLoading) return;
      if (!tokenData?.token) {
        console.error("Stream token missing: tokenData=", tokenData);
        toast.error("Chat token missing. Please refresh or re-login.");
        setLoading(false);
        return;
      }
      try {
        console.log("Initializing stream chat client");

        // Create a instance of the chat client
        const targetUserId = id; // The user you want to chat with

        if (!targetUserId) {
          toast.error("No user specified for chat.");
          setLoading(false);
          return;
        }
        // Use centralized stream helper to manage single client lifecycle
        const client = await connectStreamUser(
          STREAM_API_KEY,
          authUser,
          tokenData.token,
        );

        // Create or get a channel ID between the two users
        const channelId = [authUser._id, targetUserId].sort().join("-"); // consistent channel ID for 1-1 chat

        let currentChannel = client.channel("messaging", channelId, {
          // "messaging" is the channel type for 1-1 and group chats
          members: [authUser._id, targetUserId],
        });

        // Listening for incoming changes in the channel
        try {
          await currentChannel.watch();
        } catch (watchErr) {
          console.error(
            "channel.watch failed, attempting one reconnect:",
            watchErr,
          );
          // If the error is due to token/connection, try reconnect once
          try {
            if (typeof client.disconnect === "function")
              await client.disconnect();
            await client.connectUser(
              {
                id: authUser._id,
                name: authUser.fullName,
                image: authUser.avatarUrl,
              },
              tokenData.token,
            );
            // Recreate the channel using the reconnected client
            currentChannel = client.channel("messaging", channelId, {
              members: [authUser._id, targetUserId],
            });
            await currentChannel.watch();
          } catch (retryErr) {
            console.error("Retry after watch failure also failed:", retryErr);
            throw retryErr;
          }
        }

        setChatClient(client);
        setChannel(currentChannel);
        setLoading(false);
      } catch (error) {
        console.error("Error initializing stream chat client:", error);
        toast.error("Failed to load chat. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    initChat();
    // cleanup on unmount for this effect
    return () => {
      // Do not globally disconnect the client here to avoid race conditions during fast navigation.
      // Disconnection should happen on logout.
    };
  }, [tokenData, authUser, id, tokenLoading]);

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
