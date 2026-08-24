# Deploying GameReviews to a home server

An ordered runbook, from an unpushed branch stack to a working site behind SWAG
with authentik login. Follow it top to bottom the first time; the
[day-two operations](#day-two-operations) sections stand alone afterwards.

The authentik objects themselves — provider, application, 2FA stage — live in
[authentik-setup.md](authentik-setup.md). This document says *when* to do that;
that one says *how*.

---

## What you are deploying

Three containers, none of which listens on the host. SWAG reaches two of them
over its own docker network by container name, and the database is on a separate
network the proxy cannot reach at all.

```
browser ──► SWAG ──┬─► /                → gamereviews-frontend:8080   public
                   ├─► /graphql         → gamereviews-backend:4000    public, always anonymous
                   ├─► /graphql-auth    → auth_request to authentik,
                   │                      then gamereviews-backend:4000 with identity headers
                   └─► /outpost.goauthentik.io → authentik-server:9000

                       gamereviews-backend ──► gamereviews-db:5432    private network
```

Reviews are readable by anyone. Writing requires an authentik session, and the
app never sees a password — 2FA included, that is entirely authentik's business.
The only persistent state is the Postgres volume.

Identity arrives in HTTP headers, which is sound only because the backend is
unreachable except through the proxy. That single fact is why the production
compose file publishes no ports and why the backend refuses to start without a
shared secret. Keep both properties and the design holds; break either and it
does not.

### Why a separate compose file

`docker-compose.prod.yml` is standalone, not an override of
`docker-compose.yml`. Compose *merges* `ports` lists rather than replacing them,
so an override file cannot remove a published port. A separate file is the only
way to be certain the API is not exposed on the host.

---

## Before you start

You will need, on or reachable from the server:

- **authentik**, running, with its container named `authentik-server`, and an
  embedded or standalone outpost that is healthy.
- **SWAG**, running, with `/config/nginx/authentik-server.conf` in place — rename
  the shipped `.sample` if you have not already. That file provides the
  `/outpost.goauthentik.io` locations this deployment depends on.
- Both on a **shared docker network**. Find its name now:

  ```bash
  docker inspect swag --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
  ```

  Anything other than `swag` goes in `PROXY_NETWORK` later.
- A **DNS record** for the site, e.g. `gamereviews.example.com`, pointed at the
  same place your other SWAG subdomains are.
- A **RAWG API key** — free at <https://rawg.io/apidocs>.
- `docker compose` v2 on the server.

---

## Step 1 — configure the stack on the server

```bash
git clone <your repository> /srv/gamereviews
cd /srv/gamereviews
cp .env.prod.example .env
```

Generate the two secrets:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 32   # AUTH_PROXY_SECRET
```

Fill in `.env`:

```env
POSTGRES_PASSWORD=<the 24-byte value>
RAWG_API_KEY=<your RAWG key>
AUTH_PROXY_SECRET=<the 32-byte value>
# PROXY_NETWORK=swag        # only if SWAG's network is named something else
```

Keep `AUTH_PROXY_SECRET` to hand — it has to be written into the SWAG
configuration in step 3, and the two must match exactly.

`.env` is gitignored. Do not commit it, and do not paste the secret into the
copy of the proxy conf that lives in the repository.

---

## Step 2 — create the authentik objects

Work through [authentik-setup.md](authentik-setup.md), steps 2 to 5:

1. A **proxy provider** in *Forward auth (single application)* mode, with the
   external host set to the exact URL people will type.
2. An **application** bound to it, plus a group binding controlling who may
   write. Anyone not bound can still read the site.
3. The provider **attached to an outpost**, and that outpost healthy.
4. An **Authenticator Validation stage** on your authentication flow with
   *Not configured action* set to **Configure** — that is what makes 2FA
   mandatory instead of optional.

Step 4 applies instance-wide, so if your other authentik-protected apps already
enforce 2FA, it is already done.

---

## Step 3 — install the SWAG configuration

The conf is version-controlled. Substitute the secret as you copy it into place:

```bash
export AUTH_PROXY_SECRET=$(grep '^AUTH_PROXY_SECRET=' .env | cut -d= -f2-)

sed "s|REPLACE_WITH_AUTH_PROXY_SECRET|$AUTH_PROXY_SECRET|" \
  deploy/swag/gamereviews.subdomain.conf \
  > /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
```

Confirm the placeholder is gone and the real secret is present, because a proxy
sending the literal string `REPLACE_WITH_AUTH_PROXY_SECRET` fails in a way that
looks exactly like "signed in but the app disagrees":

```bash
grep -c REPLACE_WITH /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
# must print 0
```

Do not reload SWAG yet — it would proxy to containers that do not exist.

---

## Step 4 — bring up the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. Then watch it settle:

```bash
docker compose -f docker-compose.prod.yml ps
```

**Checkpoint.** All three services must report `healthy`. The first boot is
slower than later ones because the backend applies the initial migration before
it starts listening.

If `backend` is restarting, read its log before going further:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

Two failures are expected and self-explaining. A complaint about
`AUTH_PROXY_SECRET` means it is missing from `.env` — the backend refuses to run
in a configuration where proxy headers would be trusted without proof. A `P3005`
error means the database predates migrations, and the log prints the one-off
baseline command; see [baselining](#baselining-a-database-created-before-migrations-existed).

Now reload SWAG:

```bash
docker exec swag nginx -s reload
```

---

## Step 5 — verify

Work outside in. Each check isolates a different layer, so the first one that
fails tells you where the problem is.

**Public reads work without a session.**

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{recentReviewsCount}"}'
# {"data":{"recentReviewsCount":0}}
```

**Writes are refused without one.**

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation{createGame(input:{title:\"x\"}){id}}"}'
# UNAUTHENTICATED
```

**Forged identity headers get you nothing.** This is the one to care about: if it
ever returns a user, the header trust boundary is broken and anyone on the
internet can post as anyone.

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -H 'X-authentik-uid: forged' -H 'X-authentik-username: admin' \
  -d '{"query":"{me{username}}"}'
# {"data":{"me":null}}
```

**The authenticated endpoint answers 401, not a redirect.** A 302 here means the
conf is using SWAG's stock `@goauthentik_proxy_signin` error page, which would
make the browser fetch an HTML login page and try to parse it as GraphQL.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://gamereviews.example.com/graphql-auth \
  -H 'content-type: application/json' -d '{"query":"{me{id}}"}'
# 401
```

**Then the browser, which is the only thing that exercises the outpost
handshake.** Load the site signed out: reviews should render, with a **Sign in**
button in the navbar. Click it, complete the authentik flow including the 2FA
prompt, and confirm you land back on the page you started from with your
username in the navbar. Search for a game, post a review, leave a comment. Then
**Sign out** and confirm you are signed out of authentik itself, not merely of
this app.

If sign-in appears to succeed but the navbar still offers **Sign in**, the
identity is not reaching the backend. The troubleshooting table in
[authentik-setup.md](authentik-setup.md#troubleshooting) distinguishes the
causes: a 401 from the outpost, a mismatched external host, an unbound user, or a
proxy secret that does not match.

---

# Day-two operations

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Compose recreates only what changed, and the Postgres volume is untouched.

Dependency updates arrive as Renovate pull requests. Patch and minor bumps, base
image updates, and security fixes merge themselves once CI is green; majors are
labelled `needs-review` and wait for you. The routine is therefore: glance at
what merged, then run the two commands above. Nothing merges without the test
suite passing against a real PostgreSQL, which is the reason the suite exists.

The backend replays any new migrations on startup. If one fails the container
exits rather than serving against a half-migrated schema — check the log and fix
forward with a new migration.

## Rolling back

```bash
git checkout <previous commit>
docker compose -f docker-compose.prod.yml up -d --build
```

One caveat: rolling back code does not roll back the database. Prisma has no
`migrate down`. If the update you are undoing touched
`backend/prisma/schema.prisma`, restore a dump taken before it, or accept that
the schema stays ahead of the code — which is usually fine for an added column
and definitely not fine for a removed one.

## Schema changes

Migrations live in `backend/prisma/migrations` and are applied in order at
startup. Nothing infers the schema from the model file at runtime, so a change
can never silently drop a column that live data still needs.

Author migrations on your machine against a local database, never on the server:

```bash
cd backend
npm run db:migrate:new -- --name add_review_spoiler_flag
```

Read the generated SQL before committing it. Prisma flags destructive changes,
but it cannot know that dropping a column loses data you care about. Take a dump
first for anything that rewrites or removes data.

Never edit a migration that has already been applied anywhere. Prisma records a
checksum and will refuse to continue when it changes. Add a new migration.

### Baselining a database created before migrations existed

A database first created by the older `prisma db push` startup has tables but no
`_prisma_migrations` table, so `migrate deploy` stops with `P3005`. Record the
initial migration as already applied, once:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  --entrypoint "npx prisma migrate resolve --applied 0_init" backend
```

That writes history only; it touches neither data nor schema. Then start the
stack normally.

## Backups

The Postgres volume is the only state. A daily dump is proportionate here:

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

Restore into a throwaway container at least once. An untested backup is a guess,
and finding out it was a bad guess is not a thing you want to do on the day you
need it.

Note what a dump does *not* contain: accounts live in authentik, and the local
`User` rows only mirror them. Back up authentik separately — restoring this
database alone gives you reviews attributed to users who can no longer sign in.

## Operational notes

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f backend

# A shell in the backend. The filesystem is read-only, so you cannot install
# anything in here.
docker compose -f docker-compose.prod.yml exec backend sh

# psql
docker exec -it gamereviews-db psql -U gamereview -d gamereview

# Stop, keeping data
docker compose -f docker-compose.prod.yml down
```

`docker compose ... down -v` deletes the Postgres volume and every review in it.

## What the hardening does

Both application containers run with a read-only root filesystem, all Linux
capabilities dropped, and `no-new-privileges`. The backend runs as uid 1000 and
the frontend as uid 101; neither has a root process anywhere. Writable `tmpfs`
mounts are provided only where the software genuinely needs one — `/tmp` for the
backend, `/tmp` and `/var/cache/nginx` for nginx, which will not start without a
writable temp directory.

Postgres is the exception. It starts as root to correct ownership of its data
directory before dropping to the `postgres` user, so it keeps five capabilities
(`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`). Dropping all of them
makes it fail with `failed switching to 'postgres'`.

Each service has a memory cap and 30 MB of rotated logs, so a runaway container
cannot take the host down or fill the disk.

CI asserts the two properties that are easy to lose by accident: that neither
image runs as root, and that the production compose file publishes no ports. A
base image change or a stray `ports:` entry fails the build.

## Postgres major upgrades

`postgres:16-alpine` is pinned to major 16 on purpose. Moving to 17 or later is
not a container restart — the on-disk format changes and the new image refuses to
start against an old data directory. When you decide to upgrade: dump, stop the
stack, delete the volume, change the tag, start, restore. Renovate is configured
to hold this major back permanently so an automated update can never do it to
you at four in the morning.

---

## Known gaps

Two things in this deployment have never been executed, as opposed to reviewed:

- **The authentik outpost handshake.** Everything on the application side is
  tested against a real database, and the SWAG conf passes `nginx -t`, but no
  request has ever traversed a live outpost. Step 5's browser walkthrough is
  where that gets proven.
- **The CI workflow on GitHub.** It is linted, and each of its assertions has
  been run by hand, but the first real run may still surface something
  environmental.

Neither blocks a deployment. Both are worth knowing before you conclude that a
failure must be your configuration.
