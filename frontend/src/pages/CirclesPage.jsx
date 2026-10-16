import { useCommunity, useCommunityMutation } from "../community/hooks";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowRight } from "lucide-react";
import { LANGUAGES } from "../../../shared/languages";
import { CommunityFrame, Feedback, Field, Gate } from "../community/ui";
function Circles() {
  const [creating, setCreating] = useState(false),
    [cursor, setCursor] = useState(""),
    [language, setLanguage] = useState("");
  const query = useCommunity(
    `/circles?limit=20${cursor ? `&after=${cursor}` : ""}${language ? `&languageCode=${language}` : ""}`,
    { poll: true },
  );
  const invitations = useCommunity("/community/invitations");
  const navigate = useNavigate();
  const mutation = useCommunityMutation((circle) =>
    navigate(`/circles/${circle.id}`),
  );
  const create = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      path: "/circles",
      body: {
        name: form.get("name"),
        description: form.get("description"),
        languageCode: form.get("languageCode"),
        visibility: form.get("visibility"),
        minLevel: form.get("minLevel"),
        maxLevel: form.get("maxLevel"),
        topics: form
          .get("topics")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      },
    });
  };
  return (
    <CommunityFrame
      title="Find your practice circle"
      description="Small communities, shared interests, and more reasons to keep talking."
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <Field label="Practice language">
          <select
            className="select select-bordered"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setCursor("");
            }}
          >
            <option value="">All languages</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="btn btn-primary"
          onClick={() => setCreating(!creating)}
        >
          <Plus size={18} />
          {creating ? "Close creation form" : "Create a circle"}
        </button>
      </div>
      {creating && (
        <form
          onSubmit={create}
          className="mt-6 rounded-xl bg-base-200 p-5 space-y-4"
        >
          <h2 className="text-xl font-semibold">
            Start a conversation worth returning to
          </h2>
          <Field label="Circle name">
            <input
              name="name"
              className="input input-bordered"
              required
              minLength={3}
              maxLength={80}
            />
          </Field>
          <Field label="What will you practice?">
            <textarea
              name="description"
              className="textarea textarea-bordered"
              required
              maxLength={1000}
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Practice language">
              <select name="languageCode" className="select select-bordered">
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Who can join?">
              <select name="visibility" className="select select-bordered">
                <option value="listed">Listed · anyone in the beta</option>
                <option value="invite_only">
                  Invite only · invited members
                </option>
              </select>
            </Field>
            {["minLevel", "maxLevel"].map((name, index) => (
              <Field
                key={name}
                label={index ? "Highest level" : "Starting level"}
              >
                <select
                  className="select select-bordered"
                  name={name}
                  defaultValue={index ? "C2" : "A1"}
                >
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Field label="Topics (comma separated, up to 8)">
            <input
              className="input input-bordered"
              name="topics"
              placeholder="Travel, everyday conversation"
            />
          </Field>
          <p>Up to 50 members. Messages are visible only to members.</p>
          <Feedback mutation={mutation} />
          <button className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create circle"}
          </button>
        </form>
      )}
      <Feedback query={invitations} />
      {!!invitations.data?.data?.length && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">You’re invited</h2>
          <ul className="divide-y divide-base-300">
            {invitations.data.data.map((i) => (
              <li
                key={i.circleId}
                className="py-4 flex flex-wrap gap-3 justify-between"
              >
                <span>
                  {i.name} · expires{" "}
                  {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <Link className="link" to={`/circles/${i.circleId}`}>
                  Review invitation
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Feedback query={query} />
      <ul className="mt-6 divide-y divide-base-300">
        {query.data?.data?.map((circle) => (
          <li key={circle.id} className="py-6">
            <div className="flex flex-wrap justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold break-words">
                  <Link
                    className="link link-hover"
                    to={`/circles/${circle.id}`}
                  >
                    {circle.name}
                  </Link>
                </h2>
                <p className="mt-2">
                  {LANGUAGES.find((l) => l.code === circle.languageCode)
                    ?.label || circle.languageCode}{" "}
                  · {circle.minLevel}–{circle.maxLevel} · {circle.memberCount}
                  /50 members
                </p>
              </div>
              <Link className="btn btn-outline" to={`/circles/${circle.id}`}>
                Explore circle
                <ArrowRight size={16} />
              </Link>
            </div>
            <p className="mt-3 max-w-prose break-words">{circle.description}</p>
            {circle.membership && (
              <p className="mt-3 text-sm">
                Your membership: {circle.membership.state}
              </p>
            )}
          </li>
        ))}
      </ul>
      {query.data?.data?.length === 0 && (
        <div className="py-12">
          <h2 className="text-xl font-semibold">
            There’s room for a new circle
          </h2>
          <p className="mt-2">
            Try another language or start a circle around something you enjoy.
          </p>
        </div>
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
            More circles
          </button>
        )}
      </div>
    </CommunityFrame>
  );
}
export default function CirclesPage() {
  return (
    <Gate>
      <Circles />
    </Gate>
  );
}
