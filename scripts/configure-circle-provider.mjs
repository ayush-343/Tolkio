// Explicit, staging-only operation. Never run as part of an application build.
import "../backend/node_modules/dotenv/config.js";
if (
  process.env.PROVIDER_ENVIRONMENT !== "staging" ||
  process.argv[2] !== "--apply"
)
  throw new Error(
    "Use isolated staging credentials, PROVIDER_ENVIRONMENT=staging and --apply.",
  );
const { streamClient } = await import("../backend/src/lib/stream.js");
const { CHANNEL_TYPE, CIRCLE_GRANTS, circleProvider } = await import(
  "../backend/src/communities/provider.js"
);
let existing;
try {
  existing = await streamClient.getChannelType(CHANNEL_TYPE);
} catch (error) {
  if (error.code !== 16 && error.status !== 404 && error.statusCode !== 404)
    throw error;
}
const grants = {
  ...Object.fromEntries(
    Object.keys(existing?.grants || {})
      .filter((role) => role !== "admin")
      .map((role) => [role, []]),
  ),
  ...CIRCLE_GRANTS,
};
const config = {
  grants,
  typing_events: true,
  read_events: true,
  reactions: true,
  replies: true,
  uploads: false,
  max_message_length: 2000,
};
if (existing) await streamClient.updateChannelType(CHANNEL_TYPE, config);
else await streamClient.createChannelType({ name: CHANNEL_TYPE, ...config });
await circleProvider.verify();
console.log(
  "Staging circle grants configured. Real SDK access tests are still required.",
);
