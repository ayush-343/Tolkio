import { LoaderIcon } from "lucide-react";
import React from "react";

const ChatLoader = () => {
  return (
    <div className="h-screen flex flex-col items-center justify-center">
      <LoaderIcon className="animate-spin" size={10} color="text-primary" />
      <p className="mt-4 text-center text-lg font-mono">Loading chat...</p>
    </div>
  );
};

export default ChatLoader;
