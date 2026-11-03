# Team Standup

Weekly-update and meeting app, multi-project; first project is Harbour Lab (7 researchers, 2 professors). Spec: [docs/SPEC.md](docs/SPEC.md). Releases and migrations: [docs/MAINTAINING.md](docs/MAINTAINING.md). 

## Stack
Cloudflare Worker (Hono, `src/worker`) + D1 (`migrations/`) + React/Vite client (`src/client`). Shared logic and types live in `src/shared` and stay pure, so they are unit-tested.

## Commands
- `npm run dev` runs client and API on localhost as `.dev.vars` `DEV_USER`; the `x-dev-user` header switches persona.
- `npm run db:reset:local` rebuilds the local database with demo data.
- `npm test` (Vitest: unit + Workers integration), `npm run typecheck`, `npm run e2e` (Playwright).
- `npm run deploy` deploys. Alex runs the account steps in MAINTAINING.

## Rules
Tags: [hook] enforced by `.claude/hooks/guard.mjs`, [script] by tests, [judgment] by review.
- C1 [hook] CLAUDE.md stays at or under 350 words.
- C2 [hook] Committed migrations are immutable. Add a new numbered file.
- C3 [hook] Client colours come only from `src/client/styles/tokens.css`, with light and dark values.
- C4 [hook] No scratch files in the project. Use the session scratchpad.
- C5 [script] `npm run check` passes before every commit. Report every failure.
- S1 [hook] `DEV_USER` never appears in `wrangler.jsonc`.
- S2 [judgment] Write routes take ownership from `me(c)`, never from the request body.
- S3 [script] Uploads are only avatar photos (≤1 MB) and one figure per person per meeting, magic-byte checked.
- S4 [script] Private "needs input" items reach only the two people involved (filtered server-side).
- S5 [script] Admin-only routes check `is_admin`; badges stay pilot (prof) only.
- S6 [script] Project data lives under `/api/p/:pid` and reaches only that project's active members.
- S7 [script] `TRIAL_SWITCHER` is on only for `*-trial` databases.
- M1 [script] User-visible changes add a line under "Unreleased" in CHANGELOG.md.
- F1 [script] Badges are light-hearted skills, never rankings.
- F2 [judgment] Nothing invites people to leave the meeting early.
- F3 [judgment] Timer and sound stay gentle and optional.
- U1 [judgment] Check UI changes in the built-in browser at 1440px and 375px; no console errors.
- U2 [hook] No native `confirm`/`prompt`/`alert`; use `useAsk()` from `src/client/ask.tsx`.
