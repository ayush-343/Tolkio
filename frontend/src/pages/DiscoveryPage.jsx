import { useCommunity, useCommunityMutation } from "../community/hooks";
import { useState } from "react";
import { CommunityFrame, Feedback, Field, Gate } from "../community/ui";
import { axiosInstance } from "../lib/axios";
function Discovery() {
  const [cursor, setCursor] = useState(""),
    [reporting, setReporting] = useState(null),
    [notice, setNotice] = useState("");
  const query = useCommunity(
      `/discovery/partners?limit=20${cursor ? `&after=${cursor}` : ""}`,
    ),
    profile = useCommunity("/community/profile");
  const mutation = useCommunityMutation(() => {
    setReporting(null);
    setNotice("Saved.");
  });
  const [requestError, setRequestError] = useState(""),
    [sending, setSending] = useState(null);
  const sendRequest = async (id) => {
    setSending(id);
    setRequestError("");
    try {
      await axiosInstance.post(`/users/friend-request/${id}`);
      setNotice("Friend request sent.");
    } catch (error) {
      setRequestError(
        error.response?.data?.message ||
          "Could not send request. Please try again.",
      );
    } finally {
      setSending(null);
    }
  };
  return (
    <CommunityFrame
      title="Find a conversation partner"
      description="Start with reciprocal language matches, then explore interests you share."
    >
      <Feedback query={query} />
      <Feedback mutation={mutation} />
      {notice && <p role="status">{notice}</p>}
      {requestError && <p role="alert">{requestError}</p>}
      <details className="mb-6 bg-base-200 rounded-xl p-5">
        <summary className="cursor-pointer font-semibold">
          Your interests and availability
        </summary>
        <Feedback query={profile} />
        {profile.data && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              mutation.mutate({
                path: "/community/profile",
                method: "patch",
                body: {
                  interests: f
                    .get("interests")
                    .split(",")
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                  availability: f.getAll("availability"),
                },
              });
            }}
          >
            <Field label="Interests (comma separated, up to 10)">
              <input
                className="input input-bordered"
                name="interests"
                defaultValue={profile.data.data.interests.join(", ")}
              />
            </Field>
            <fieldset>
              <legend className="font-medium">Usually available</legend>
              <div className="flex flex-wrap gap-4 mt-3">
                {["weekday", "weekend", "morning", "afternoon", "evening"].map(
                  (v) => (
                    <label className="flex gap-2 items-center" key={v}>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        name="availability"
                        value={v}
                        defaultChecked={profile.data.data.availability.includes(
                          v,
                        )}
                      />
                      {v}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <button className="btn btn-primary" disabled={mutation.isPending}>
              Save preferences
            </button>
          </form>
        )}
      </details>
      <ul className="divide-y divide-base-300">
        {query.data?.data?.map((user) => (
          <li key={user._id} className="py-6">
            <div className="flex flex-wrap justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold break-words">
                  {user.fullName}
                </h2>
                <p className="mt-2">{user.reasons.join(" · ")}</p>
                <p className="mt-2">
                  Speaks {user.nativeLanguage || "not specified"} · learning{" "}
                  {user.learningLanguage || "not specified"}
                </p>
              </div>
              <button
                className="btn btn-primary"
                disabled={sending === user._id}
                onClick={() => sendRequest(user._id)}
              >
                {sending === user._id ? "Sending…" : "Send friend request"}
              </button>
            </div>
            <p className="max-w-prose mt-3 break-words">{user.bio}</p>
            <details className="mt-4">
              <summary className="cursor-pointer">
                Invite ID and safety controls
              </summary>
              <p className="break-all mt-3">User ID: {user._id}</p>
              <p className="mt-2 text-sm">
                Blocking prevents new direct contact. Shared circle
                conversations remain visible.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  className="btn btn-outline btn-sm"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ path: `/blocks/${user._id}` })
                  }
                >
                  Block user
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setReporting(user._id)}
                >
                  Report user
                </button>
              </div>
            </details>
            {reporting === user._id && (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate({
                    path: "/reports",
                    body: {
                      kind: "user",
                      targetId: user._id,
                      reason: new FormData(e.currentTarget).get("reason"),
                    },
                  });
                }}
              >
                <Field label="What happened?">
                  <textarea
                    name="reason"
                    className="textarea textarea-bordered"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </Field>
                <button
                  className="btn btn-outline"
                  disabled={mutation.isPending}
                >
                  Submit report
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setReporting(null)}
                >
                  Cancel
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {query.data?.data?.length === 0 && (
        <p className="py-8">
          No more partners to show. Update your language profile or check back
          later.
        </p>
      )}
      <div className="flex gap-3 mt-6">
        {cursor && (
          <button className="btn btn-outline" onClick={() => setCursor("")}>
            Back to first page
          </button>
        )}
        {query.data?.meta?.nextCursor && (
          <button
            className="btn btn-outline"
            onClick={() => setCursor(query.data.meta.nextCursor)}
          >
            More partners
          </button>
        )}
      </div>
    </CommunityFrame>
  );
}
export default function DiscoveryPage() {
  return (
    <Gate>
      <Discovery />
    </Gate>
  );
}
