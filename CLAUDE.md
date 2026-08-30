# GameReviews

A self-hosted game review site. See [README.md](README.md) for what it does and
how to run it; this file is the conventions.

## Layout

```
backend/src/lib/        pure, tested logic — no Express, no resolver plumbing
backend/src/resolvers/  thin: validate, authorize, delegate to lib/
backend/src/routes/     thin, same rule (auth, embed, export)
backend/src/schema/     the GraphQL SDL
frontend/src/lib/       pure, tested logic — no React
frontend/src/components/ reusable pieces
frontend/src/pages/     one per route
frontend/src/hooks/     shared hooks
frontend/src/contexts/  React context providers
frontend/src/graphql/   query and mutation documents
```

The rule behind it: anything worth a unit test belongs in `lib/`, and `lib/` may
not import from the layers above it. A resolver or a route that grows a rule of
its own is a sign that rule wants to move down.

## Comments

**One or two lines naming an invariant.** Something a reader would otherwise
re-break — why the depth limit is 6, why `nulls: "last"` matters, why `img`
renders alt text instead of an image.

Not: what the code plainly says, what a previous version did, what was measured,
what was considered and rejected, or an argument for the design. That is what
the commit message and the PR body are for, and `git log` keeps it findable
without it going stale in the file.

Where one rule is deliberately implemented twice — the plain-text excerpt in
`frontend/src/lib/markdown.ts` and `embedDescription` in
`backend/src/lib/embed.ts` — say which copy is authoritative, from both ends.

## TypeScript

- `strict`, plus the flags outside it (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and the rest). Both tsconfigs carry the same set.
- **No `any`.** There is none in `src/`, and it should stay that way. `unknown`
  plus a narrowing check instead.
- Non-null assertions are a last resort. There is one in the codebase
  (`remarkSpoiler.ts`, an index bounded by its own loop). Prefer an API that
  models the absence — `charAt(0)` over `[0]`, `?? fallback` over `!`.
- Backend relative imports carry the `.js` extension (NodeNext). Frontend ones
  do not.

## Tests

Vitest on both sides, in `test/` next to `src/`. Named for the behaviour they
pin, not the unit they touch — `review-playtime.test.ts`, not `review.test.ts`.

The backend suite needs a real Postgres; see the dev setup below.

## Formatting and linting

Prettier owns layout, ESLint owns correctness, and neither is a matter of taste
in review. Both run from the repo root:

```bash
npm run format        # write
npm run format:check  # what CI runs
npm run lint
```

An ESLint rule that has to be turned off is turned off **in `eslint.config.js`
with the reason next to it**, never with an inline disable comment.

## Before pushing

```bash
cd backend  && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
npm run format:check && npm run lint
```

Node 22, per `.nvmrc` and the `engines` field.

## Local development

There is a `docker compose up --build` path in the README. On a machine without
Docker, `.claude/devenv.sh` (untracked) provides Postgres and the Prisma engines
from nix.

Two traps worth knowing either way: run `prisma generate` after switching
branches, or the client is the previous branch's and every test fails for the
wrong reason; and reset the database after any checkout that changes
`prisma/migrations`.

## Reviewing

`.claude/skills/review-pr/SKILL.md` is the review bar — what to look for beyond
a green CI run, and how the stacked branches are kept in order.
