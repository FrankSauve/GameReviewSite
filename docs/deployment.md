# Deploying GameReviews to a home server

Three containers added to the compose file that already runs your reverse proxy.
None of them listens on the host. The server builds nothing — CI publishes the
images.

The authentik objects are in [authentik-setup.md](authentik-setup.md).

## Before you start

- **authentik**, reachable from the backend container over HTTPS.
- **SWAG**, or another reverse proxy terminating TLS for one hostname.
- Both on a network the new containers will share. In one compose file that is
  the project's `default` network. If your proxy is a separate project, declare
  its network `external` and attach the frontend and backend to it instead.
- A DNS record, e.g. `reviews.example.com`.
- A **RAWG API key** — free at <https://rawg.io/apidocs>.
- `docker compose` v2.

## 1. Publish the images

Merging to `main` publishes both. To publish from another ref:
**Actions → Publish images → Run workflow**.

Check the run is green and both packages appear under the repository owner's
**Packages**. They are private by default.

## 2. Let the server pull

Create a GitHub token with **`read:packages`** and nothing else, then:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-username> --password-stdin
docker pull ghcr.io/franksauve/gamereviews-backend:latest
```

Your image updater is a separate process and needs the same credentials. For
Watchtower:

```yaml
watchtower:
  volumes:
    - /root/.docker/config.json:/config.json:ro
```

## 3. Set the environment values

```bash
openssl rand -hex 24   # GAMEREVIEWS_DB_PASSWORD
```

In the `.env` next to your compose file:

```env
GAMEREVIEWS_DB_PASSWORD=<the 24-byte value>
GAMEREVIEWS_RAWG_API_KEY=<your RAWG key>
GAMEREVIEWS_OIDC_ISSUER=https://authentik.example.com/application/o/reviews/
GAMEREVIEWS_OIDC_CLIENT_ID=<from the provider>
GAMEREVIEWS_OIDC_CLIENT_SECRET=<from the provider>
GAMEREVIEWS_OIDC_REDIRECT_URI=https://reviews.example.com/auth/callback
```

The four `OIDC_` values come from step 5, so you will come back to this file. All
four are required; the backend refuses to start in production without them.

## 4. Add the services

Copy the three services from [deploy/gamereviews.yml](../deploy/gamereviews.yml)
into your `services:` block, and its `networks:` and `volumes:` entries into
yours. Do not start them yet.

Keep the `gamereviews-internal` network as written: it is what stops any other
container on the shared network from reaching `gamereviews-db:5432`.

## 5. Create the authentik objects

Work through [authentik-setup.md](authentik-setup.md), steps 1 to 3, then copy
the client ID and secret into the `.env` from step 3.

## 6. Install the SWAG configuration

```bash
cp deploy/swag/gamereviews.subdomain.conf \
  /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
```

Do not reload SWAG yet.

## 7. Bring it up

```bash
docker compose up -d
docker compose ps gamereviews-db gamereviews-backend gamereviews-frontend
```

All three must report `healthy`. First boot is slower — the backend applies
migrations before it starts listening. If the backend is restarting:

```bash
docker compose logs gamereviews-backend
```

A complaint about OIDC means one of the four `OIDC_*` values is missing. A
`P3005` means the database predates migrations; the log prints the one-off
baseline command, also given under [Schema changes](#schema-changes).

Then reload SWAG:

```bash
docker exec swag nginx -s reload
```

## 8. Verify

Public reads work without a session:

```bash
curl -s https://reviews.example.com/graphql \
  -H 'content-type: application/json' -d '{"query":"{recentReviewsCount}"}'
# {"data":{"recentReviewsCount":0}}
```

Writes are refused without one:

```bash
curl -s https://reviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation{createGame(input:{title:\"x\"}){id}}"}'
# UNAUTHENTICATED
```

The old proxy headers are inert:

```bash
curl -s https://reviews.example.com/graphql \
  -H 'content-type: application/json' \
  -H 'X-authentik-uid: forged' -H 'X-authentik-username: admin' \
  -d '{"query":"{me{username}}"}'
# {"data":{"me":null}}
```

Another origin is refused:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://reviews.example.com/graphql \
  -H 'content-type: application/json' -H 'Origin: https://evil.example.com' \
  -d '{"query":"{me{username}}"}'
# 403
```

Sign-in redirects to authentik (503 means the `OIDC_*` values are missing; 502
means the backend cannot reach the issuer):

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  'https://reviews.example.com/auth/login?returnTo=%2F'
# 302 https://authentik.example.com/application/o/authorize/?...
```

The review export refuses an anonymous request (a 404 here means the
`/export/` location is missing from the SWAG config):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://reviews.example.com/export/reviews.zip
# 401
```

A review link unfurls, and the tags are served to a crawler only. An empty
`<div id="root">` in the first response means the `/reviews/` location or the
`map` above it is missing from the SWAG config. Crawlers are exempt from the
geoblock on this path alone, because Discord and the rest fetch from cloud IPs
no country whitelist covers; see the comment above that `map`.

```bash
curl -s https://reviews.example.com/reviews/<user>/<game> \
  -A 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' \
  | grep 'og:title'
# <meta property="og:title" content="Elden Ring — 9.5/10 by alice">

curl -s https://reviews.example.com/reviews/<user>/<game> | grep -c 'og:title'
# 0
```

The database is unreachable from the proxy network:

```bash
docker exec swag getent hosts gamereviews-db
# no output, exit status 2
```

Then in a browser: load the site signed out and confirm reviews render with a
**Sign in** button, complete the authentik flow including the 2FA prompt, post a
review and a comment, download your own reviews from the **Export as zip**
link on your profile, then **Sign out**. If sign-in appears to succeed but the
navbar still offers **Sign in**, see
[troubleshooting](authentik-setup.md#troubleshooting).

---

# Day-two operations

## Updating

Nothing to do. A merge to `main` publishes new images, your updater pulls them,
and the backend applies any new migrations as it starts. A failed migration exits
the container rather than serving a half-migrated schema — fix forward with a new
migration.

An updater does not honour `depends_on`, so the two app containers are recreated
in no particular order. Both are stateless.

Majors are held back for a human: Renovate labels them `needs-review`.

## Rolling back

Change `latest` to an immutable tag and bring it up:

```yaml
image: ghcr.io/franksauve/gamereviews-backend:sha-1a2b3c4
```

```bash
docker compose up -d gamereviews-backend
```

A `sha-` tag never moves, so an updater cannot pull it forward — it stays pinned
until you unpin it.

Rolling back code does not roll back the database; Prisma has no `migrate down`.
If the update touched `backend/prisma/schema.prisma`, restore a dump taken before
it.

## Schema changes

Author migrations on your machine, never on the server:

```bash
cd backend
npm run db:migrate:new -- --name add_review_spoiler_flag
```

Read the generated SQL before committing. Never edit a migration that has already
been applied anywhere — Prisma records a checksum and will refuse to continue.

A database first created by the older `prisma db push` startup stops with `P3005`.
Record the initial migration as applied, once:

```bash
docker compose run --rm \
  --entrypoint "npx prisma migrate resolve --applied 0_init" gamereviews-backend
```

## Backups

The Postgres volume is the only state here. Take a dump:

```bash
docker exec gamereviews-db pg_dump -U gamereview -d gamereview --clean \
  | gzip > "gamereviews-$(date +%F).sql.gz"
```

Restore:

```bash
gunzip -c gamereviews-2026-08-23.sql.gz \
  | docker exec -i gamereviews-db psql -U gamereview -d gamereview
```

Restore into a throwaway container at least once. Accounts live in authentik and
the local `User` rows only mirror them, so back up authentik separately.

## Operational notes

```bash
# Logs
docker compose logs -f gamereviews-backend

# A shell in the backend. The filesystem is read-only.
docker compose exec gamereviews-backend sh

# psql
docker exec -it gamereviews-db psql -U gamereview -d gamereview

# Stop just this app, keeping data
docker compose stop gamereviews-frontend gamereviews-backend gamereviews-db
```

`docker compose down -v` deletes every volume in the project, this database
included.

### Backfilling genres

Games imported before the `20260829041559_multi_platform_genre` migration carry
at most one genre, because the schema had a single `genre` column at the time.
The repair reads the missing tags from RAWG. It ships in the image, so it needs
no checkout and no npm:

```bash
# Dry run: prints how many games are affected and what it would change.
docker compose exec gamereviews-backend node dist/scripts/backfill-genres.js

# Apply.
docker compose exec gamereviews-backend node dist/scripts/backfill-genres.js --write
```

It reuses the container's `DATABASE_URL` and `RAWG_API_KEY`, goes one game at a
time with a 1s pause (`--delay=<ms>` to change it), and backs off on a 429. A
game is skipped unless RAWG returns strictly more genres than are stored, so a
hand-curated list is never shrunk or reordered. Re-running it is safe.

## Postgres major upgrades

`postgres:16-alpine` is pinned on purpose: the on-disk format changes between
majors and the new image refuses to start against an old data directory. To
upgrade — dump, stop the three containers, delete the volume, change the tag,
start, restore. Renovate holds this major back permanently; an image updater does
not, so the pin in the snippet is what protects you.
