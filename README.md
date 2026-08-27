# GameReviews

A full-stack game review platform where users can search for games, write reviews, and leave comments.

| Layer          | Choice                          |
| -------------- | ------------------------------- |
| Language       | TypeScript (frontend + backend) |
| GraphQL server | Apollo Server v5 + Express v5   |
| ORM            | Prisma                          |
| Database       | PostgreSQL                      |
| Frontend       | React + Vite + Tailwind CSS     |
| Auth           | authentik via OIDC (2FA)        |
| Game data      | RAWG API                        |
| Container      | Docker + Docker Compose         |
| Images         | GHCR, published by CI           |
| Reverse proxy  | SWAG (nginx)                    |

See [docs/authentik-setup.md](docs/authentik-setup.md) for the authentik and
reverse proxy setup, including 2FA, and
[docs/deployment.md](docs/deployment.md) for deploying behind SWAG.

Deployment is three services pasted into whichever compose file already runs
your reverse proxy — [deploy/gamereviews.yml](deploy/gamereviews.yml) — pulling
images CI has already built. Nothing is cloned or compiled on the server, which
is also what lets an image updater keep it current on its own.

---

## Features

- Search games via the RAWG API and auto-import them into the local database
- Write, edit, and delete reviews (rated out of 10)
- Comment on reviews
- User profile pages showing all reviews and average rating
- Reviewers leaderboard sorted by review count
- Paginated recent reviews feed on the homepage

---

## Running locally with Docker Compose

### 1. Clone and set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
# Get a free API key at https://rawg.io/apidocs
RAWG_API_KEY=your-rawg-api-key-here

# There is no identity provider in front of the local stack, so this fakes a
# signed-in user. Ignored whenever NODE_ENV=production.
AUTH_DEV_IDENTITY=dev-uid:devuser:dev@example.com
```

Reviews are readable without signing in. Writing requires an identity, which in
production comes from an OIDC login against authentik and locally comes from
`AUTH_DEV_IDENTITY`. Unset it to browse locally as an anonymous visitor.

### 2. Start the full stack

```bash
docker compose up --build
```

| Service     | URL                           |
| ----------- | ----------------------------- |
| Frontend    | http://localhost:3000         |
| GraphQL API | http://localhost:4000/graphql |

The backend runs `prisma migrate deploy` on startup, replaying the migrations in
`backend/prisma/migrations`.

To change the schema, edit `backend/prisma/schema.prisma` and generate a
migration:

```bash
cd backend
npm run db:migrate:new -- --name describe_your_change
```

Commit the generated folder. Never edit an applied migration; add a new one.

### 3. Develop with live rebuilds (watch mode)

```bash
docker compose watch
```

Docker Compose will watch for file changes and automatically rebuild and restart the affected service:

| Changed path            | Action                 |
| ----------------------- | ---------------------- |
| `backend/src/**`        | Rebuild backend image  |
| `backend/prisma/**`     | Rebuild backend image  |
| `backend/package.json`  | Rebuild backend image  |
| `frontend/src/**`       | Rebuild frontend image |
| `frontend/index.html`   | Rebuild frontend image |
| `frontend/package.json` | Rebuild frontend image |

### 4. Stop

```bash
docker compose down
```

To also remove the PostgreSQL data volume:

```bash
docker compose down -v
```

---

## Tests

The backend suite runs against a real PostgreSQL — it exercises HTTP requests
through the actual Express app, so the authorization and identity rules are
tested where they are enforced rather than in isolation.

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

What the backend suite covers:

| Area | What it pins down |
| ---- | ----------------- |
| Sign-in flow | a full authorization code exchange against a stub provider whose ID tokens are really RS256-signed: PKCE and scopes are requested, the session is issued, the local row is provisioned from `sub`, and a mismatched `nonce` is refused |
| Session trust | an unknown, tampered, expired, or signed-out session cookie is anonymous, never trusted; the old proxy headers are inert |
| Open redirect | `returnTo` cannot leave the site, including protocol-relative and CRLF forms |
| CSRF | a request naming another origin is refused, session or not |
| Authorization | game mutations require a user; `deleteGame` is gone; nobody can edit or delete another user's review or comment |
| Privacy | email is returned only to its owner |
| Provisioning | idempotent; follows renames; adopts pre-authentik rows; survives username and email collisions |
| Query limits | depth and alias limits reject abusive queries |
| Rate limits | general, RAWG-specific and sign-in buckets each return 429 |

---

## Dependency updates

`renovate.json` configures unattended updates. Patch and minor npm bumps, base
image updates, and security fixes auto-merge once CI is green; majors are
labelled `needs-review` and wait for a human. PostgreSQL majors are held
permanently, because moving from 16 to 17 is a dump-and-restore rather than a
container restart — see [docs/deployment.md](docs/deployment.md).

CI runs on every pull request: typecheck, tests, and build for both workspaces,
plus a Prisma schema-drift check, container image builds, and assertions that
neither image runs as root and that the deployment snippet publishes no ports and
builds nothing from source. Merging to `main` publishes both images to GHCR.
