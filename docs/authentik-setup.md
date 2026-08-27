# Setting up authentik in front of GameReviews

This site has no login form and no password storage of its own. authentik
authenticates people — 2FA included — and tells the API who they are through
request headers. This guide covers the authentik objects to create, the SWAG
reverse proxy configuration, and how to verify the result.

## How it fits together

Reviews are public. Writing is not. A single GraphQL endpoint cannot be
selectively protected, because nginx's `auth_request` decides before it can see
the query body — so the same schema is served on two paths:

| Path | Guarded by authentik | Identity | Purpose |
| ---- | -------------------- | -------- | ------- |
| `/` | no | — | the SPA itself, readable by anyone |
| `/graphql` | no | always anonymous | public reads |
| `/graphql-auth` | yes | from the outpost | the `me` query and every mutation |
| `/outpost.goauthentik.io` | no (must not be) | — | the sign-in and sign-out flows |

```
browser ──► SWAG ──┬─► /                → gamereviews-frontend:8080
                   ├─► /graphql         → gamereviews-backend:4000   (identity headers stripped)
                   ├─► /graphql-auth    → auth_request to authentik,
                   │                      then gamereviews-backend:4000 with X-authentik-* headers
                   └─► /outpost.goauthentik.io → authentik-server:9000
```

The backend refuses to honour identity headers on `/graphql`, so even if the
proxy were misconfigured, sending `X-authentik-uid` to the public path cannot
authenticate anyone. That is deliberate redundancy: the proxy strips the
headers *and* the application ignores them.

## Why a proxy provider and not an OAuth2 provider

This is the obvious question to ask, and the short answer is that you are
already using OAuth. A proxy provider is not an alternative to OAuth — it is an
OAuth2 client. It has its own `client_id` on the provider's **Authentication**
tab, and when you click **Sign in** the browser runs an ordinary authorization
code flow against authentik. The only difference from a textbook OIDC
integration is *who holds the client credentials*: the outpost, rather than
GameReviews itself.

So the choice is not "OAuth or not". It is where the OAuth client lives:

| | Proxy provider (today) | OAuth2 provider |
| - | ---------------------- | --------------- |
| OAuth client | the authentik outpost | the GameReviews backend |
| App-side auth code | none | discovery, JWKS, PKCE, callback, session, refresh, logout |
| Endpoints | must be split, `/graphql` + `/graphql-auth` | one `/graphql` |
| Trust basis | app is unreachable except via SWAG, proxy proves itself with a shared secret | signature on a token, verified in-process |
| Revocation | when the outpost cookie expires or the user signs out | access-token lifetime, or introspection per request |
| 2FA | flow property, unaffected | flow property, unaffected |

The endpoint split is the honest cost of the current design. It exists because
nginx's `auth_request` has to decide before it can read the GraphQL body, so
"is this a mutation?" cannot inform "should this be authenticated?". Moving the
OAuth client into the backend would collapse the two paths into one and let
`requireAuth` do that job per field, which is where it belongs. It would also
retire the shared-secret header trust in `backend/src/lib/identity.ts` and the
frontend's endpoint-splitting link in `frontend/src/apollo.ts`.

What it costs is real code in the security-critical path: the callback handler,
session cookie flags, CSRF protection (a cookie-borne session on a POST endpoint
needs it, which header identity did not), token refresh, RP-initiated logout via
`end_session_endpoint`, and JWKS caching against key rotation. It also rewrites
a good part of the backend suite, since `identity.test.ts` and the endpoint-split
assertions are testing a trust model that would no longer exist.

One migration detail to settle first: `provisionUser` keys local rows on
`authentikUid`, currently the outpost's `X-authentik-uid` (a hashed user
identifier). Whether the OIDC `sub` is byte-identical depends on the provider's
subject mode, so check that on your instance before switching — if it differs,
existing users get new rows and lose their reviews unless the migration maps
them across.

None of this is out of reach; it is simply a larger change than it looks, and
worth its own PR rather than riding along with a proxy-config fix. The plan for
doing it is in
[docs/oauth2-migration-plan.md](oauth2-migration-plan.md), including the open
questions that block starting.

## Prerequisites

- A working authentik instance reachable by SWAG, with its container named
  `authentik-server` on a shared user-defined bridge network.
- SWAG with `authentik-server.conf` in place (rename
  `/config/nginx/authentik-server.conf.sample`). This provides the
  `/outpost.goauthentik.io` locations and the `@goauthentik_proxy_signin`
  redirect target.
- A DNS record for the site, for example `gamereviews.example.com`.

## Step 1 — generate the proxy secret

The backend only trusts identity headers on requests that carry a shared secret
proving they came through SWAG. Generate one:

```bash
openssl rand -hex 32
```

Put it in the stack's `.env`: as `AUTH_PROXY_SECRET` for the development stack,
or as `GAMEREVIEWS_AUTH_PROXY_SECRET` for the deployment snippet, which prefixes
its variables because that file is shared with your other services. The same
value goes into the SWAG configuration in step 6. In production the backend
refuses to start without it.

## Step 2 — create the proxy provider

In authentik, go to **Applications → Providers → Create** and choose
**Proxy Provider**. (Not an OAuth2 provider — see
[Why a proxy provider and not an OAuth2 provider](#why-a-proxy-provider-and-not-an-oauth2-provider)
above, which also covers what switching would take.)

| Field | Value |
| ----- | ----- |
| Name | `gamereviews-proxy` |
| Authorization flow | your usual explicit or implicit consent flow |
| Mode | **Forward auth (single application)** |
| External host | `https://gamereviews.example.com` |

The external host must match the URL people actually type, including the scheme
and any non-standard port. The outpost compares incoming requests against it.

Leave **Unauthenticated Paths** empty. Path exemptions are handled in nginx
here, because only `/graphql-auth` is ever sent for authorisation in the first
place.

## Step 3 — create the application

**Applications → Applications → Create**:

| Field | Value |
| ----- | ----- |
| Name | `GameReviews` |
| Slug | `gamereviews` |
| Provider | `gamereviews-proxy` |

Then bind whoever should be able to post reviews. Under the application's
**Policy / Group / User Bindings** tab, bind a group such as `gamereviews-users`.
Anyone not bound can still read the site — they simply cannot sign in, so they
cannot write.

## Step 4 — attach the provider to an outpost

**Applications → Outposts**. Edit the **authentik Embedded Outpost** and add
`GameReviews` to its applications. If you run a standalone outpost instead,
add it there and point step 6's `proxy_pass` at that container on port 9000.

The outpost must be healthy before anything else works. The Outposts list shows
its last seen time and version.

## Step 5 — require 2FA

2FA is a property of the authentication flow, not of this application, so
configuring it here applies to every app behind your authentik instance.

If your authentication flow does not already validate a second factor, add an
**Authenticator Validation** stage to it (**Flows and Stages → Stages →
Create**):

| Field | Value |
| ----- | ----- |
| Device classes | `TOTP`, and `WebAuthn` if you use passkeys or a security key |
| Not configured action | **Configure** |
| Configuration stages | your TOTP setup stage (and WebAuthn setup stage) |
| Last validation threshold | `0` to prompt every login, or e.g. `hours=12` |

Setting **Not configured action** to *Configure* is what makes 2FA mandatory
rather than optional: a user without an enrolled authenticator is walked
through enrolment mid-login instead of being let through. The alternatives are
*Skip*, which silently allows single-factor logins, and *Deny*, which locks out
anyone not already enrolled.

Bind the stage to your authentication flow (**Flows → your flow → Stage
Bindings**) after the Password stage and before the User Login stage.

To require two different methods, add a second Authenticator Validation stage
with a different device class — each stage checks only its own classes.

## Step 6 — SWAG proxy configuration

The configuration is version-controlled at
[`deploy/swag/gamereviews.subdomain.conf`](../deploy/swag/gamereviews.subdomain.conf).
Copy it into place and substitute the secret from step 1:

```bash
sed "s|REPLACE_WITH_AUTH_PROXY_SECRET|$AUTH_PROXY_SECRET|" \
  deploy/swag/gamereviews.subdomain.conf \
  > /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
```

The file follows SWAG's own proxy-conf layout — version header, `client_max_body_size`,
then per-location `set $upstream_app` / `$upstream_port` / `$upstream_proto` — so it
reads like the samples in `/config/nginx/proxy-confs`. There is no `http2 on;`
because SWAG's `nginx.conf` already sets it at the `http` level for every server.

Four details in that file are load-bearing and worth understanding before you
change it:

- **The geoblocking check needs SWAG's geoip2 setup.** `$lan-ip` and
  `$geo-whitelist` are defined by that setup, not by nginx, so if you do not run
  geoip2 the config will not load at all — nginx exits with
  `unknown "lan-ip" variable`. Delete both `if` lines in that case. Also note
  what they do: a site whose reviews are otherwise readable by anyone becomes
  readable only from your whitelisted countries and your LAN.
- **`location = /graphql` blanks the identity headers.** The backend ignores
  them on that path anyway, but a client should never get as far as having them
  merely ignored. It blanks all five headers `authentik-location.conf` would
  set, not just the three the backend reads.
- **`location = /graphql-auth` does not use `@goauthentik_proxy_signin`.** SWAG's
  stock `authentik-location.conf` redirects a 401 to the login page, which is
  right for a whole-page request and wrong here: this endpoint is only ever
  called by `fetch()`, which would follow the 302 and try to parse an HTML login
  page as a GraphQL response. It returns a plain 401 instead, which the app
  reads as "signed out" — a normal state, since reviews are public.
- **Both `proxy_set_header` blocks overwrite client-supplied values.** That is
  what stops someone sending their own `X-authentik-uid`.

Reload SWAG afterwards: `docker exec swag nginx -s reload`, or restart the
container.

## Step 7 — backend environment

The deployment snippet sets these for you from `.env`; see
[docs/deployment.md](deployment.md). The values that matter here:

```env
AUTH_PROXY_SECRET=<the value from step 1>
TRUST_PROXY_HOPS=1
NODE_ENV=production
CORS_ORIGINS=
```

`TRUST_PROXY_HOPS=1` because SWAG proxies to the backend directly. Get this
wrong and rate limiting keys on SWAG's container IP, so one abusive client
locks out everyone. `CORS_ORIGINS` stays empty: everything is same-origin, so
no CORS headers are needed at all.

Do not publish the backend's port to the host. Header-based identity is only
sound while the only route to the API is through the proxy.

`AUTH_DEV_IDENTITY` must not be set. It is ignored whenever `NODE_ENV` is
`production`, but leaving it in a production `.env` is asking for trouble the
day someone changes `NODE_ENV`.

## Step 8 — verify

Public reads work without a session:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{recentReviewsCount}"}'
# {"data":{"recentReviewsCount":0}}
```

Writes are refused without one:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation{createGame(input:{title:\"x\"}){id}}"}'
# UNAUTHENTICATED
```

Header smuggling is refused — this must **not** return a user:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -H 'X-authentik-uid: forged' -H 'X-authentik-username: admin' \
  -d '{"query":"{me{username}}"}'
# {"data":{"me":null}}
```

The authenticated endpoint answers 401 rather than redirecting:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://gamereviews.example.com/graphql-auth \
  -H 'content-type: application/json' -d '{"query":"{me{id}}"}'
# 401
```

Then in a browser: load the site signed out and confirm reviews render with a
**Sign in** button. Click it, complete the authentik flow including the 2FA
prompt, and confirm you land back where you started with your username in the
navbar. Post a review, then use **Sign out** and confirm you are signed out of
authentik itself, not just this app.

## Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| Backend exits at startup complaining about `AUTH_PROXY_SECRET` | Not set. Intentional: it will not start in a state where headers are trusted without proof. |
| Signed in, but the navbar still shows **Sign in** | `/graphql-auth` is returning 401. Check the outpost is healthy, that the provider's External host exactly matches the URL, and that your user is bound to the application. |
| Signed in and `me` returns null with a 200 | Headers reached the backend but the secret did not match, so they were ignored. Compare the nginx literal with `AUTH_PROXY_SECRET`. |
| Everyone gets rate limited at once | `TRUST_PROXY_HOPS` does not match the real number of proxies. |
| `upstream sent too big header` | Raise `proxy_buffers` / `proxy_buffer_size`. |
| A second account appeared as `yourname-a1b2c3` | An unrelated local row already held that username, so provisioning disambiguated it. |
| Login redirect loops | The `/outpost.goauthentik.io` location is being authenticated. It must have `auth_request off`. |

## Notes on the trust model

Identity is asserted by headers, which is only safe under three conditions,
all of which the configuration above establishes:

1. The backend is unreachable except through SWAG.
2. SWAG overwrites every `X-authentik-*` header and `X-Proxy-Secret` on the
   authenticated path, so client-supplied values never survive, and blanks them
   on the public path.
3. The backend treats a missing or unverified header set as anonymous, never as
   trusted.

Point 3 matters more than it looks. authentik's CVE-2026-25748 was exactly this
failure mode: a malformed cookie made the auth endpoint succeed without setting
any `X-authentik-*` headers, and applications that treated "no header" as
"trusted upstream" granted access. Here, no headers means no user, and every
mutation calls `requireAuth`.

What this design does not give you is per-request revocation. Once the outpost
has issued its session cookie, it is valid until it expires or the user signs
out; revoking access in authentik does not immediately kill an in-flight
session. For a home server this is normally an acceptable trade.
