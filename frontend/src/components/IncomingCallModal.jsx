import { useEffect, useRef } from "react";
import { PhoneIncoming, PhoneOff, VideoIcon, PhoneIcon } from "lucide-react";

/**
 * WhatsApp-style incoming call modal.
 * Displays caller info with Accept / Decline buttons.
 * Plays a ringtone while visible.
 */
const IncomingCallModal = ({ call, onAccept, onReject }) => {
  const ringtoneRef = useRef(null);

  // Extract caller info from the call object
  const callerUser = call?.state?.createdBy;
  const callerName = callerUser?.name || callerUser?.id || "Unknown";
  const callerImage = callerUser?.image;

  // Detect if this is an audio-only call via custom data
  const isAudioOnly = call?.state?.custom?.audioOnly === true;

  // Play ringtone on mount, stop on unmount
  useEffect(() => {
    try {
      // Use a simple oscillator-based ringtone since we don't have an audio file
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      let intervalId;

      const playRingTone = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      };

      // Ring pattern: two short beeps every 2 seconds
      playRingTone();
      intervalId = setInterval(() => {
        playRingTone();
        setTimeout(() => playRingTone(), 350);
      }, 2000);

      ringtoneRef.current = { ctx, intervalId };

      return () => {
        clearInterval(intervalId);
        ctx.close().catch(() => {});
      };
    } catch {
      // Audio not available — silently skip ringtone
    }
  }, []);

  const handleAccept = async () => {
    // Stop ringtone
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current.intervalId);
      ringtoneRef.current.ctx.close().catch(() => {});
    }
    onAccept?.(call, isAudioOnly);
  };

  const handleReject = async () => {
    // Stop ringtone
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current.intervalId);
      ringtoneRef.current.ctx.close().catch(() => {});
    }
    onReject?.(call);
  };

  return (
    <div className="call-modal-backdrop">
      <div className="call-modal incoming-call-modal">
        {/* Animated rings behind avatar */}
        <div className="call-avatar-ring">
          <div className="call-ring call-ring-1" />
          <div className="call-ring call-ring-2" />
          <div className="call-ring call-ring-3" />
          {callerImage ? (
            <img
              src={callerImage}
              alt={callerName}
              className="call-avatar"
            />
          ) : (
            <div className="call-avatar call-avatar-placeholder">
              {callerName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <h2 className="call-modal-title">
          {isAudioOnly ? "Incoming Audio Call" : "Incoming Video Call"}
        </h2>
        <p className="call-modal-name">{callerName}</p>

        <div className="call-modal-actions">
          <button
            className="call-action-btn call-reject-btn"
            onClick={handleReject}
            title="Decline"
          >
            <PhoneOff size={24} />
          </button>
          <button
            className="call-action-btn call-accept-btn"
            onClick={handleAccept}
            title="Accept"
          >
            {isAudioOnly ? <PhoneIcon size={24} /> : <VideoIcon size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
