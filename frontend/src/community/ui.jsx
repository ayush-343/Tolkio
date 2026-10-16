import { cloneElement, useId } from "react";
import { Link } from "react-router-dom";
import { communityError } from "./api";
import { useCommunity } from "./hooks";
export function Feedback({ query, mutation }) {
  if (query?.isLoading)
    return (
      <p role="status" className="py-8">
        Loading community…
      </p>
    );
  const error = query?.error || mutation?.error;
  if (!error) return null;
  return (
    <div role="alert" className="my-4 rounded-xl bg-base-200 p-4">
      <p>{communityError(error)}</p>
      {query && (
        <button
          className="btn btn-outline btn-sm mt-3"
          onClick={() => query.refetch()}
        >
          Try again
        </button>
      )}
    </div>
  );
}
export function CommunityFrame({ title, description, children }) {
  return (
    <section className="mx-auto w-full max-w-5xl min-w-0 p-4 sm:p-8 community-surface">
      <nav aria-label="Community" className="flex flex-wrap gap-4 mb-8 text-sm">
        <Link className="link" to="/circles">
          Circles
        </Link>
        <Link className="link" to="/discover">
          Find partners
        </Link>
        <Link className="link" to="/community/safety">
          Safety & reports
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight break-words">
        {title}
      </h1>
      {description && <p className="mt-3 max-w-prose">{description}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
export function Gate({ children }) {
  const query = useCommunity("/community/capabilities");
  if (query.isLoading || query.error)
    return (
      <CommunityFrame title="Community">
        <Feedback query={query} />
      </CommunityFrame>
    );
  if (!query.data?.data?.available)
    return (
      <CommunityFrame title="Community beta">
        <p>
          Circles are being tested with an invited cohort. Your existing chats
          and friends remain available.
        </p>
        <Link to="/friends" className="btn btn-primary mt-5">
          Go to friends
        </Link>
      </CommunityFrame>
    );
  return children;
}
export function Field({ label, children }) {
  const generated = useId(),
    id = children.props.id || generated;
  return (
    <div className="form-control gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
