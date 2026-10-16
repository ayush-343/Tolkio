# M0 foundation implementation — 16 October 2026

## Implemented locally

- Public and self-profile serializers explicitly allow response fields.
  Passwords are excluded from model queries by default and selected only for
  login verification. Discovery, friends, signup/login, onboarding, and profile
  responses do not return hashes or push subscription credentials.
- Zod contracts bound authentication/profile/onboarding fields and privileged
  communication inputs. Legacy route and response shapes remain compatible.
  Object-ID route parameters are validated and authentication endpoints have a
  separate request limiter.
- User account status and private blocked-user references are checked before
  privileged direct communication. Existing documents without accountStatus are
  treated as active. This is enforcement infrastructure, not a moderation UI.
- Backend `POST /api/v1/conversations/direct` preserves sorted legacy DM IDs.
  Mutual friendship and block/status checks precede provider operations. Existing
  channel membership and bans are checked before privileged replies. The browser
  watches the returned channel rather than creating membership itself.
- Backend `POST /api/v1/calls/direct` provisions a two-member call with a
  server-derived creator and request key. Request-key/body mismatches are rejected.
  `GET /api/v1/calls/:id/authorize` verifies current membership and relationship
  before browser join. Call pushes validate the actual call and derive display
  name and audio/video type from trusted state.
- Chat and Video tokens expire after one hour. Each SDK receives a refreshing
  token provider; token responses are not cacheable and identify their owner.
- Chat connections are serialized across consumers/account switches. Video
  cleanup leaves calls and disconnects the client. Logout clears private query
  resources, authentication view, CSRF state, and local inference state.
- Signed Chat message webhooks persist unique receipts before acknowledgement.
  Storage failures return 503, duplicate deliveries return success, and raw
  message text is not persisted in jobs. A notification worker rechecks the
  authoritative channel, message author/source, membership, blocks, and bans.
  It uses atomic leases, renewal, bounded retry delays, and inspectable failed
  records. Push delivery remains at least once; stable notification tags reduce
  duplicate display but do not promise exactly-once delivery.
- HTTP startup waits for Mongo and required indexes. `/health/live` and
  `/health/ready` distinguish process health from readiness. SIGTERM/SIGINT drain
  HTTP connections and disconnect Mongo. Missing API/model paths return JSON
  errors instead of the frontend HTML.
- Frontend authorization failures have a visible recovery action. Impeccable
  informed this scoped change; desktop/mobile layouts are checked with browser
  screenshots and a mechanical UI scan. Existing lint blockers were resolved.
- API integration tests use an isolated in-memory MongoDB replica set and mocked
  provider adapters. Browser tests cover auth/account-switch state and denied DM
  recovery at desktop/mobile widths. CI runs tests, lint, build, and browser checks.

## Running and checking

```sh
npm install --include=dev --prefix backend
npm install --include=dev --prefix frontend
npm test
npm run lint --prefix frontend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

On a Mac with Chrome installed, use
`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:e2e --prefix frontend` from the
repository root. The isolated Mongo test downloads a MongoDB binary on first use;
it does not connect to the configured production database. Browser tests mock
app API responses and deliberately disable live Stream clients. They establish
UI behavior, not real provider-grant enforcement or media compatibility.

For local development, run backend and frontend dev scripts as before, and run
`npm run worker` in a third terminal for durable message pushes. The worker loads
`backend/.env` through the backend npm command. AI server assistance remains a
separate optional worker; it is not required for on-device inference.

## Render rollout requirements

1. Keep the web service build command `npm run build:render` and start command
   `npm run start`; set the readiness health-check path to `/health/ready`.
2. Deploy a notification worker process from the same revision using root command
   `npm run worker`. It needs the same Mongo, Stream server, and VAPID settings;
   it does not need frontend model downloads or an AI provider key. A standalone
   worker build can use `npm ci --omit=dev --prefix backend` from repository root.
3. Bring the worker up with the new API revision. Once the new webhook handler
   is deployed, push jobs remain queued until this worker runs. Chat messages and
   calls still use Stream directly, but push delivery depends on this worker.
4. Inspect `webhookreceipts` for stuck/failed records and provider delivery errors.
   No general queue-administration UI or metrics/alerts dashboard is included yet.

No production service settings, provider grants, deployment, or paid resources
were changed by this local implementation.

## Release gate still requiring staging evidence

Backend provisioning alone cannot prevent a browser from using an ordinary
Stream token directly. Before public rollout, configure and test effective
provider permissions in the staging Stream application:

- Ordinary Chat users must not create channels, invite users, or mutate
  memberships/roles. Member reads/writes should remain allowed as intended.
- Ordinary Video users must not create calls or change memberships. Join/read
  permissions must be member-scoped and account bans enforced.
- Attempt these forbidden operations from an independent client with an ordinary
  user token and verify rejection, then exercise authorized legacy DMs, token
  expiry/refresh, incoming/outgoing audio/video calls, notification replies, and
  removal during a provider outage.
- Check desktop, Android, and iOS behavior with the staging application and real
  permissions. Keep these tests distinct from the deterministic CI mocks.
- One-hour tokens do not revoke already-issued perpetual tokens. Review provider
  token revocation/cutover settings before claiming existing sessions are bounded.

These are external verification/deployment gates. M0's implementation and mocked
regression checks are present; the full production exit criterion remains pending
until the staging provider tests and deployment checks pass.

## Scope retained for later milestones

Ranked cursor-based discovery, language-code normalization, circles and group
membership/outbox reconciliation, moderator/block administration, learning
records, and caption sessions remain M1/M2/M4/M5 work. The notification worker is
a durable foundation for direct-message pushes, not a completed circle outbox.
The AI defects identified in the dated implementation audit remain a separate
M3 reliability task; M0 does not claim educational evaluation or mobile GPU gates.
