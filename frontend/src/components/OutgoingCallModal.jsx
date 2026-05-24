import { PhoneOff, PhoneIcon, VideoIcon } from "lucide-react";

/**
 * "Calling..." overlay shown to the caller while waiting for the receiver to pick up.
 * Supports both audio and video calls.
 */
const OutgoingCallModal = ({ receiverName, receiverImage, isAudioOnly, onCancel }) => {
  return (
    <div className="call-modal-backdrop">
      <div className="call-modal outgoing-call-modal">
        {/* Animated rings behind avatar */}
        <div className="call-avatar-ring">
          <div className={`call-ring call-ring-1 ${isAudioOnly ? "call-ring-audio" : ""}`} />
          <div className={`call-ring call-ring-2 ${isAudioOnly ? "call-ring-audio" : ""}`} />
          <div className={`call-ring call-ring-3 ${isAudioOnly ? "call-ring-audio" : ""}`} />
          {receiverImage ? (
            <img
              src={receiverImage}
              alt={receiverName}
              className="call-avatar"
            />
          ) : (
            <div className="call-avatar call-avatar-placeholder">
              {receiverName?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
        </div>

        <div className="call-type-badge">
          {isAudioOnly ? <PhoneIcon size={14} /> : <VideoIcon size={14} />}
          <span>{isAudioOnly ? "Audio Call" : "Video Call"}</span>
        </div>
        <p className="call-modal-subtitle">Calling…</p>
        <h2 className="call-modal-name">{receiverName || "User"}</h2>

        <div className="call-modal-actions">
          <button
            className="call-action-btn call-reject-btn"
            onClick={onCancel}
            title="End Call"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OutgoingCallModal;
