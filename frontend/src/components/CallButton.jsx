import { VideoIcon } from "lucide-react";

function CallButton({ handleVideoCall }) {
  return (
    <div className="p-3 border-b flex justify-end items-center  mx-auto w-full absolute top-0">
      <button
        className="btn btn-primary btn-success btn-sm flex items-center gap-2  "
        onClick={handleVideoCall}
      >
        <VideoIcon className="size-6" />
        Video Call
      </button>
    </div>
  );
}

export default CallButton;
