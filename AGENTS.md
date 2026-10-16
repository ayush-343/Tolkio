# Talkio development guidance

## Staging-first delivery

- Develop and push changes to `staging` (or a feature branch targeting staging).
- Keep `main` unchanged until the user manually merges a staging pull request.
- Run the quality and security gates; never auto-merge or bypass a failed check.
- Use isolated staging databases and provider settings. Production deployment
  remains tied to `main`; test deployments use the `staging` branch.
- See `docs/staging-and-ci.md` for the checks and deployment configuration.

## Frontend development and refinements

The user explicitly requests Impeccable as part of the development cycle and
future interface work in this repository.

- Use the installed `impeccable:impeccable` skill for frontend features, UX/UI
  changes, and refinements. Discover its current SKILL.md location through the
  available skill catalog instead of hardcoding a machine-specific path.
- Follow the skill's context-loading and task-specific guidance. Shape new
  workflows before implementation; preserve the existing identity for scoped
  refinements unless the user requests a redesign.
- Include responsive layouts, keyboard access, readable contrast, clear copy,
  and loading, empty, success, error, offline, and permission states as applicable.
- Verify changed interfaces on desktop and mobile widths. Use the applicable
  audit, hardening, and polish guidance with bounded verification passes; report
  any checks that could not be performed.
- Keep functional validation alongside design review. A visual-quality check
  does not establish backend authorization, AI quality, or production readiness.
- Apply Impeccable to the interface aspects of mixed frontend/backend tasks;
  backend-only changes do not require an unrelated visual redesign.

## Planning references

- Architecture: `docs/architecture-and-integration-plan.md`.
- Implementation gaps: `docs/implementation-audit-2026-10-16.md`. Treat this as a
  dated snapshot and verify findings against current code before acting.
- Local AI deployment: `docs/render-local-ai.md`.

Preserve unrelated working-tree changes and distinguish implemented behavior from
planned features and unverified operational claims.
