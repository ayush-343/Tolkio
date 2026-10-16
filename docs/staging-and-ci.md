# Staging-first development and manual production promotion

## Branch flow

Develop/push on `staging`, test the staging deployment, then manually merge a
`staging` → `main` pull request. The pipeline does not merge branches or push to
main. Pull requests targeting main must originate from this repository's staging
branch. Feature branches can first target staging.

The repository's existing main CodeQL default setup is preserved. The explicit
CI CodeQL analysis produces a separate SARIF artifact without uploading it over
that setup; a script blocks high/critical security findings and error results.

## Required gates

`Quality gate` requires promotion policy, backend/shared JavaScript syntax checks, Node integration/unit tests, ESLint,
production frontend build, and Playwright desktop/mobile checks to succeed.

`Security gate` requires runtime dependency audit, secret scanning, CodeQL, and
pull-request dependency review. The latter is intentionally skipped on push
events because it compares pull-request dependency changes. Failed, cancelled,
or unexpectedly skipped checks do not satisfy the gates.

- Runtime high/critical dependency advisories block every push/PR check.
- Newly introduced high/critical dependency advisories, including development
  dependencies, block PR dependency review.
- Full dependency audits are exported as artifacts and summarized, including
  existing development/build advisories.
- Gitleaks scans committed changes/history. Generated dependency folders are
  excluded, but credential files are not exempted if accidentally committed.
- Actions are pinned by commit SHA, tokens have restricted job permissions,
  credentials are not persisted by checkout, and jobs have bounded timeouts.
- No production secrets or paid AI model downloads are required for CI.

At setup, runtime audits are clean. Existing Tailwind 3 build dependencies have
high-severity braces-related advisories without compatible patches. Their full
reports remain visible; migrating the Tailwind toolchain needs a separate tested
change. They are not silently represented as resolved. Nodemon was replaced with
Node's built-in watch mode to remove its affected development dependency chain.

## Local checks

```sh
npm ci --include=dev --prefix backend
npm ci --include=dev --prefix frontend
npm test
node scripts/check-backend.mjs
npm run lint --prefix frontend
npm run build --prefix frontend
node scripts/audit-dependencies.mjs
```

For browser tests install Playwright Chromium and run
`npm run test:e2e --prefix frontend`, or on this Mac use
`PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:e2e --prefix frontend`.
`actionlint .github/workflows/ci.yml` validates the workflow locally when installed.

## GitHub repository controls

Main protection should require `Quality gate` and `Security gate`, an up-to-date
pull-request branch, resolved review conversations, and a pull request before
merging. Enforce these rules for administrators too. There is deliberately no
requirement for another person's approval: a solo owner cannot approve their own
PR, and the owner is the requested manual release authority. Disable force
pushes/deletion. Keep repository auto-merge disabled.

Staging may accept ordinary direct pushes so checks can run after each push;
protect it against force pushes/deletion. Requiring pre-existing status checks on
staging pushes would block the workflow the user requested.

## Render staging deployment

Keep the current production Render service on `main`. Create a separate test web
service tracking `staging`, with its own test Mongo database, Stream application,
push configuration, and exact staging FRONTEND_URL. Use `npm run build:render`,
`npm run start`, and health path `/health/ready`. The staging notification worker
must use those same staging resources; see `m0-foundation.md`.

Choose one automatic staging deployment mechanism:

1. Render-managed: enable **After CI Checks Pass** auto-deploy for the staging
   service. Leave `STAGING_DEPLOY_ENABLED` unset/false in GitHub.
2. GitHub-managed: disable Render auto-deploy. Add the staging service deploy hook
   as environment secret `RENDER_STAGING_DEPLOY_HOOK` in GitHub's `staging`
   environment, then set repository variable `STAGING_DEPLOY_ENABLED=true`.
   The `Deploy staging` job triggers that hook only after both gates pass on a
   staging push. A successful trigger means Render accepted deployment; check
   Render health/build logs and exercise the staging site before promotion.

No Render hook is supplied by default, so the optional deployment job is skipped
until configured. No production service is repointed to staging. Do not reuse
production database/provider secrets for test deployments.

After staging tests pass, mark the release PR ready and merge it manually. Main
checks run again. Configure production Render **After CI Checks Pass** as well
so a merge's production build waits for its checks.

### Community beta (M1)

See [M1 staging configuration and manual checks](m1-community.md). Keep
`COMMUNITY_ENABLED=false` until the dedicated Stream channel grants and real SDK
permission tests pass. The existing notification worker also drains community jobs;
configure both web and worker with the same staging cohort/staff variables.
