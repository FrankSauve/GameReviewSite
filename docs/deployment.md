# Deploying GameReviews to a home server

An ordered runbook, from a repository with no images published to a working site
behind a reverse proxy with authentik login. Follow it top to bottom the first
time; the [day-two operations](#day-two-operations) sections stand alone
afterwards.

The authentik objects themselves — provider, application, 2FA stage — live in
[authentik-setup.md](authentik-setup.md). This document says *when* to do that;
that one says *how*.

---

## What you are deploying

Three containers added to the compose file that already runs your reverse proxy.
None of them listens on the host. The proxy reaches two of them over the network
it already shares with them, by container name, and the database is on a separate
network nothing else can reach.

```
browser ──► SWAG ──┬─► /                → gamereviews-frontend:8080   public
                   ├─► /graphql         → gamereviews-backend:4000    public, always anonymous
                   ├─► /graphql-auth    → auth_request to authentik,
                   │                      then gamereviews-backend:4000 with identity headers
                   └─► /outpost.goauthentik.io → authentik-server:9000

                       gamereviews-backend ──► gamereviews-db:5432    gamereviews-internal
```

Reviews are readable by anyone. Writing requires an authentik session, and the
app never sees a password — 2FA included, that is entirely authentik's business.
The only persistent state is the Postgres volume.

Identity arrives in HTTP headers, which is sound only because the backend is
unreachable except through the proxy. That single fact is why the deployment
publishes no ports and why the backend refuses to start without a shared secret.
Keep both properties and the design holds; break either and it does not.

### Where the images come from

The server builds nothing. CI publishes two images to the GitHub Container
registry:

```
ghcr.io/franksauve/gamereviews-backend:latest       moves with main
ghcr.io/franksauve/gamereviews-frontend:latest
ghcr.io/franksauve/gamereviews-{backend,frontend}:sha-<short>
```

`latest` is what an image updater follows. The `sha-` tags never move, which is
what makes a rollback a tag change rather than a rebuild.

This is also the reason there is no second compose file. An updater such as
Watchtower works by comparing a running container's digest against a registry
tag; an image built on the server has no registry tag to compare against, so
nothing can notice a new version. Publishing the images removes the checkout, the
toolchain, the build, and the extra compose file all at once.

---

## Before you start

You will need, on or reachable from the server:

- **authentik**, running, with its container named `authentik-server`, and an
  embedded or standalone outpost that is healthy.
- **SWAG**, running, with `/config/nginx/authentik-server.conf` in place — rename
  the shipped `.sample` if you have not already. That file provides the
  `/outpost.goauthentik.io` locations this deployment depends on.
- Both on a network the new containers will share. If they all live in one
  compose file, that is the project's `default` network and there is nothing to
  configure. If your proxy is a separate project, declare its network as
  `external` and attach the frontend and backend to it instead of `default`.
- A **DNS record** for the site, e.g. `gamereviews.example.com`, pointed at the
  same place your other subdomains are.
- A **RAWG API key** — free at <https://rawg.io/apidocs>.
- `docker compose` v2.

---

## Step 1 — publish the images

Merging to `main` publishes both images. Until the deployment branches are
merged, publish from a branch instead: **Actions → Publish images → Run
workflow**, and pick the ref. It builds from whatever ref it runs on and moves
`latest` there, which is the point.

Check the run is green and both packages appear under the repository owner's
**Packages**. New packages are **private** — GitHub's default, and nothing needs
to change to keep them that way.

Because the images carry an `org.opencontainers.image.source` label, each package
is linked to this repository and inherits its access permissions, which is what
lets a repository collaborator pull without anyone granting access by hand. If
you would rather manage that explicitly, the package's settings page has
*Inherit access from repository*; turn it off and add yourself directly.

## Step 2 — let the server pull

A private package needs credentials. Create a token with **`read:packages`** and
nothing else — a classic PAT set to no expiry, or a fine-grained one, but
remember an expiring token means a deployment that silently stops updating
months from now.

Log in once, so `docker compose up` can pull:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-github-username> --password-stdin
```

Your image updater is a separate process with its own filesystem, so it needs the
same credentials mounted in. For Watchtower:

```yaml
  watchtower:
    volumes:
      - /root/.docker/config.json:/config.json:ro   # wherever docker login wrote it
```

Only the `ghcr.io` entry matters; anonymous pulls from other registries keep
working. If the file also holds credentials for registries you would rather not
expose to the updater, write a config containing just the `ghcr.io` auth and
mount that instead.

Confirm a pull works before going further, because the alternative is debugging
authentication through three layers of compose:

```bash
docker pull ghcr.io/franksauve/gamereviews-backend:latest
```

## Step 3 — set the environment values

Generate the two secrets:

```bash
openssl rand -hex 24   # GAMEREVIEWS_DB_PASSWORD
openssl rand -hex 32   # GAMEREVIEWS_AUTH_PROXY_SECRET
```

Add three lines to the `.env` next to your compose file:

```env
GAMEREVIEWS_DB_PASSWORD=<the 24-byte value>
GAMEREVIEWS_RAWG_API_KEY=<your RAWG key>
GAMEREVIEWS_AUTH_PROXY_SECRET=<the 32-byte value>
```

The names are prefixed on purpose. A bare `POSTGRES_PASSWORD` in a file shared
with your other services would collide with the database behind authentik, and
the failure mode — one of the two stacks quietly authenticating against the wrong
password — is unpleasant to diagnose.

Keep `GAMEREVIEWS_AUTH_PROXY_SECRET` to hand; it has to be written into the SWAG
configuration in step 5, and the two must match exactly.

## Step 4 — add the services

Copy the three services from [deploy/gamereviews.yml](../deploy/gamereviews.yml)
into the `services:` block of your compose file, and its `networks:` and
`volumes:` entries into yours. Do not start them yet — the proxy configuration
comes first, and starting them early only means a restart.

The `gamereviews-internal` network is the one part worth understanding rather
than pasting. With everything on a single shared network, any container on it
could reach `gamereviews-db:5432` and try the password. Attaching the database to
its own network and the backend to both is what keeps that unreachable, and it is
four lines.

## Step 5 — create the authentik objects

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

## Step 6 — install the SWAG configuration

The conf is version-controlled. Substitute the secret as you copy it into place:

```bash
sed "s|REPLACE_WITH_AUTH_PROXY_SECRET|$GAMEREVIEWS_AUTH_PROXY_SECRET|" \
  deploy/swag/gamereviews.subdomain.conf \
  > /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
```

Confirm the placeholder is gone, because a proxy sending the literal string
`REPLACE_WITH_AUTH_PROXY_SECRET` fails in a way that looks exactly like "signed
in but the app disagrees":

```bash
grep -c REPLACE_WITH /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
# must print 0
```

Do not reload SWAG yet — it would proxy to containers that do not exist.

## Step 7 — bring it up

```bash
docker compose up -d
```

Compose starts the three new containers and leaves everything else alone. Then
watch them settle:

```bash
docker compose ps gamereviews-db gamereviews-backend gamereviews-frontend
```

**Checkpoint.** All three must report `healthy`. The first boot is slower than
later ones because the backend applies the initial migration before it starts
listening.

If the backend is restarting, read its log before going further:

```bash
docker compose logs gamereviews-backend
```

Two failures are expected and self-explaining. A complaint about
`AUTH_PROXY_SECRET` means the value is missing from `.env` — the backend refuses
to run in a configuration where proxy headers would be trusted without proof. A
`P3005` error means the database predates migrations, and the log prints the
one-off baseline command; see
[baselining](#baselining-a-database-created-before-migrations-existed).

Now reload SWAG:

```bash
docker exec swag nginx -s reload
```

## Step 8 — verify

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

**The database is not reachable from the proxy network.** This is the assertion
the `gamereviews-internal` network exists to make true:

```bash
docker exec swag getent hosts gamereviews-db
# no output, exit status 2
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

Nothing to do. Renovate opens dependency pull requests, patch and minor bumps and
security fixes merge themselves once CI is green, a merge to `main` publishes new
images, and your image updater pulls them on its next pass and recreates the
containers. The backend applies any new migrations as it starts, so there is no
follow-up step. If a migration fails the container exits rather than serving
against a half-migrated schema — check the log and fix forward with a new
migration.

Two things are worth knowing about how that plays out.

An updater does not honour `depends_on`, so the backend and frontend are
recreated independently and in no particular order. Both are stateless and the
bundle is versioned, so the worst case is a page reload. It does mean the
ordering in the snippet only applies to `docker compose up`.

And an update lands whenever the poll happens, unattended. Nothing reaches
`main` without the test suite passing against a real PostgreSQL, which is the
reason that suite exists, but if you would rather look first, most updaters have
a monitor-only mode that notifies instead of pulling. Either way, take the
database dump on a schedule rather than trusting the timing to work out.

Majors are held back for a human: Renovate labels them `needs-review` and does
not merge them.

## Rolling back

Change `latest` to the immutable tag you want and bring it up:

```yaml
    image: ghcr.io/franksauve/gamereviews-backend:sha-1a2b3c4
```

```bash
docker compose up -d gamereviews-backend
```

A `sha-` tag never moves, so an updater cannot pull it forward — a pinned service
stays pinned until you unpin it. That is the mechanism, and also the trap: it
will still be pinned in six months if you forget.

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
docker compose run --rm \
  --entrypoint "npx prisma migrate resolve --applied 0_init" gamereviews-backend
```

That writes history only; it touches neither data nor schema. Then start the
stack normally.

## Backups

The Postgres volume is the only state this deployment holds. If a file-level
backup tool already snapshots your docker volumes, it covers the data — but a
snapshot of a running database's data directory is a crash-consistent copy, not a
clean one. Postgres recovers from those, usually. A dump is a copy you do not
have to reason about:

```bash
docker exec gamereviews-db pg_dump -U gamereview -d gamereview --clean \
  | gzip > "gamereviews-$(date +%F).sql.gz"
```

Write it somewhere your backup tool already collects, and it inherits your
existing retention and off-site handling.

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
docker compose logs -f gamereviews-backend

# A shell in the backend. The filesystem is read-only, so you cannot install
# anything in here.
docker compose exec gamereviews-backend sh

# psql
docker exec -it gamereviews-db psql -U gamereview -d gamereview

# Stop just this app, keeping data
docker compose stop gamereviews-frontend gamereviews-backend gamereviews-db
```

`docker compose down -v` deletes every volume in the project, this database
included. There is rarely a reason to run it on a server that hosts more than one
thing.

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

CI asserts the three properties that are easy to lose by accident: that neither
image runs as root, that the deployment publishes no ports, and that it builds
nothing from source. A base image change, a stray `ports:` entry, or a `build:`
entry creeping back in fails the build.

## Postgres major upgrades

`postgres:16-alpine` is pinned to major 16 on purpose. Moving to 17 or later is
not a container restart — the on-disk format changes and the new image refuses to
start against an old data directory. When you decide to upgrade: dump, stop the
three containers, delete the volume, change the tag, start, restore. Renovate is
configured to hold this major back permanently so an automated update can never
do it to you at four in the morning.

Note that an image updater has no such restraint of its own. It follows the tag
it is given, so the pin in the snippet is what protects you — `postgres:16-alpine`
receives 16.x patches and never a major.

---

## Known gaps

Three things in this deployment have never been executed, as opposed to reviewed:

- **The authentik outpost handshake.** Everything on the application side is
  tested against a real database, and the SWAG conf passes `nginx -t`, but no
  request has ever traversed a live outpost. Step 8's browser walkthrough is
  where that gets proven.
- **The workflows on GitHub.** Both are linted, each CI assertion has been run by
  hand, and the compose snippet is validated the same way CI validates it — but
  no image has been pushed yet, and neither workflow has had a real run. The
  first one may still surface something environmental.
- **The updater's pull of a private package.** The credential path — token,
  `docker login`, mounted config — is the most common thing to get wrong here,
  and step 2 exists to prove it before anything depends on it.

None of these blocks a deployment. All are worth knowing before you conclude that
a failure must be your configuration.
