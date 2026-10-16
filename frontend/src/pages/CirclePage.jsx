import { useCommunity, useCommunityMutation } from "../community/hooks";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import useAuthUser from "../hooks/useAuthUser";
import { CommunityFrame, Feedback, Field, Gate } from "../community/ui";
function Circle() {
  const { id } = useParams(),
    { authUser } = useAuthUser();
  const [editing, setEditing] = useState(false),
    [confirm, setConfirm] = useState(null),
    [notice, setNotice] = useState("");
  const query = useCommunity(`/circles/${id}`, { poll: true }),
    circle = query.data?.data;
  const active =
    !query.error &&
    circle?.membership?.state === "active" &&
    circle?.status === "active";
  const manage =
      active && ["owner", "moderator"].includes(circle.membership.role),
    owner = manage && circle.membership.role === "owner";
  const members = useCommunity(`/circles/${id}/members`, {
    enabled: active,
    poll: true,
  });
  const mutation = useCommunityMutation(() => {
    setConfirm(null);
    setNotice("Saved. Access changes may take a moment to synchronize.");
  });
  const write = (path, body = {}, method = "post") => {
    setNotice("");
    mutation.mutate({ path: `/circles/${id}${path}`, body, method });
  };
  const report = useCommunityMutation(() =>
    setNotice("Report submitted for review."),
  );
  if (query.error)
    return (
      <CommunityFrame title="Circle access unavailable">
        <Feedback query={query} />
        <Link className="btn btn-outline mt-4" to="/circles">
          Back to circles
        </Link>
      </CommunityFrame>
    );
  if (!circle)
    return (
      <CommunityFrame title="Circle">
        <Feedback query={query} />
      </CommunityFrame>
    );
  return (
    <CommunityFrame title={circle.name} description={circle.description}>
      <p>
        {circle.languageCode.toUpperCase()} · {circle.minLevel}–
        {circle.maxLevel} · {circle.memberCount}/50 members ·{" "}
        {circle.visibility === "listed" ? "Listed circle" : "Invite only"}
      </p>
      <p className="mt-2">{circle.topics?.join(" · ")}</p>
      <Feedback mutation={mutation} />
      <Feedback mutation={report} />
      {notice && (
        <p role="status" className="my-4">
          {notice}
        </p>
      )}
      {circle.membership?.state === "banned" && (
        <p role="alert" className="my-4">
          Your access to this circle has ended. You cannot join while banned.
        </p>
      )}
      {circle.membership?.state === "joining" && (
        <p role="status" className="my-4">
          You’re joining. Chat opens after membership is confirmed.
        </p>
      )}
      {circle.membership?.state === "removing" && (
        <p role="status" className="my-4">
          You’re leaving. Chat access is closed while removal finishes.
        </p>
      )}
      {(circle.syncPending || circle.status === "provisioning") && (
        <p role="status" className="my-4 rounded-xl bg-base-200 p-4">
          Preparing access. This page updates automatically; you can safely
          return later.
        </p>
      )}
      {circle.syncError && (
        <p role="alert" className="my-4">
          {circle.syncError}
        </p>
      )}
      {circle.status === "archived" ? (
        <p className="my-5">This circle is archived.</p>
      ) : (
        <div className="flex flex-wrap gap-3 my-6">
          {active ? (
            <Link className="btn btn-primary" to={`/circles/${id}/chat`}>
              Open group chat
            </Link>
          ) : (
            !["joining", "removing", "banned"].includes(
              circle.membership?.state,
            ) && (
              <button
                className="btn btn-primary"
                disabled={mutation.isPending || circle.memberCount >= 50}
                onClick={() => write("/join")}
              >
                {circle.memberCount >= 50
                  ? "Circle full"
                  : circle.visibility === "invite_only"
                    ? "Accept invitation"
                    : "Join circle"}
              </button>
            )
          )}
          {active && !owner && (
            <button
              className="btn btn-outline"
              onClick={() =>
                setConfirm({
                  path: "/leave",
                  label: "Leave this circle?",
                  body: {},
                })
              }
            >
              Leave circle
            </button>
          )}
          {manage && (
            <button
              className="btn btn-outline"
              onClick={() => setEditing(!editing)}
            >
              Edit circle
            </button>
          )}
          {owner && (
            <button
              className="btn btn-outline"
              onClick={() =>
                setConfirm({
                  path: "/archive",
                  label: "Archive this circle and close chat access?",
                  body: { version: circle.version },
                })
              }
            >
              Archive circle
            </button>
          )}
        </div>
      )}
      {confirm && (
        <section
          className="my-5 bg-base-200 p-5 rounded-xl"
          aria-label="Confirm action"
        >
          <h2 className="text-lg font-semibold">{confirm.label}</h2>
          <p className="mt-2">
            Membership access will change when you confirm.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              className="btn btn-error"
              disabled={mutation.isPending}
              onClick={() => write(confirm.path, confirm.body, confirm.method)}
            >
              Confirm
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      {editing && manage && (
        <form
          className="space-y-4 my-6"
          key={editing ? "editing" : "closed"}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            write(
              "",
              {
                name: form.get("name"),
                description: form.get("description"),
                topics: form
                  .get("topics")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                version: circle.version,
              },
              "patch",
            );
          }}
        >
          <Field label="Circle name">
            <input
              className="input input-bordered"
              name="name"
              required
              minLength={3}
              maxLength={80}
              defaultValue={circle.name}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="textarea textarea-bordered"
              name="description"
              required
              maxLength={1000}
              defaultValue={circle.description}
            />
          </Field>
          <Field label="Topics">
            <input
              className="input input-bordered"
              name="topics"
              defaultValue={circle.topics.join(", ")}
            />
          </Field>
          <button className="btn btn-primary" disabled={mutation.isPending}>
            Save circle
          </button>
        </form>
      )}
      {active && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Notifications</h2>
          <Field label="Group notifications">
            <select
              className="select select-bordered w-full sm:max-w-sm"
              value={circle.membership.notifications}
              disabled={mutation.isPending}
              onChange={(e) =>
                write("/preferences", { notifications: e.target.value })
              }
            >
              <option value="mentions">
                Mentions and moderator announcements
              </option>
              <option value="muted">Muted</option>
            </select>
          </Field>
        </section>
      )}
      {manage && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Invite a learner</h2>
          <form
            className="flex flex-wrap items-end gap-3 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              write("/invitations", {
                userId: new FormData(e.currentTarget).get("userId"),
              });
            }}
          >
            <Field label="Registered user ID">
              <input
                className="input input-bordered"
                name="userId"
                required
                pattern="[a-fA-F0-9]{24}"
              />
            </Field>
            <button className="btn btn-outline" disabled={mutation.isPending}>
              Send invitation
            </button>
          </form>
          <p className="mt-2 text-sm">
            Invitations expire after seven days. Find a learner’s ID on Find
            partners.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              write("/announcements", {
                text: new FormData(e.currentTarget).get("text"),
              });
            }}
          >
            <Field label="Moderator announcement">
              <textarea
                className="textarea textarea-bordered"
                name="text"
                required
                maxLength={2000}
              />
            </Field>
            <button className="btn btn-outline" disabled={mutation.isPending}>
              Post announcement
            </button>
          </form>
        </section>
      )}
      {active && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Members</h2>
          <Feedback query={members} />
          <ul className="divide-y divide-base-300">
            {members.data?.data?.map((m) => (
              <li className="py-4" key={m.user?._id}>
                <div className="flex flex-wrap gap-3 justify-between">
                  <p className="break-words">
                    {m.user?.fullName || "Unavailable account"} · {m.role} ·{" "}
                    {m.state}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {manage &&
                      m.role !== "owner" &&
                      (owner || m.role === "member") &&
                      m.user?._id !== authUser._id && (
                        <>
                          {m.state === "banned" ? (
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={mutation.isPending}
                              onClick={() =>
                                write(
                                  `/members/${m.user._id}`,
                                  { action: "unban", version: m.version },
                                  "patch",
                                )
                              }
                            >
                              Unban
                            </button>
                          ) : (
                            <>
                              {["remove", "ban"].map((action) => (
                                <button
                                  key={action}
                                  className="btn btn-outline btn-sm"
                                  onClick={() =>
                                    setConfirm({
                                      path: `/members/${m.user._id}`,
                                      method: "patch",
                                      body: { action, version: m.version },
                                      label: `${action === "ban" ? "Ban" : "Remove"} ${m.user.fullName}?`,
                                    })
                                  }
                                >
                                  {action === "ban" ? "Ban" : "Remove"}
                                </button>
                              ))}
                              {owner && m.state === "active" && (
                                <>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    disabled={mutation.isPending}
                                    onClick={() =>
                                      write(
                                        `/members/${m.user._id}`,
                                        {
                                          action: "role",
                                          role:
                                            m.role === "moderator"
                                              ? "member"
                                              : "moderator",
                                          version: m.version,
                                        },
                                        "patch",
                                      )
                                    }
                                  >
                                    {m.role === "moderator"
                                      ? "Remove moderator role"
                                      : "Make moderator"}
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() =>
                                      setConfirm({
                                        path: "/transfer",
                                        body: {
                                          userId: m.user._id,
                                          version: circle.version,
                                        },
                                        label: `Transfer ownership to ${m.user.fullName}?`,
                                      })
                                    }
                                  >
                                    Transfer ownership
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-10 border-t border-base-300 pt-6">
        <h2 className="text-xl font-semibold">Report a concern</h2>
        <form
          className="space-y-3 mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            report.mutate({
              path: "/reports",
              body: {
                kind: "circle",
                circleId: id,
                reason: new FormData(e.currentTarget).get("reason"),
              },
            });
          }}
        >
          <Field label="What happened?">
            <textarea
              className="textarea textarea-bordered"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
            />
          </Field>
          <button className="btn btn-outline" disabled={report.isPending}>
            Report circle
          </button>
        </form>
      </section>
    </CommunityFrame>
  );
}
export default function CirclePage() {
  return (
    <Gate>
      <Circle />
    </Gate>
  );
}
