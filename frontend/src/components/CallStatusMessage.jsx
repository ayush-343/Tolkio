import { PhoneIcon, VideoIcon, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";

/**
 * Formats seconds into a human-readable duration.
 * e.g. 125 → "2 min", 45 → "45 sec", 3665 → "1 hr 1 min"
 */
function formatCallDuration(seconds) {
  if (!seconds || seconds < 1) return "0 sec";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) return `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} min`;
  if (mins > 0) return `${mins} min`;
  return `${secs} sec`;
}

/**
 * WhatsApp-style call status bubble rendered inside the chat message list.
 * Detects `message.call_status` custom field and renders accordingly.
 *
 * Usage: Pass as the `Message` prop to stream-chat-react's `MessageList`,
 *        or wrap the default `MessageSimple` component.
 */
const CallStatusMessage = ({ message, isMyMessage }) => {
  const cs = message.call_status;
  if (!cs) return null;

  const isAudio = cs.type === "audio";
  const isMissed = cs.status === "missed";
  const duration = cs.duration || 0;

  // Pick icon based on call direction and status
  const DirectionIcon = isMissed
    ? PhoneMissed
    : isMyMessage
      ? PhoneOutgoing
      : PhoneIncoming;

  const CallTypeIcon = isAudio ? PhoneIcon : VideoIcon;

  const label = isMissed
    ? `Missed ${isAudio ? "voice" : "video"} call`
    : `${isAudio ? "Voice" : "Video"} call`;

  const timestamp = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={`call-status-row ${isMyMessage ? "call-status-mine" : ""}`}>
      <div className={`call-status-bubble ${isMissed ? "call-status-missed" : ""}`}>
        {/* Icon circle */}
        <div className={`call-status-icon ${isMissed ? "call-status-icon-missed" : "call-status-icon-ok"}`}>
          <CallTypeIcon size={18} />
        </div>

        {/* Text */}
        <div className="call-status-text">
          <span className="call-status-label">{label}</span>
          <span className="call-status-duration">
            {isMissed ? "Tap to call back" : formatCallDuration(duration)}
          </span>
        </div>

        {/* Timestamp */}
        <span className="call-status-time">{timestamp}</span>
      </div>
    </div>
  );
};

export default CallStatusMessage;
export { formatCallDuration };
