# GameReviews

A full-stack game review platform where users can search for games, write reviews, and leave comments.

| Layer          | Choice                          |
| -------------- | ------------------------------- |
| Language       | TypeScript (frontend + backend) |
| GraphQL server | Apollo Server v5 + Express v5   |
| ORM            | Prisma                          |
| Database       | PostgreSQL                      |
| Frontend       | React + Vite + Tailwind CSS     |
| Auth           | JWT + bcryptjs                  |
| Game data      | RAWG API                        |
| Container      | Docker + Docker Compose         |

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
# Generate a strong secret with: openssl rand -hex 64
JWT_SECRET=change-me-to-a-long-random-string

# Get a free API key at https://rawg.io/apidocs
RAWG_API_KEY=your-rawg-api-key-here
```

### 2. Start the full stack

```bash
docker compose up --build
```

| Service     | URL                           |
| ----------- | ----------------------------- |
| Frontend    | http://localhost:3000         |
| GraphQL API | http://localhost:4000/graphql |

The backend automatically runs `prisma db push` on startup to keep the database schema in sync.

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
