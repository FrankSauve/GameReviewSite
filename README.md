# GameReviews

A self-hosted game review site. Search games, score them out of 10, write
reviews, and comment on other people's. Sign-in is delegated to your own
[authentik](https://goauthentik.io) instance, so there are no passwords here.

## Features

- Game search via the [RAWG](https://rawg.io/apidocs) API, imported on demand
- Reviews scored out of 10 in half points, written in Markdown, editable and
  deletable by their author
- Each review records the year the game was played and the hours spent on it, so
  an imported backlog reads by when it was played rather than when it was typed up
- Comments on reviews
- Profile pages with every review and an average score
- Reviewers leaderboard and a paginated recent-reviews feed
- Reviews readable without an account; writing needs one
- OIDC sign-in with 2FA, handled entirely by authentik

## Stack

| Layer | Choice |
| ----- | ------ |
| Frontend | React, Vite, Tailwind CSS |
| API | Apollo Server 5 on Express 5, GraphQL |
| Database | PostgreSQL via Prisma |
| Auth | authentik over OIDC |
| Deployment | Docker Compose, images from GHCR, behind SWAG |

## Quick start

```bash
git clone https://github.com/FrankSauve/GameReviewSite.git
cd GameReviewSite
cp .env.example .env      # set RAWG_API_KEY
docker compose up --build
```

| Service | URL |
| ------- | --- |
| Frontend | <http://localhost:3000> |
| GraphQL API | <http://localhost:4000/graphql> |

There is no identity provider in front of the local stack, so `AUTH_DEV_IDENTITY`
in `.env.example` stands in for a signed-in user. Unset it to browse as an
anonymous visitor. It is ignored whenever `NODE_ENV=production`.

`docker compose watch` rebuilds a service when its sources change.
`docker compose down -v` also removes the database volume.

## Configuration

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `RAWG_API_KEY` | yes | game search |
| `AUTH_DEV_IDENTITY` | local only | fakes a signed-in user, ignored in production |
| `OIDC_ISSUER` | production | per-application issuer URL from authentik |
| `OIDC_CLIENT_ID` | production | |
| `OIDC_CLIENT_SECRET` | production | |
| `OIDC_REDIRECT_URI` | production | must match the provider exactly |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | no | where authentik sends you after sign-out |
| `SESSION_TTL_HOURS` | no | session lifetime, default 720 |
| `CORS_ORIGINS` | no | allowed browser origins, empty in production |
| `TRUST_PROXY_HOPS` | no | proxies in front of the backend, must be exact |
| `AUTH_RATE_LIMIT_MAX` | no | sign-in attempts per minute per IP, default 20 |

All values are documented inline in [`.env.example`](.env.example).

## Deploying

Three services pasted into the compose file that already runs your reverse proxy,
pulling images CI has already built — nothing is cloned or compiled on the server.

- [docs/deployment.md](docs/deployment.md) — the deployment runbook
- [docs/authentik-setup.md](docs/authentik-setup.md) — the authentik objects to create
- [deploy/gamereviews.yml](deploy/gamereviews.yml) — the services
- [deploy/swag/gamereviews.subdomain.conf](deploy/swag/gamereviews.subdomain.conf) — the SWAG configuration

## Development

The backend suite runs HTTP requests through the real Express app against a real
PostgreSQL:

```bash
docker run --rm -d --name gr-test-db -p 5440:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test \
  postgres:16-alpine

cd backend
export DATABASE_URL="postgresql://test:test@127.0.0.1:5440/test"
npx prisma migrate deploy
npm test

docker rm -f gr-test-db
```

The frontend suite needs nothing external:

```bash
cd frontend && npm test
```

CI runs typecheck, tests and build for both workspaces on every pull request,
plus a Prisma schema-drift check and container image builds. Merging to `main`
publishes both images to GHCR. Renovate auto-merges patch and minor updates once
CI is green; majors wait for a human.
