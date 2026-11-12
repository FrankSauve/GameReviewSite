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
- A **TheGamesDB API key**, optional — requested at
  <https://forums.thegamesdb.net>. Without one, Steam still works.
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
GAMEREVIEWS_TGDB_API_KEY=<your TheGamesDB key, optional>
GAMEREVIEWS_OIDC_ISSUER=https://authentik.example.com/application/o/reviews/
GAMEREVIEWS_OIDC_CLIENT_ID=<from the provider>
GAMEREVIEWS_OIDC_CLIENT_SECRET=<from the provider>
GAMEREVIEWS_OIDC_REDIRECT_URI=https://reviews.example.com/auth/callback
```

The four `OIDC_` values come from step 5, so you will come back to this file. All
four are required; the backend refuses to start in production without them.

Optionally, to announce every new review in a Discord channel, create a webhook
under the channel's **Edit Channel → Integrations → Webhooks**, copy its URL, and
add:

```env
GAMEREVIEWS_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Treat it as a secret: anyone holding the URL can post to that channel.

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
  -d '{"query":"mutation{deleteReview(id:\"x\")}"}'
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

## Postgres major upgrades

`postgres:16-alpine` is pinned on purpose: the on-disk format changes between
majors and the new image refuses to start against an old data directory. To
upgrade — dump, stop the three containers, delete the volume, change the tag,
start, restore. Renovate holds this major back permanently; an image updater does
not, so the pin in the snippet is what protects you.

## One-time moves off RAWG

RAWG was the only game source until Steam and TheGamesDB joined it, and its API
has since stopped answering. These are one-off moves, run in this order, and
each is safe to re-run until it has finished.

Finish both before upgrading past the release that stopped searching RAWG. Its
CSP no longer allows RAWG's image host, so any cover still there goes blank.
To check, count what is left:

```bash
docker compose exec gamereviews-db psql -U gamereview gamereview -c \
  "SELECT count(*) FROM \"Game\" WHERE \"coverUrl\" LIKE 'https://media.rawg.io/%'"
```

### Matching Steam ids

Games added before Steam was a source have no `steamAppId`, so a Steam result
for one looks new. This matches them against Steam's own search by title, and
needs nothing from RAWG. It ships in the image. Without it, a library game
that Steam dates by its later PC release is one the title check cannot
recognise:

```bash
# Dry run: prints every proposed link, and writes nothing.
docker compose exec gamereviews-backend node dist/scripts/match-steam-ids.js

# Settle the plan, then apply it.
docker compose exec gamereviews-backend node dist/scripts/match-steam-ids.js \
  --skip=<app ids to reject> --pick=<app ids to choose> --write
```

It takes about 3s per game. Check the plan before writing: a game can match its
remaster, and only you can say whether that is the same game. Re-running skips
games that are already linked.

### Moving covers off RAWG

Covers stored before Steam and TheGamesDB were sources are hosted by RAWG,
whose API has gone. This replaces every cover not already on Steam's or
TheGamesDB's image hosts: from TheGamesDB when the game has a TheGamesDB id,
and from Steam otherwise. It ships in the image, and needs the ids from the
matching above.

Set the TheGamesDB id first on any game whose Steam page is a re-release with
its own art, such as a remaster or a collection. The script takes that game's
cover from TheGamesDB, and once a cover has moved it is never revisited, so
setting the id afterwards does not change it.

Nothing in the app sets that id on a game already in the library, so it is a
statement in the database container. The id is unique, and the statement fails
if another row holds it. That row may be the same game added from TheGamesDB,
which is two rows for a person to merge first, or a different game sharing the
id, in which case pick another of the game's TheGamesDB ids.

```bash
docker compose exec gamereviews-db psql -U gamereview gamereview -c \
  "UPDATE \"Game\" SET \"tgdbId\" = '<TheGamesDB id>' WHERE slug = '<game slug>'"
```

```bash
# Dry run: prints every cover it would replace, and writes nothing.
docker compose exec gamereviews-backend node dist/scripts/refresh-covers.js

# Apply.
docker compose exec gamereviews-backend node dist/scripts/refresh-covers.js --write
```

Each run asks the source once per game, so a dry run and a write each spend one
TheGamesDB call per TheGamesDB game. A game whose source has no cover, or
nothing under that id, keeps the cover it has; the report says which, and each
re-run asks about those games again, at a TheGamesDB call each.

Steam calls are paced 2s apart (`--delay=<ms>` to change it). An outage pauses
that source for 30s, and the run waits with it whenever that source's game is
next. Three outages in a row from one source skip its remaining games. A failure
about one id, such as a 400, is reported but does not count towards that. The
run also skips TheGamesDB when `TGDB_API_KEY` is unset, and once an answer shows
the allowance near the reserve kept for readers adding games. It only learns the
allowance from its own answers, so its first TheGamesDB call goes ahead
regardless.

The run exits non-zero if any game failed or was skipped. Re-running skips
covers already moved, so run it again until it exits zero, or until only games
you have checked are left.

### Filling poster and banner art

Each game also stores a portrait poster, for thumbnails, and wide banner art,
for the top of its page. Games added since then get both when they join the
library. This fills them in for the rest, from the same source the cover came
from: Steam's library art, or TheGamesDB's box art and first fan art. It ships
in the image, and needs the moves above.

```bash
# Dry run: prints which games would change and which have no art, and writes nothing.
docker compose exec gamereviews-backend node dist/scripts/refresh-art.js

# Apply.
docker compose exec gamereviews-backend node dist/scripts/refresh-art.js --write
```

It asks each source in batches: one Steam call per 50 games and one TheGamesDB
call per 20, so a run over the whole library is a handful of calls. A game with
no poster shows its cover in its place, and one with no banner art shows its
poster beside the title. A batch that fails leaves its games as they were, and
the run exits non-zero; re-run it until it exits zero.

It is also how a game added during a source outage gets its art: such a game
joins the library without any. Re-running changes only games whose art
differs, and leaves a game Steam no longer answers for with the art it has.
