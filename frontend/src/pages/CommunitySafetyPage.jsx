import { useCommunity, useCommunityMutation } from "../community/hooks";
import { useState } from "react";
import { CommunityFrame, Feedback, Field, Gate } from "../community/ui";
function Safety() {
  const [cursor, setCursor] = useState(""),
    [notice, setNotice] = useState("");
  const capabilities = useCommunity("/community/capabilities"),
    blocks = useCommunity("/blocks"),
    reports = useCommunity(
      `/moderation/reports?limit=20${cursor ? `&after=${cursor}` : ""}`,
    );
  const jobs = useCommunity("/community/operations", {
    enabled: capabilities.data?.data?.isStaff === true,
  });
  const mutation = useCommunityMutation(() =>
    setNotice(
      "Action saved. Provider access changes may still be synchronizing.",
    ),
  );
  return (
    <CommunityFrame
      title="Safety & reports"
      description="Manage direct-contact blocks and review concerns within your moderation scope."
    >
      <Feedback mutation={mutation} />
      {notice && (
        <p role="status" className="my-4">
          {notice}
        </p>
      )}
      <section>
        <h2 className="text-xl font-semibold">Blocked users</h2>
        <p className="mt-2">
          Blocks stop new direct contact. They do not remove people from shared
          circles.
        </p>
        <Feedback query={blocks} />
        <ul className="divide-y divide-base-300">
          {blocks.data?.data?.map((u) => (
            <li
              className="py-4 flex flex-wrap justify-between gap-3"
              key={u._id}
            >
              <span>{u.fullName}</span>
              <button
                className="btn btn-outline btn-sm"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    path: `/blocks/${u._id}`,
                    method: "delete",
                  })
                }
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
        {blocks.data?.data?.length === 0 && (
          <p className="mt-4">You haven’t blocked anyone.</p>
        )}
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Report queue</h2>
        <p className="mt-2">
          Circle owners and moderators see their circle’s reports. Platform
          staff handle escalations and account sanctions.
        </p>
        <Feedback query={reports} />
        <ul className="divide-y divide-base-300">
          {reports.data?.data?.map((r) => (
            <li className="py-6" key={r.id}>
              <h3 className="font-semibold">
                {r.kind} report · {r.status}
              </h3>
              <p className="mt-3 break-words">{r.reason}</p>
              <details className="mt-3">
                <summary className="cursor-pointer">Recorded evidence</summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm">
                  {JSON.stringify(r.evidence, null, 2)}
                </pre>
              </details>
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  mutation.mutate({
                    path: `/moderation/reports/${r.id}/actions`,
                    body: { action: f.get("action"), note: f.get("note") },
                  });
                }}
              >
                <Field label="Resolution">
                  <select className="select select-bordered" name="action">
                    <option value="resolve">Resolve report</option>
                    <option value="escalate">Escalate to platform staff</option>
                    {r.circleId && r.targetId && (
                      <option value="ban">Ban member from circle</option>
                    )}
                    {capabilities.data?.data?.isStaff && r.targetId && (
                      <>
                        <option value="suspend">Suspend account</option>
                      </>
                    )}
                  </select>
                </Field>
                <Field label="Decision note">
                  <textarea
                    className="textarea textarea-bordered"
                    name="note"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </Field>
                <button
                  className="btn btn-outline"
                  disabled={mutation.isPending}
                >
                  Apply decision
                </button>
              </form>
            </li>
          ))}
        </ul>
        {reports.data?.data?.length === 0 && (
          <p className="mt-4">No reports awaiting your review.</p>
        )}
        <div className="flex gap-3 mt-5">
          {cursor && (
            <button className="btn btn-outline" onClick={() => setCursor("")}>
              First page
            </button>
          )}
          {reports.data?.meta?.nextCursor && (
            <button
              className="btn btn-outline"
              onClick={() => setCursor(reports.data.meta.nextCursor)}
            >
              More reports
            </button>
          )}
        </div>
      </section>
      {capabilities.data?.data?.isStaff && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Account access</h2>
          <p className="mt-2">
            Platform staff can suspend or restore an account. Each change
            requires an audit note.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              mutation.mutate({
                path: `/moderation/users/${f.get("userId")}/status`,
                body: { action: f.get("action"), note: f.get("note") },
              });
            }}
          >
            <Field label="Account user ID">
              <input
                className="input input-bordered"
                name="userId"
                required
                pattern="[a-fA-F0-9]{24}"
              />
            </Field>
            <Field label="Account action">
              <select className="select select-bordered" name="action">
                <option value="restore">Restore account</option>
                <option value="suspend">Suspend account</option>
              </select>
            </Field>
            <Field label="Account audit note">
              <textarea
                className="textarea textarea-bordered"
                name="note"
                required
                minLength={3}
                maxLength={1000}
              />
            </Field>
            <button className="btn btn-outline" disabled={mutation.isPending}>
              Update account access
            </button>
          </form>
        </section>
      )}
      {capabilities.data?.data?.isStaff && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">
            Access synchronization failures
          </h2>
          <Feedback query={jobs} />
          <ul className="divide-y divide-base-300">
            {jobs.data?.data?.map((j) => (
              <li key={j._id} className="py-4">
                <p className="break-all">
                  {j.kind} · {j.circleId || j.userId} · {j.error}
                </p>
                <button
                  className="btn btn-outline btn-sm mt-3"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      path: `/community/operations/${j._id}/retry`,
                    })
                  }
                >
                  Retry synchronization
                </button>
              </li>
            ))}
          </ul>
          {jobs.data?.data?.length === 0 && (
            <p className="mt-4">No failed synchronization jobs.</p>
          )}
        </section>
      )}
    </CommunityFrame>
  );
}
export default function CommunitySafetyPage() {
  return (
    <Gate>
      <Safety />
    </Gate>
  );
}
