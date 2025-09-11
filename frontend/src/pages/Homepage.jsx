import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  getOutgoingFriendReqs,
  getRecommendedUsers,
  getUserFriends,
  sendFriendRequest,
} from "../lib/api";
import {
  CheckCircleIcon,
  MapPinIcon,
  User,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router";

import FriendCard from "../components/FriendCard.jsx";
import { getLanguageFlag } from "../lib/flags.jsx";
import NoFriendsFound from "../components/NoFriendsFound.jsx";
import { capitalize } from "../lib/utils.js";

const HomePage = () => {
  const queryClient = useQueryClient();
  const [outgoingRequestsIds, setOutgoingRequestsIds] = useState(new Set()); // State to hold outgoing request IDs

  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: recommendedUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["recommendedUsers"],
    queryFn: getRecommendedUsers,
  });

  // Ensure we always work with an array (API might return an object like { users: [...] } or { data: [...] })
  const recommendedList = Array.isArray(recommendedUsers)
    ? recommendedUsers
    : Array.isArray(recommendedUsers?.users)
    ? recommendedUsers.users
    : Array.isArray(recommendedUsers?.data)
    ? recommendedUsers.data
    : [];

  const { data: outgoingFriendReqs } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs, // Replace with your data fetching function
  });

  const { mutate: _sendRequestMutation, isPending: _isPending } = useMutation({
    mutationFn: sendFriendRequest, // Replace with your mutation function
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] });
    },
  }); // Custom hook for sending friend requests

  // Update outgoingRequestsIds whenever outgoingFriendReqs changes
  useEffect(() => {
    const outgoingIds = new Set();
    if (outgoingFriendReqs && outgoingFriendReqs.length > 0) {
      outgoingFriendReqs.forEach((req) => {
        outgoingIds.add(req.recipient._id);
      });
      setOutgoingRequestsIds(outgoingIds);
    }
  }, [outgoingFriendReqs]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className=" container mx-auto space-y-10">
        <div className="flex flex-row sm:flow-row items-start justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Your Friends
          </h2>
          <Link
            to="/notifications"
            className="btn btn-outline btn-sm rounded-full flex "
          >
            <UsersIcon className="mr-2 size-4" />
            Friend Requests
          </Link>
        </div>
        {loadingFriends ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg">
              Loading friends...
            </span>
          </div>
        ) : friends.length === 0 ? (
          <NoFriendsFound />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
            {friends.map((user) => (
              <FriendCard key={user._id ?? user.id} friend={user} />
            ))}
          </div>
        )}

        {/* Recommended Users Section */}
        <section>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Recommended Users
              </h2>
              <p className="text-sm text-gray-500">
                Discover new friends you may know.
              </p>
            </div>
          </div>
          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg">
                Loading recommended users...
              </span>
            </div>
          ) : recommendedList.length === 0 ? (
            <div className="card bg-base-200 p-6 text-center">
              <h3 className="text-lg font-semibold mb-2">
                No Recommendation Available
              </h3>
              <p className="text-base-content opacity-65">
                Check back later for new user recommendations!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-6">
              {recommendedList.map((user) => {
                const _hasRequestBeenSent = outgoingRequestsIds.has(user._id);
                return (
                  <div
                    key={user._id}
                    className="card bg-base-200 hover:shadow-lg transition-all duration-300"
                  >
                    <div className="card-body p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="avatar size-16 rounded-full">
                          <img src={user.profilePic} alt={user.fullName} />
                        </div>

                        {/* User Info and Location */}
                        <div>
                          <h3 className="font-semibold text-lg">
                            {user.fullName}
                          </h3>
                          {user.location && (
                            <div className="flex item-center text-xs opacity-70 mt-1">
                              <MapPinIcon className="size-3 mr-1" />{" "}
                              {user.location || "Unknown"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* LANGUAGES WITH FLAGS */}
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-secondary">
                          {getLanguageFlag(user.nativeLanguage)} Native:{" "}
                          {capitalize(user.nativeLanguage)}
                        </span>
                        <span className="badge badge-outline">
                          {getLanguageFlag(user.learningLanguage)} Learning:{" "}
                          {capitalize(user.learningLanguage)}
                        </span>
                      </div>

                      {/* USER BIO */}
                      {user.bio && (
                        <p className="text-sm opacity-70">{user.bio}</p>
                      )}

                      {/* ACTION BUTTONS */}
                      <button
                        className={`btn w-full mt-2 ${
                          _hasRequestBeenSent ? "btn-disabled" : "btn-primary"
                        }`}
                        onClick={() => {
                          if (!_hasRequestBeenSent) {
                            _sendRequestMutation(user._id);
                          }
                        }}
                        disabled={_hasRequestBeenSent || _isPending}
                      >
                        {_hasRequestBeenSent ? (
                          <>
                            <CheckCircleIcon className="size-4 mr-2" />
                            Request Sent
                          </>
                        ) : (
                          <>
                            <UserPlusIcon className="size-4 mr-2" />
                            Send Friend Request
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomePage;
