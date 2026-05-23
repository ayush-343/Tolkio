import React, { useEffect, useState } from "react";
import { UserCheck, UserPlus, Users, Search, Bell } from "lucide-react";
import { axiosInstance } from "../lib/axios";
import FriendCard from "../components/FriendCard";
import toast from "react-hot-toast";

const FriendsPage = () => {
  const [connections, setConnections] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        axiosInstance.get("/users/friends"),
        axiosInstance.get("/users/friend-requests"),
      ]);
      setConnections(friendsRes.data);
      setPendingRequests(requestsRes.data?.incomingReqs || []);
    } catch (error) {
      console.error("Error fetching friends data:", error);
      toast.error("Failed to load friends");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (requestId) => {
    try {
      await axiosInstance.put(`/users/friend-request/${requestId}/accept`);
      toast.success("Friend request accepted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept");
    }
  };

  const handleDecline = async (requestId) => {
    try {
      await axiosInstance.put(`/users/friend-request/${requestId}/decline`);
      toast.success("Friend request declined");

      // Optimistic update
      setPendingRequests((prev) => prev.filter((req) => req._id !== requestId));
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to decline");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="loading loading-spinner text-primary loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-base-300 pb-6">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl tracking-tight mb-2">
            Your Friends
          </h1>
          <p className="text-base-content/70">
            Manage your language exchange partners.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm">All Languages</button>
          <button className="btn btn-outline btn-sm">Recently Active</button>
        </div>
      </div>

      {/* Search Bar - Optional, matching design */}
      {/* <div className="relative w-full max-w-md hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 size-5" />
                <input type="text" placeholder="Search friends or languages..." className="input input-bordered w-full pl-10 bg-base-200" />
            </div> */}

      {pendingRequests?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2 border-b border-base-300 pb-2">
            <UserPlus className="size-5" /> Pending Requests (
            {pendingRequests.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingRequests.map((req) => (
              <div
                key={req._id}
                className="card bg-base-200 hover:bg-base-300/50 transition-colors border border-base-300"
              >
                <div className="card-body p-4 flex-row items-center gap-4">
                  <div className="avatar">
                    <div className="w-16 rounded-full bg-base-300">
                      {req.sender.profilePic ? (
                        <img
                          src={req.sender.profilePic}
                          alt={req.sender.fullName}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base-content/50">
                          <UserCheck size={24} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">
                      {req.sender.fullName}
                    </h3>
                    <p className="text-xs text-base-content/60 truncate flex items-center gap-1 mb-2">
                      📍 {req.sender.location || "Earth"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {req.sender.nativeLanguages && req.sender.nativeLanguages.length > 0 ? (
                        req.sender.nativeLanguages.map((langObj, idx) => (
                          <span key={`native-${idx}`} className="badge badge-primary badge-sm text-[10px] py-2 uppercase">
                            NATIVE: {langObj.language}
                          </span>
                        ))
                      ) : (
                        req.sender.nativeLanguage && (
                          <span className="badge badge-primary badge-sm text-[10px] py-2 uppercase">
                            NATIVE: {req.sender.nativeLanguage}
                          </span>
                        )
                      )}

                      {req.sender.learningLanguages && req.sender.learningLanguages.length > 0 ? (
                        req.sender.learningLanguages.map((langObj, idx) => (
                          <span key={`learning-${idx}`} className="badge badge-outline badge-sm text-[10px] py-2 border-base-content/30 uppercase">
                            LEARNING: {langObj.language}
                          </span>
                        ))
                      ) : (
                        req.sender.learningLanguage && (
                          <span className="badge badge-outline badge-sm text-[10px] py-2 border-base-content/30 uppercase">
                            LEARNING: {req.sender.learningLanguage}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 ml-auto">
                    <button
                      onClick={() => handleDecline(req._id)}
                      className="btn btn-ghost btn-sm"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAccept(req._id)}
                      className="btn btn-primary btn-sm px-6"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 border-b border-base-300 pb-2">
          <Users className="size-5" /> My Connections (
          {connections?.length || 0})
        </h2>

        {connections?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {connections.map((friend) => (
              <FriendCard key={friend._id} friend={friend} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="size-12 mx-auto text-base-content/30 mb-4" />
            <h3 className="text-lg font-semibold">No connections yet</h3>
            <p className="text-base-content/60">
              Find partners on the home page!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendsPage;
