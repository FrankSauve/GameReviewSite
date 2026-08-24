# Deploying GameReviews to a home server

The production stack is `docker-compose.prod.yml`. Nothing in it listens on the
host: SWAG reaches the frontend and backend over its own docker network by
container name. The database is on a separate network that the proxy cannot
reach at all.

For the authentik side — provider, application, 2FA, and the reverse proxy
configuration — see [authentik-setup.md](authentik-setup.md). Do that first or
in parallel; the backend will not start without `AUTH_PROXY_SECRET`.

## Why a separate compose file

`docker-compose.prod.yml` is standalone, not an override of
`docker-compose.yml`. Compose merges `ports` lists rather than replacing them,
so an override file cannot *remove* a published port. Using a separate file is
the only way to be certain the API is not exposed on the host, which matters
here because identity arrives in HTTP headers and is only trustworthy while the
proxy is the sole route in.

## First deployment

```bash
git clone <your fork> gamereviews && cd gamereviews

cp .env.prod.example .env
openssl rand -hex 24   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> AUTH_PROXY_SECRET
$EDITOR .env           # fill in both, plus RAWG_API_KEY
```

Confirm the proxy network name matches the one SWAG runs on:

```bash
docker inspect swag --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'
```

If it is not `swag`, set `PROXY_NETWORK` in `.env`.

Then bring it up:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Wait for all three services to report `healthy`. The backend applies the
database schema on startup, so the first boot takes a little longer than later
ones.

Install the SWAG configuration as described in step 6 of the authentik guide,
reload SWAG, then work through that guide's step 8 verification list.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Compose recreates only what changed. The Postgres volume is untouched.

The backend replays any new migrations on startup. If one fails, the container
exits rather than starting against a half-migrated schema — check
`docker compose -f docker-compose.prod.yml logs backend` and fix forward with a
new migration.

To roll back, check out the previous commit and run the same command — with one
caveat: a rollback across a schema change does not undo the schema change.
Prisma has no `migrate down`. Take a dump first if the update touched
`prisma/schema.prisma`.

## Schema changes

Migrations live in `backend/prisma/migrations` and are applied in order by
`prisma migrate deploy` at startup. Nothing infers the schema from the model
file at runtime, so a change can never silently drop a column that live data
still needs.

Author a migration on your machine, against a local database, never on the
server:

```bash
cd backend
npm run db:migrate:new -- --name add_review_spoiler_flag
```

Read the generated SQL before committing it. Prisma will tell you when a change
is destructive, but it cannot know that dropping a column loses data you care
about. For anything that rewrites or removes data, take a dump first.

Never edit a migration that has already been applied anywhere — Prisma records
a checksum and will refuse to continue if it changes. Add a new migration
instead.

### Baselining a database created before migrations existed

A database first created by the older `prisma db push` startup has tables but no
`_prisma_migrations` table, so `migrate deploy` stops with error `P3005`. Record
the initial migration as already applied, once:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  --entrypoint "npx prisma migrate resolve --applied 0_init" backend
```

That writes history only; it does not touch data or schema. Then start the stack
normally. The container prints these instructions itself if it hits `P3005`.

## Backups

The only state is the Postgres volume. A daily dump is enough for this kind of
site:

```bash
docker exec gamereviews-db pg_dump -U gamereview -d gamereview --clean \
  | gzip > "gamereviews-$(date +%F).sql.gz"
```

As a cron entry, keeping 14 days:

```cron
30 4 * * * cd /srv/gamereviews && docker exec gamereviews-db pg_dump -U gamereview -d gamereview --clean | gzip > backups/gamereviews-$(date +\%F).sql.gz && find backups -name 'gamereviews-*.sql.gz' -mtime +14 -delete
```

Restoring:

```bash
gunzip -c gamereviews-2026-08-23.sql.gz \
  | docker exec -i gamereviews-db psql -U gamereview -d gamereview
```

Test a restore into a throwaway container at least once. An untested backup is
a guess.

## What the hardening does

Both application containers run with a read-only root filesystem, all Linux
capabilities dropped, and `no-new-privileges`. The backend runs as uid 1000 and
the frontend as uid 101; neither has a root process. Writable `tmpfs` mounts are
provided only where the software genuinely needs them — `/tmp` for the backend,
`/tmp` and `/var/cache/nginx` for nginx, which will not start without a writable
temp directory.

Postgres is the exception. It starts as root to correct ownership of its data
directory before dropping to the `postgres` user, so it keeps five capabilities
(`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`). Dropping all of them
makes it fail with `failed switching to 'postgres'`.

Each service is capped at a memory limit and 30 MB of rotated logs, so a runaway
container cannot take the host down or fill the disk.

## Operational notes

Logs:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

A shell in the backend — note the read-only filesystem, so you cannot install
anything:

```bash
docker compose -f docker-compose.prod.yml exec backend sh
```

psql:

```bash
docker exec -it gamereviews-db psql -U gamereview -d gamereview
```

Stopping, keeping data:

```bash
docker compose -f docker-compose.prod.yml down
```

Adding `-v` to that command deletes the Postgres volume and every review in it.

## Postgres major upgrades

`postgres:16-alpine` is pinned to major 16 deliberately. Moving to 17 or later
is not a container restart — the on-disk format changes and the new image will
refuse to start against an old data directory. When you decide to upgrade: dump,
stop the stack, delete the volume, change the image tag, start, restore. Do not
let an automated dependency update do this for you; the Renovate configuration
holds the Postgres major back for exactly this reason.
