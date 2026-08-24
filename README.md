# GameReviews

A full-stack game review platform where users can search for games, write reviews, and leave comments.

| Layer          | Choice                          |
| -------------- | ------------------------------- |
| Language       | TypeScript (frontend + backend) |
| GraphQL server | Apollo Server v5 + Express v5   |
| ORM            | Prisma                          |
| Database       | PostgreSQL                      |
| Frontend       | React + Vite + Tailwind CSS     |
| Auth           | authentik forward auth (2FA)    |
| Game data      | RAWG API                        |
| Container      | Docker + Docker Compose         |
| Reverse proxy  | SWAG (nginx) + authentik SSO     |

See [docs/authentik-setup.md](docs/authentik-setup.md) for the authentik and
reverse proxy setup, including 2FA, and
[docs/deployment.md](docs/deployment.md) for deploying behind SWAG.

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

# There is no authentik outpost in front of the local stack, so this fakes a
# signed-in user. Ignored whenever NODE_ENV=production.
AUTH_DEV_IDENTITY=dev-uid:devuser:dev@example.com
```

Reviews are readable without signing in. Writing requires an identity, which in
production comes from authentik and locally comes from `AUTH_DEV_IDENTITY`.

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
