import { useCommunityMutation } from "../community/hooks";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Chat,
  Channel,
  ChannelHeader,
  MessageList,
  MessageInput,
  Thread,
  Window,
  MessageSimple,
} from "stream-chat-react";
import "stream-chat-react/dist/css/v2/index.css";
import { useMessageContext } from "stream-chat-react";
import useAuthUser from "../hooks/useAuthUser";
import { useThemeStore } from "../store/useThemeStore";
import { tokenProviderFor } from "../lib/provider-tokens";
import { connectStreamUser } from "../lib/stream";
import { communityGet, communityError } from "../community/api";
import { CommunityFrame, Feedback, Field, Gate } from "../community/ui";
function ReportableMessage(props) {
  const { message } = useMessageContext();
  const { id } = useParams();
  const [reporting, setReporting] = useState(false);
  const mutation = useCommunityMutation(() => setReporting(false));
  return (
    <div>
      <MessageSimple {...props} />
      <div className="px-4 pb-2">
        <button
          className="btn btn-ghost btn-xs"
          aria-label={`Report message ${message.id}`}
          onClick={() => setReporting(!reporting)}
        >
          Report message
        </button>
        {reporting && (
          <form
            className="space-y-2 p-3 bg-base-200 rounded-xl"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                path: "/reports",
                body: {
                  kind: "message",
                  circleId: id,
                  messageId: message.id,
                  reason: new FormData(e.currentTarget).get("reason"),
                },
              });
            }}
          >
            <Field label="Reason for reporting">
              <textarea
                className="textarea textarea-bordered"
                name="reason"
                required
                minLength={5}
                maxLength={1000}
              />
            </Field>
            <Feedback mutation={mutation} />
            <button
              className="btn btn-outline btn-sm"
              disabled={mutation.isPending}
            >
              Submit report
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setReporting(false)}
            >
              Cancel
            </button>
          </form>
        )}
        {mutation.isSuccess && <p role="status">Report submitted.</p>}
      </div>
    </div>
  );
}
function CircleChat() {
  const { id } = useParams(),
    { authUser } = useAuthUser(),
    { theme } = useThemeStore();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false,
      channel;
    setState({ loading: true });
    async function connect() {
      try {
        const { data } = await communityGet(`/circles/${id}/chat`);
        if (cancelled) return;
        const client = await connectStreamUser(
          import.meta.env.VITE_STREAM_API_KEY,
          authUser,
          tokenProviderFor(authUser._id),
        );
        if (cancelled) return;
        channel = client.channel(data.channelType, data.channelId);
        await channel.watch();
        if (cancelled) {
          await channel.stopWatching();
          return;
        }
        setState({ client, channel });
      } catch (error) {
        if (!cancelled) setState({ error: communityError(error) });
      }
    }
    connect();
    return () => {
      cancelled = true;
      channel?.stopWatching().catch(() => {});
    };
  }, [id, authUser]);
  // Refresh backend authorization independently of the provider's live events.
  useEffect(() => {
    if (!state.channel) return;
    const timer = setInterval(() => {
      communityGet(`/circles/${id}/chat`).catch((error) => {
        state.channel.stopWatching().catch(() => {});
        setState({ error: communityError(error) });
      });
    }, 15000);
    const off = state.channel.on((event) => {
      if (
        (event.type === "member.removed" && event.user?.id === authUser._id) ||
        event.type === "channel.deleted"
      )
        setState({ error: "Your access to this conversation has ended." });
    });
    return () => {
      clearInterval(timer);
      off.unsubscribe();
    };
  }, [id, state.channel, authUser._id]);
  if (state.loading)
    return (
      <CommunityFrame title="Opening circle chat">
        <p role="status">Checking membership and connecting…</p>
      </CommunityFrame>
    );
  if (state.error)
    return (
      <CommunityFrame title="Circle chat unavailable">
        <p role="alert">{state.error}</p>
        <Link className="btn btn-primary mt-5" to={`/circles/${id}`}>
          Back to circle
        </Link>
      </CommunityFrame>
    );
  const dark = [
    "dark",
    "night",
    "dracula",
    "black",
    "business",
    "forest",
  ].includes(theme);
  return (
    <div className="min-w-0">
      <Link className="btn btn-ghost m-3" to={`/circles/${id}`}>
        Back to circle
      </Link>
      <div className="h-[calc(100dvh-9rem)]">
        <Chat
          client={state.client}
          theme={dark ? "str-chat__theme-dark" : "str-chat__theme-light"}
        >
          <Channel channel={state.channel} Message={ReportableMessage}>
            <Window>
              <ChannelHeader />
              <MessageList />
              <MessageInput />
            </Window>
            <Thread />
          </Channel>
        </Chat>
      </div>
    </div>
  );
}
export default function CircleChatPage() {
  return (
    <Gate>
      <CircleChat />
    </Gate>
  );
}
