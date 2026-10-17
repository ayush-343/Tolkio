# Talkio implementation audit — 16 October 2026

## Scope and conclusion

Compared `docs/architecture-and-integration-plan.md` with repository revision
`1723ace03ff9bf54e5d4f20f02f6bc420e28ee61` and the current working tree. This is a
source-code audit plus bounded local verification, not a production penetration
test or certification of provider settings. No production database or private
Render/Stream dashboard was inspected. Application code was not changed.

The repository contains the original authentication, profiles, friends, direct
chat, direct calls, and push features, plus a standalone experimental AI Lab.
It does not yet implement the planned conversation-to-learning community journey.
The AI prototype was built ahead of the plan's M0 → M1 → M2 → M3 dependency order.
Earlier statements that the AI prototype was implemented must not be interpreted
as completion of the entire platform architecture or its release criteria.

Status meanings: **implemented** means a concrete code path exists; **partial**
means a subset exists or important guarantees are missing; **absent** means no
corresponding application model/API/UI workflow was found; **unverified** means
the claim needs operational or physical-device evidence outside this audit.

## Milestone assessment

| Milestone | Assessment | Evidence and missing exit criteria |
|---|---|---|
| M0 Foundation | Partial; exit criteria not met | Existing auth/CSRF and basic input checks remain. Safe serializers, reply/call resource authorization, expiring provider tokens, readiness, graceful API shutdown, and integration/browser tests are missing. |
| M1 Community | Absent | No Circle/Membership models, circle APIs/pages, role administration, invitations, seat reservations, outbox, reconciliation, reports, blocks, or ranked/paginated discovery. Existing friend recommendations are not this milestone. |
| M2 Learning | Absent | No Correction, Phrase, Challenge, Submission, Feedback, QuizVersion, QuizAttempt, or ReviewEvent persistence or learning routes/pages. An AI-generated quiz response is not a quiz system. |
| M3 AI assistance | Partial prototype | Local worker, artifacts, explicit router, five draft tasks, optional jobs/provider, and benchmark UI exist. Quality/device acceptance, full offline startup, reliable evaluation gates, reproducible artifact approvals, complete quotas/spend accounting, and integration tests do not. |
| M4 Speaking | Absent as a group-session feature | Existing direct audio/video calls do not provide scheduled rooms, host admission, capacity rules, attendance, or original-language captions. |
| M5 Translation pilot | Absent | No translated-caption feature flag, provider-event handling, language/locale allowlist, disclosure flow, bounded caption buffer, or cost telemetry. |

## Features genuinely present

- Existing sign-up, login/logout, onboarding, editable profiles, friends and
  friend requests, direct Stream Chat and audio/video calls, push subscription
  storage, and signed Chat webhook verification.
- Authenticated `/ai` route, model selector, opt-in browser download and removal,
  download integrity metadata, and local/server execution choice.
- Local conversation starters, rewrites, correction explanations, short text
  translation, and one multiple-choice quiz draft. These are isolated prompt
  tasks, not integrations with saved messages or learning records.
- Exact WebLLM dependency version, four candidate IDs, one prepared Qwen3 0.6B
  catalog entry, model-file hashing, and a dedicated inference worker.
- Secure-context/WebGPU adapter and feature checks, storage estimate, one active
  generation per runtime, 2,048 context and 256 output-token configuration,
  runtime cancellation, idle release, background interruption while busy, and
  active-call pause. `frontend/src/ai/runtime.js:3` and
  `frontend/src/ai/inference.worker.js:22` implement these paths.
- Explicit server consent field, authenticated job creation, transactional
  request counters, idempotency keys, owner-scoped retrieval, a provider adapter,
  and a separate AI worker entrypoint. See `backend/src/ai/routes.js:20`.
- Benchmark JSON import, task/direction grouping, 50-case execution, manual
  acceptance/baseline verdicts, latency summaries, and JSON export.
- Render build command and deployment guide. These serve public model assets;
  local generation remains browser-side.

These paths existing does not establish real-device compatibility, educational
accuracy, isolation under every failure, or complete deployment validation.

## Foundation findings requiring correction

### F1 — High: public discovery returns private account fields

`backend/src/controllers/user.controller.js:21` fetches complete User documents
and line 28 returns them. `backend/src/models/User.js:19` defines password hashes
without `select:false`; push subscriptions are also part of the same model.
No public serializer or schema serialization transform removes these fields.
The route can therefore expose hashes, emails, push subscription details, and
other private fields to authenticated discovery users. Implement explicit
public/self response allowlists and verify response contents in integration tests.

### F2 — High: login returns the full User document

`backend/src/controllers/auth.controller.js:104` reads the full user, and line 126
returns it after password verification. Signup removes the password separately,
but that does not fix login or create a reusable serializer. Onboarding also
returns the updated full document at line 227. Fix each response via shared
serializers rather than relying on each controller to delete a sensitive field.

### F3 — High: push replies have authentication but no channel authorization

`backend/src/controllers/webhook.controller.js:184` checks channel ID/text and
passes the caller-provided channel to the privileged server sender at line 202.
`backend/src/lib/stream.js:44` sends as the session user. There is no check for
membership, bans, friendship/block state, or permitted channel type. Authentication
alone does not implement the plan's resource authorization guarantee.

### F4 — High: call pushes accept unverified call and recipient information

`backend/src/controllers/user.controller.js:294` accepts target ID, call ID, and
caller display name. It checks a valid target ID but not friendship, blocks,
the call's existence, or actual membership. The caller ID is session-derived,
but the notification text still uses a browser-provided name. Direct calls are
created in `frontend/src/components/StreamVideoProvider.jsx:258`, and DMs are
created/watched in `frontend/src/pages/ChatPage.jsx:125`. The planned authenticated
backend provisioning services and effective provider-grant tests are absent.

### F5 — Webhooks remain synchronous and non-durable

The Chat webhook verifies signatures, which is implemented. However, it resolves
recipients from embedded `channel.members` (`webhook.controller.js:86`), waits for
push delivery at line 166, and responds 200 even on internal errors at line 172.
No WebhookReceipt/OutboxJob records, dedupe identity, durable acknowledgement,
retry queue, or provider-state reconciliation exists. Duplicate events can repeat
notifications; failed processing can be acknowledged without recovery.

### F6 — Provider tokens and client cleanup do not meet the plan

`backend/src/lib/stream.js:29` calls `createToken(userId)` without an expiry.
Chat and Video use a token string rather than a renewable token provider.
The Chat singleton helper exists, and ordinary ChatPage unmount avoids global
disconnect, but its reconnect branch still disconnects the shared client.
`StreamVideoProvider.jsx:91` explicitly has no cleanup, and no Video disconnect
call is present in the component. Its `clientRef` reuse also has no user-ID check.
Add identity-aware lifecycle cleanup and token refresh for both SDKs.

### F7 — API readiness and shutdown are absent

`backend/src/server.js:186` starts listening and only then calls `connectDB()`.
No liveness/readiness endpoints or API SIGTERM drain exist. The AI worker handles
signals, but this does not implement graceful API shutdown or a general job lease
system.

### F8 — Discovery, validation, and response contracts are incomplete

Recommendations filter out self/friends and require onboarding, but have no
language-fit ranking, cursor pagination, or blocked/suspended exclusion. Existing
language arrays are present, but interests, goals, timezone, availability,
correction preferences, account status, and shared BCP-47 normalization are absent.
AI uses handwritten validators; no Zod dependency or general request validation
layer exists. API errors mix plain text, `{message}`, and `{error}` responses;
request IDs and the planned shared error envelope are absent.

## AI implementation gaps and defects

| ID | Finding | Evidence and consequence |
|---|---|---|
| A1 | Benchmark can report success without any latency measurements | `frontend/src/ai/benchmark.js:37` returns null for missing timings, and line 49 compares null to numeric limits. A direct local reproduction with 50 reviewed passing answers and no timings returned `passed:true`, both p95 values null. Require valid timings for every case and reject missing/nonpositive measurements. |
| A2 | Changing the selected model can run the previously loaded model | `AiLabPage.jsx:118` loads only when no manifest exists. The model-selection effect does not release the old runtime. After loading A, selecting an already-downloaded B can still run A. Match both model ID and revision before every load/run. Benchmark reports are also keyed by ID/direction rather than revision. |
| A3 | Artifact preparation is not reproducibly pinned across builds | `scripts/prepare-ai-model.mjs:21` queries the repository's current default revision each run; line 43 downloads the compiled library from the upstream record, whose URL contains a mutable `main`. Files are hashed after retrieval, but there is no approved upstream revision/library-hash lock used as build input. A new build can silently select new bytes. |
| A4 | Render builds erase task approvals | Preparation constructs a manifest from CANDIDATES, whose approvals are empty, then replaces that model's existing catalog entry (`prepare-ai-model.mjs:60–64`). `build:render` reruns preparation on every build. Manually approving a catalog does not survive the next build. Approvals need a separate reviewed artifact-version-bound source. |
| A5 | Full offline app startup is absent | `frontend/public/sw.js` handles push and notification actions, but has no app-shell fetch/cache strategy. AI Lab also fetches authenticated capabilities/catalog on mount. Cached weights and an already-open page are not sufficient for cold offline restart. |
| A6 | Evaluation UI is not a completed evaluation programme | No real 50-case-per-language/task corpus, completed reviewer reports, higher-precision baseline identity, device-class approvals, heat/crash measurements, or network-isolation traces are checked in. Fixture strings in tests are not an educational benchmark. The UI runs only the first 50 per group; further batches require a new suite. |
| A7 | Ordinary users remain blocked on all current local combinations | The prepared catalog has empty approvals; only evaluator mode bypasses the approval matrix (`runtime.js:50`). This is consistent with the original gated rollout, but a later desire for public opt-in experimental use has not been implemented. Adding arbitrary IDs is not a public opt-in flow. |
| A8 | Server request limits are not the planned cost/quiz controls | `backend/src/ai/routes.js:39` enforces a global request count and 20 requests/user/day. It has no distinct 2 quizzes/user/day quota, monetary/token budget reservation, actual-usage reconciliation, or UsageEvent ledger. A request-count ceiling must not be described as a numeric spend ceiling. |
| A9 | Structured server quiz output is prompt-only | `backend/src/ai/provider.js:6` sends text instructions but no structured response schema. Post-generation quiz shape validation exists, but language accuracy/correctness is not verified. The local path requests json_object rather than a full quiz schema. |
| A10 | Server job durability is narrower than the shared worker architecture | `worker.js:15` atomically claims jobs and has a timeout/stale-running failure policy, which is useful. It has no general leases/renewal, retry schedule, outbox, inspectable dead-letter service, or reconciliation. Avoiding automatic retry of uncertain billed inference is intentional and should be retained. |
| A11 | Quota, provenance, and consent have incomplete UI lifecycle | No quota balance/reset UI. The server-consent checkbox remains checked across subsequent submissions, though it is described as consent for this request. `controller.current ||= ...` can reuse an aborted controller for subsequent server runs. Fresh controller and request-specific consent are needed. |
| A12 | Logout/account switch leaves unscoped React Query resources | `useLogout.js:12` releases local runtime and disconnects Chat, but only invalidates authUser. `AiLabPage.jsx:34` uses shared aiModels cache including account capabilities; streamToken and other query keys are also not user-scoped. Clear private resources and namespace queries by account. |
| A13 | Background release is partial | `runtime.js:7` releases only when the document becomes hidden while busy. An idle loaded model remains until its idle timer expires; background timer throttling can delay it. This differs from the document's unconditional background-release wording. |
| A14 | GPU-loss and cache recovery are not demonstrated end to end | Worker errors and request timeouts exist, but there is no explicit GPU-device-loss recovery test. Integrity verifies the canonical downloaded files, while existing WebLLM secondary-cache hits are not all reverified by Talkio on every read. Verify eviction, secondary-cache corruption, cancellation, and GPU loss with actual browser tests. |
| A15 | Shared quiz submission/publication does not exist | `/ai/validate-draft` returns an unpublished shape-validated object, but AI Lab does not call that endpoint and there is no save, ownership, host review, or publish service. This endpoint is a validation primitive, not an integrated workflow. |

The current one-question draft is narrower than the plan's maximum of ten
questions, but a maximum is not a requirement to generate ten. No authoritative
AI grading or certification exists, consistent with the plan. The local router
does not silently fall back to the server; this important boundary is implemented
in `frontend/src/ai/router.js:4`.

## Features not implemented at all

| Domain | Missing complete feature/workflow |
|---|---|
| Communities | Circle discovery/detail/chat pages; create/archive circles; listed/invite-only visibility; 50-member cap; membership lifecycle; role/ownership transfers; invitations; joining/leaving; bans; provider synchronization and reconciliation. |
| Moderation | Reports, scoped moderator queue, platform sanctions, block records/enforcement, audit trails, mute/mention policies for group pushes. |
| Corrections | Message-attached suggestions, correction preference, original-author acceptance, source hashes/revisions, stale/deleted-source invalidation. The AI explain task does not supply this workflow. |
| Phrasebooks | Save a phrase from a message/correction, private storage, due reviews, 1/3/7/14/30-day schedule, retry-safe review updates, personal progress. |
| Assignments | Host prompts, publication/closure, due dates, owned submissions/resubmissions, revision-bound peer feedback and helpful marks. |
| Quizzes | Manual authoring, personal/circle persistence, host-reviewed AI drafts, immutable published versions, learner-safe answer-key serializers, server scoring, attempts/retakes, accent-aware matching. |
| Message translations | Message action, authorized source lookup, access-bound cache, edit/delete invalidation, save-phrase integration. Standalone text translation in AI Lab is present. |
| Speaking sessions | Scheduling, UTC/timezone display, host admission, 8-person cap, reservations, speaker permissions, group audio rooms, attendance from signed Video events. |
| Captions | Original-language captions, translated captions, provider-specific locale matrix, consent disclosures, revisions/deduplication, bounded buffers, cost monitoring. |
| Shared asynchronous infrastructure | OutboxJob, WebhookReceipt, provider retries, per-circle serialization, lease renewal, reconciliation, dead-letter management, durable notification events. |
| Lifecycle and operations | Account deletion workflow/provider cleanup, restore-tested backup tooling/evidence, queue/provider-drift metrics, request-ID logging, alerts, load tests, staging permission tests, migration/backfill tools. Dashboard-only controls remain unverified. |
| Future native apps | No Android/iOS projects, MLC native adapters, GGUF/LiteRT artifacts, or native packaging. This is deliberately future scope, not a requirement for this PWA milestone. |

The backend model inventory contains User, FriendRequest, AIJob, and AIBudget.
No persisted learning/community/moderation entities listed above were found.
`frontend/src/App.jsx:81` routes only home, notifications, direct chat, friends,
settings, and AI Lab inside the authenticated area.

## API coverage

Actual new versioned endpoints are implemented in `backend/src/ai/routes.js`:

- `GET /api/v1/capabilities`
- `GET /api/v1/ai/models`
- `POST /api/v1/ai/validate-draft`
- `POST /api/v1/ai/jobs`
- `GET /api/v1/ai/jobs/:id`

All planned versioned discovery, circles/members/invitations, direct-conversation
provisioning, message corrections/translations, phrases/reviews,
challenges/submissions/feedback, quizzes/publication/attempts,
sessions/admission, reports/blocks, and moderation APIs are absent.

The catalog endpoint actually returns all four candidates with an availability
flag, rather than only prepared artifacts as the document says. This is a minor
document/API mismatch; it usefully allows disabled candidates in the selector.
The document also sketches generateLearningContent while the implementation
exposes runTask. Consolidate the documentation around the actual shared contract.

## Verification performed and limitations

- `npm test`: 9/9 passing tests, across three AI unit-test files.
- `npm run lint --prefix frontend`: fails with 8 errors in sw.js,
  CallStatusMessage.jsx, IncomingCallModal.jsx, StreamVideoProvider.jsx, push.js,
  and ChatPage.jsx. These are existing failures; no fixes were made in this audit.
- Direct benchmark-gate reproduction confirms A1: 50 accepted baseline-reviewed
  cases with missing timings produce passed:true and null p95 measurements.
- No Supertest backend API suite, replica-set transaction/concurrency suite,
  React interaction suite, Playwright journey suite, or CI workflow was found.
- The tests verify validators, prompt wrapping, approval matching, manifests,
  aliases, and summary examples. They do not execute a WebGPU model, prove
  prompt-injection resistance, exercise real runtime cancellation, or verify
  resource authorization. A passing wrapper test does not establish model safety.
- No physical Android/iOS benchmark, deployment/provider-grant validation,
  cost experiment, backup restoration, or staging load run was performed.
- Git still tracks 2,749 backend/node_modules paths; the working tree contains
  pre-existing dependency deletions and OS metadata changes. Preserve those
  changes and handle dependency tracking in a separate reviewed cleanup.

## Recommended implementation order

1. Finish M0 first: public/self serializers, push-reply and call authorization,
   backend provisioning boundaries, bounded renewable tokens, identity-aware
   client cleanup, readiness/shutdown, and API regression/security tests.
2. Correct AI prototype reliability before inviting more evaluators: missing
   timing gate, selected-model/revision matching, build-time artifact locks and
   approval persistence, consent/controller lifecycle, cache isolation/recovery.
3. Build M1 with circles/members, desired-state outbox/provisioning, role and
   capacity rules, reporting/blocking, and ranked discovery. Verify effective
   Stream grants using unauthorized browser-client tests.
4. Build M2 with corrections → phrases → practice, assignments/peer feedback,
   manual quizzes/versioning/server scoring. Verify the complete journey with
   AI disabled.
5. Complete M3 using real reviewed multilingual datasets, baseline provenance,
   approved device classes, privacy/offline/GPU-loss tests, and meaningful server
   spend/usage controls if server assistance is enabled. Integrate AI drafts into
   the learning workflows instead of treating the Lab as those features.
6. Build M4 and then M5 after provider enablement is verified. Keep native apps
   and live translated audio as separate later work.

The next release should not be described as the planned community/learning
platform until M0–M2 are implemented and verified. The accurate current label is
existing direct communication app plus an experimental on-device AI Lab.

## M1 implementation follow-up

The original sections above are the pre-M0/M1 snapshot. Community models, APIs,
transactional membership/outbox synchronization, group-chat pages, discovery,
blocking, reporting, moderation, and group notification routing have since been
implemented on staging. See [M1 implementation and release gates](m1-community.md)
for the exact supported behavior and remaining real-provider/device verification.
M2 learning workflows, M4 group sessions, and further AI work remain separate.
