# Render deployment with browser-local AI

The Render web service serves the app and public model artifacts. Inference runs
in each user's browser, using WebGPU. No AI worker or provider key is required.

## Service settings

- Branch: `main`
- Root Directory: empty (repository root)
- Build Command: `npm run build:render`
- Start Command: `npm run start`
- Pre-Deploy Command: empty

The build installs dependencies, prepares Qwen3 0.6B, then builds the frontend
including model assets. Weights are deliberately excluded from Git. Preparation
downloads about 351 MB plus the compiled model library on each build. Model
initialization and generation happen on users' devices, not on Render.

## Environment

Keep the existing database, Stream, push, authentication, and Vite public-key
variables. Set `NODE_ENV=production` and `FRONTEND_URL` to the exact HTTPS app
origin, without a trailing slash. Add:

```env
AI_MANIFEST_PATH=frontend/public/ai-models/catalog.json
AI_ASSET_BASE_URL=/ai-models/
AI_SERVER_ENABLED=false
AI_BENCHMARK_USERS=<comma-separated MongoDB user IDs of evaluators>
```

Leave `AI_ASSET_ORIGIN` unset for same-origin model hosting. Provider credentials
and server model settings are unnecessary for this local-only configuration.
Save settings and rebuild/deploy the latest commit.

## Smoke test

Sign in as an evaluator and open `/ai`. The prepared Qwen3 model should display
a download size. Download it, choose This device, and run a short rewrite.
The result should be labeled local; there must be no `/api/v1/ai/jobs` request.
After one successful run, keep the page open and test another task with the
browser's network set to Offline. Fresh offline page loads are not yet supported
by app-shell caching.

Task approvals remain empty until reviewed language/task evaluations pass.
Only evaluator IDs bypass these approvals in the AI Lab. Adding everyone to
the evaluator list is not a substitute for the evaluation gates.
