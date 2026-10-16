# M1 community implementation and staging release

M1 adds listed/invite-only circles, 50-seat transactional membership, invitations,
owner/moderator roles, ownership transfer, Stream group chat, ranked partner
matching, blocks, report queues, staff sanctions, and group notifications. All
onboarded accounts in the enabled cohort can create circles. Local AI, DMs, and
calls retain their existing routes.

## Render staging configuration

Keep production on `main`. Apply these only to the separate staging web service
and notification/community worker, using the same isolated staging database and
Stream application for both:

| Variable | Initial value |
| --- | --- |
| `COMMUNITY_ENABLED` | `false` |
| `COMMUNITY_BETA_USERS` | Comma-separated Mongo user IDs; `*` only for the broader beta |
| `COMMUNITY_STAFF_IDS` | Comma-separated staff Mongo user IDs; never a frontend variable |
| `PROVIDER_ENVIRONMENT` | `staging`, for explicit provider setup/testing commands |

Retain the existing `MONGO_URI`, session/CSRF keys, Stream keys, VAPID keys,
frontend public keys, and staging `FRONTEND_URL`. Never copy production credentials
into staging. No new paid service or npm dependency is required.

- Build: retain `npm run build:render` when distributing the existing local model.
- Web start: `npm run start`; health: `/health/ready`.
- Worker start: `npm run worker`. The existing worker now also runs community
  outbox jobs and reconciliation. It needs a long-running background-worker
  service; the web service alone does not drain jobs.
- Mongo must support transactions (replica set or sharded deployment). When
  communities are enabled, web and worker startup verify topology and provider
  channel grants before serving/processing community work.

## Provider setup and release gates

The dedicated channel type is `talkio_circle`, using `circle-<MongoId>` IDs.
Owners and moderators hold ordinary provider membership; their elevated powers
exist only in authenticated backend APIs. Client grants must deny channel creation,
membership edits, channel edits, and role assignment, including creator privileges.

With isolated staging credentials in the shell or `backend/.env`, run from the
repository root:

```sh
cd backend
PROVIDER_ENVIRONMENT=staging node ../scripts/configure-circle-provider.mjs --apply
PROVIDER_ENVIRONMENT=staging node ../scripts/verify-circle-provider.mjs --run
```

The setup script changes the staging circle channel type explicitly, never during
build. The verification script creates isolated temporary users/channel and tests
actual SDK member read/send, nonmember denial, client creation/membership/role/edit
denial, and removed-member/former-creator denial. It attempts cleanup afterward.
Record the Stream application, command result, date, and deployed revision.
**These real provider checks have not been run by the implementation's mocked
integration tests.** Existing M0 messaging/Video permission gates still apply;
in particular clients must not create arbitrary DMs/calls or unfreeze channels.

After the provider tests and M0 checks pass, set `COMMUNITY_ENABLED=true` and list
only the development team's IDs in `COMMUNITY_BETA_USERS`; redeploy web and worker.
Run the manual scenarios below, then expand the cohort. Do not merge to production
until CI and these operational checks pass. Main promotion stays manual.

## Manual checks

Use at least three separate browser profiles/accounts, plus a configured staff
account. On both desktop and a physical mobile device:

1. Open **Circles**, create a listed circle, and wait for provisioning. Join with
   a second user. Open group chat in both profiles and exchange messages/replies.
2. Create an invite-only circle. An outsider cannot discover its metadata or
   access its URL/history. Invite a registered user; verify only that user can
   accept. Check expiry using an isolated staging fixture.
3. Promote a moderator. Verify they can edit descriptive fields and remove/ban
   ordinary members, but cannot promote themselves, remove the owner, or change
   other moderators. Transfer ownership, then leave with the previous owner.
4. Remove/ban a member while their chat is open. Verify REST access immediately
   fails, provider access closes after synchronization, and refresh/SDK requests
   cannot recover history. Stop/restart the worker around a join/removal and
   verify pending state converges without duplicate membership or seat changes.
5. Mention a member and post a moderator announcement. Verify browser push opens
   `/circles/<id>/chat`. Ordinary unmentioned messages should not push. Mute the
   circle, block the sender, and ban the recipient; repeat to verify suppression.
6. Find partners and verify reciprocal matching, pagination, and safe public
   fields. Block a partner: discovery and direct contact must fail while shared
   circle membership remains intact. Confirm provider-level DM sends are denied,
   not merely hidden in the UI; unblock and verify synchronization.
7. Report a message/circle/user. Only the appropriate circle moderators or
   platform staff see it. Escalate, resolve, ban, and test staff suspension. Edit
   or delete the source message and verify recorded report evidence remains.
8. Archive a circle; group chat closes. Simulate a provider outage and inspect
   pending/error states; staff can inspect failed jobs and requeue them from
   **Safety & reports** after fixing the underlying configuration.

## Operational behavior and limits

Mutations carry 24-hour user/route-scoped idempotency keys; conflicting bodies are
rejected. Seat changes, membership state, audit events, and synchronization jobs
commit together. Jobs use renewable leases and retries at approximately
1/5/30/120/600 seconds; six failures enter the inspectable failure queue. Circles
also have a synchronization lease; current desired state wins over old jobs.
Reconciliation runs every five minutes, including provider-only membership drift.

Removing/banning immediately denies application access, attempts immediate Stream
revocation, and remains pending if the provider is unavailable. Provider access
cannot be claimed revoked until confirmation. Safety jobs reconcile blocks, freeze
existing direct channels, end matching calls, and apply account sanctions; shared
circle visibility remains independent of direct-contact blocks.

Completed community jobs expire after seven days; failed jobs remain for operator
review. Announcement text is removed from its job after delivery. Idempotency
records expire after 24 hours. Report evidence/audit events remain restricted and
are retained for operator review; define and execute a formal retention policy
before a public launch. Messages remain in Stream rather than a duplicate archive.

Rollback: disable community flags and pause community processing if incompatible
worker code is reverted. Existing additive records remain. Disabling a feature
flag alone does not revoke already-issued SDK access; preserve pending revocation
jobs and reconcile provider state before re-enabling. Never restore banned
membership as a rollback shortcut.

## Automated validation boundaries

Node integration tests use a Mongo replica set and provider mocks for concurrency,
transactions, privacy, role boundaries, retries, reconciliation, report scoping,
blocks, legacy accounts, and notification selection. Desktop/mobile browser tests
exercise real rendered UI with mocked APIs, including safe chat-authorization
failure; they do not establish successful real Stream chat or physical-device push.
Real SDK checks and physical-device/manual scenarios remain staging release gates.
