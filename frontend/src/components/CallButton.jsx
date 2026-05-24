import { VideoIcon, PhoneIcon } from "lucide-react";

function CallButton({ handleVideoCall, handleAudioCall }) {
  return (
    <div className="p-3 border-b flex justify-end items-center gap-2 mx-auto w-full absolute top-0 z-10">
      <button
        className="btn btn-info btn-sm flex items-center gap-2"
        onClick={handleAudioCall}
        title="Audio Call"
      >
        <PhoneIcon className="size-5" />
      </button>
      <button
        className="btn btn-success btn-sm flex items-center gap-2"
        onClick={handleVideoCall}
        title="Video Call"
      >
        <VideoIcon className="size-5" />
      </button>
    </div>
  );
}

export default CallButton;
