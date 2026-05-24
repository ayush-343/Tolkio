import { useState, useEffect, useRef } from "react";
import {
  StreamCall,
  StreamTheme,
  SpeakerLayout,
  CallControls,
  CallingState,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { PhoneIcon } from "lucide-react";

/**
 * Fullscreen call UI rendered as an overlay.
 * Supports both video calls (SpeakerLayout) and audio-only calls (avatar + timer).
 */
const CallScreen = ({ call, onCallEnded, isAudioOnly = false, onCallConnected }) => {
  return (
    <div className="call-screen-overlay">
      <StreamCall call={call}>
        <CallContent onCallEnded={onCallEnded} isAudioOnly={isAudioOnly} onCallConnected={onCallConnected} />
      </StreamCall>
    </div>
  );
};

const CallContent = ({ onCallEnded, isAudioOnly, onCallConnected }) => {
  const { useCallCallingState, useParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participants = useParticipants();

  // Call timer for audio calls
  const [elapsed, setElapsed] = useState(0);

  // Track whether the call was ever active (RINGING/JOINING/JOINED)
  // so we don't treat the initial IDLE state as "call ended"
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (
      callingState === CallingState.RINGING ||
      callingState === CallingState.JOINING ||
      callingState === CallingState.JOINED
    ) {
      wasActiveRef.current = true;
    }
  }, [callingState]);

  useEffect(() => {
    if (!isAudioOnly || callingState !== CallingState.JOINED) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isAudioOnly, callingState]);

  // Report when both sides are connected (for call duration tracking)
  useEffect(() => {
    if (callingState === CallingState.JOINED) {
      onCallConnected?.();
    }
  }, [callingState, onCallConnected]);

  // Format elapsed seconds as mm:ss
  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // When the call ends (user leaves or other side hangs up)
  // Only trigger if the call was previously active — prevents termination
  // before the call even starts (initial IDLE → RINGING transition)
  if (wasActiveRef.current && (callingState === CallingState.LEFT || callingState === CallingState.IDLE)) {
    // Use a microtask to avoid calling setState during render
    queueMicrotask(() => onCallEnded?.());
    return null;
  }

  // Audio-only call UI: centered avatar + call timer
  if (isAudioOnly) {
    // Get remote participant info (the other person)
    const remoteParticipant = participants.find((p) => !p.isLocalParticipant);
    const name = remoteParticipant?.name || remoteParticipant?.userId || "User";
    const image = remoteParticipant?.image;

    return (
      <StreamTheme>
        <div className="audio-call-screen">
          <div className="audio-call-info">
            {image ? (
              <img src={image} alt={name} className="audio-call-avatar" />
            ) : (
              <div className="audio-call-avatar audio-call-avatar-placeholder">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <h2 className="audio-call-name">{name}</h2>
            <div className="audio-call-status">
              <PhoneIcon size={14} />
              <span>
                {callingState === CallingState.JOINED
                  ? formatTime(elapsed)
                  : "Connecting..."}
              </span>
            </div>
          </div>
          <div className="audio-call-controls">
            <CallControls />
          </div>
        </div>
      </StreamTheme>
    );
  }

  // Video call UI: full speaker layout
  return (
    <StreamTheme>
      <div className="call-screen-content">
        <SpeakerLayout />
        <CallControls />
      </div>
    </StreamTheme>
  );
};

export default CallScreen;
