import { BellIcon } from "lucide-react";

const NoNotificationsFound = () => {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center mb-4">
        <BellIcon className="w-8 h-8 text-base-content opacity-40" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Notifications Found</h3>
      <p className="text-base-content opacity-70 max-w-md">
        You have no new notifications at this time.
      </p>
    </div>
  );
};

export default NoNotificationsFound;
