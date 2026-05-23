import React from "react";
import { acceptFriendRequest, getFriendRequests } from "../lib/api.js";
import {
  BellIcon,
  ClockIcon,
  MessageSquareIcon,
  UserCheckIcon,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import NoNotificationsFound from "../components/NoNotificationsFound.jsx";

const NotificationsPage = () => {
  const queryClient = useQueryClient();

  const { data: friendRequests, isLoading } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
  });

  const { mutate: acceptRequestMutation, isLoading: isAccepting } = useMutation(
    {
      mutationFn: acceptFriendRequest,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["friendRequests"] });
        queryClient.invalidateQueries({ queryKey: ["friends"] });
      },
    }
  );

  // Normalize requests to avoid errors if any category is missing
  const incomingRequests = friendRequests?.incomingReqs || [];
  const acceptedRequests = friendRequests?.acceptedReqs || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-4xl space-y-8">
        <h1 className="text-2xl font-semibold sm:text-3xl tracking-tight mb-6">
          Notifications
        </h1>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <>
            {incomingRequests.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold flex item-center gap-2">
                  <UserCheckIcon className="h-5 w-5 text-primary" />
                  Friends Requests
                  <span className="text-sm text-muted-foreground">
                    {incomingRequests.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {incomingRequests.map((request) => (
                    <div
                      key={request._id || request.id}
                      className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="card-body p-4">
                        <div className="flex items-center gap-3">
                          <div className="avatar size-14 rounded-full bg-base-300">
                            <img
                              src={request.sender.profilePic}
                              alt={request.sender.fullName}
                            />
                          </div>
                          <div>
                            <h3 className="font-semibold">
                              {request.sender.fullName}
                            </h3>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {request.sender.nativeLanguages && request.sender.nativeLanguages.length > 0 ? (
                                request.sender.nativeLanguages.map((langObj, idx) => (
                                  <span key={`native-${idx}`} className="badge badge-secondary badge-sm">
                                    Native: {langObj.language}
                                  </span>
                                ))
                              ) : (
                                <span className="badge badge-secondary badge-sm">
                                  Native: {request.sender.nativeLanguage}
                                </span>
                              )}

                              {request.sender.learningLanguages && request.sender.learningLanguages.length > 0 ? (
                                request.sender.learningLanguages.map((langObj, idx) => (
                                  <span key={`learning-${idx}`} className="badge badge-outline badge-sm">
                                    Learning: {langObj.language}
                                  </span>
                                ))
                              ) : (
                                <span className="badge badge-outline badge-sm">
                                  Learning: {request.sender.learningLanguage}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="btn btn-primary btn-sm mt-4 md:mt-0 ml-auto"
                            onClick={() =>
                              acceptRequestMutation(request._id || request.id)
                            }
                            disabled={isAccepting}
                          >
                            {isAccepting ? "Accepting..." : "Accept"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {/* ACCEPTED REQUESTS NOTIFICATIONS */}
            {acceptedRequests.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold flex item-center gap-2">
                  <BellIcon className="h-5 w-5 text-success" />
                  New Connections!
                </h2>
                <div>
                  {acceptedRequests.map((notification) => (
                    <div
                      key={notification._id}
                      className=" card bg-base-200 shadow-sm"
                    >
                      <div className="card-body p-4">
                        <div className="flex items-start gap-3">
                          <div className="avatar mt-1 size-10 rounded-full">
                            <img
                              src={notification.sender.profilePic}
                              alt={notification.sender.fullName}
                            />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {notification.sender.fullName}
                            </h3>
                            <p className="text-sm my-1">
                              {notification.recepient.fullName} New connection
                              request accepted!
                            </p>
                            <p className="text-xs flex item-center opacity-70">
                              <ClockIcon className="size-3 mr-1" />
                              Recently
                            </p>
                          </div>
                          <div className="badge badge-success">
                            <MessageSquareIcon className="size-4 mr-1" />
                            New Friend
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {incomingRequests.length === 0 && acceptedRequests.length === 0 && (
              <NoNotificationsFound />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
