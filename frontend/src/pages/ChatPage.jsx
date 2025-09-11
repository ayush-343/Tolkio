import React, { useEffect, useState } from "react";
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
  Thread,
  Window,
} from "stream-chat-react";
import "stream-chat-react/dist/css/v2/index.css";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";
import { connectStreamUser, disconnectStreamClient } from "../lib/stream";

import ChatLoader from "../components/ChatLoader.jsx";
import CallButton from "../components/CallButton.jsx";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const ChatPage = () => {
  const { id } = useParams();
  console.log(id);

  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);

  const { authUser } = useAuthUser();
  // Read the site-wide theme from the zustand theme store
  const { theme } = useThemeStore();

  // Map common site themes to Stream Chat theme variants.
  // Assumption: themes like 'dark', 'night', 'dracula', 'black', 'business', 'forest' are visually dark.
  // All other themes default to the light variant. Adjust the list if you use other dark theme names.
  const streamTheme = (() => {
    if (!theme) return "messaging light";
    const t = String(theme).toLowerCase();
    const darkThemes = new Set([
      "dark",
      "night",
      "dracula",
      "black",
      "business",
      "forest",
    ]);
    if (darkThemes.has(t) || t.includes("dark")) return "messaging dark";
    return "messaging light";
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
          tokenData.token
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
            watchErr
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
              tokenData.token
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
    // cleanup on unmount: disconnect if possible and reset the init flag
    return () => {
      // use central helper to cleanup
      disconnectStreamClient().catch(() => {});
    };
  }, [tokenData, authUser, id, tokenLoading]);

  const handleVideoCall = () => {
    if (channel) {
      const callUrl = `${window.location.origin}/call/${channel.id}`; // Example call URL
      // You can implement logic to share this URL with the other user, e.g., via a message in the chat

      channel.sendMessage({
        text: `I've started a video call! Join me here: ${callUrl}`,
      });
      console.log("Initiate video call at:", callUrl);
      toast.error("Video call link sent in chat");
    }
  };

  if (loading || !chatClient || !channel) {
    return <ChatLoader />;
  }

  return (
    <div className="h-[93vh]">
      {/* Chat UI here */}
      <Chat client={chatClient} theme={streamTheme}>
        <Channel channel={channel}>
          <div className="w-full relative">
            <CallButton handleVideoCall={handleVideoCall} />
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput focus />
            </Window>
          </div>
          <Thread />
        </Channel>
      </Chat>
    </div>
  );
};
export default ChatPage;
