# Migrating from the proxy provider to an OAuth2 provider

This plan replaces authentik's proxy outpost with GameReviews acting as its own
OAuth2/OIDC client. It is written to be executed as a stack of small PRs, not as
one change.

Nothing here is started. The questions in the last section block the first
commit, and some of them can only be answered against your authentik instance.

## Why bother

Not "to get OAuth" — a proxy provider is already an OAuth2 client, with its own
`client_id` on the provider's Authentication tab. The browser already runs an
authorization code flow; the outpost is simply the one holding the credentials.

The reason to move the client into the backend is that it collapses the endpoint
split. `PUBLIC_PATH` and `AUTHENTICATED_PATH` exist in `backend/src/app.ts` only
because nginx's `auth_request` must decide before it can read the GraphQL body,
so "is this a mutation?" cannot inform "should this be authenticated?". The
schema is mounted twice, `buildContext` takes a `trustIdentity` flag, and
`frontend/src/apollo.ts` maintains a hand-kept list of which operations need
identity. All of that is scaffolding around a proxy limitation.

Second reason: identity stops being an assertion and becomes a verified fact.
Today `readIdentity` trusts headers on the strength of a shared secret plus the
backend being unreachable except through SWAG. After this, a session is proven
in-process and the network topology stops being load-bearing for correctness.

## Recommended shape: BFF, not a public client

Two ways to do this. I recommend the first.

**Backend-for-frontend.** The backend is a confidential client. It runs the
authorization code flow with PKCE, exchanges the code server-side, stores the
tokens where the browser cannot see them, and issues its own `HttpOnly` session
cookie. The SPA never handles a token; it keeps asking `me` who it is, exactly
as it does now.

**SPA as public client.** The browser runs the flow itself and holds an access
token in memory, sending it as a bearer header. The API validates the JWT per
request against JWKS.

BFF wins here on the specifics of this deployment. The SPA and API are already
same-origin behind one hostname, which is the condition that makes BFF cheap.
There is no token in reachable JavaScript, so an XSS bug cannot walk off with
credentials. Refresh happens server-side with no silent-iframe machinery. And
`AuthContext` barely changes, because "the server tells us who we are via the
`me` query" is already how it works. The public-client route would mean a token
in the browser and a rewrite of the frontend auth layer, for no gain on a
single-origin site.

The cost of BFF is server-side session state, addressed below.

## Phases

Each phase is a commit that leaves the tree green.

### 1. Session storage

A `Session` model in `backend/prisma/schema.prisma` plus a migration:
session id (opaque, random, the cookie value), user id, the access and refresh
tokens, expiry, and the `sub` it was issued for. Server-side rather than a
stateless encrypted cookie, because revocation was one of the stated reasons for
doing this at all, and a stateless cookie cannot be revoked before it expires.
Postgres and Prisma are already here, so this is a table, not a dependency.

Include a sweep for expired rows. A `DELETE` on the read path is enough at this
scale; no scheduler.

### 2. OIDC client and the auth routes

`backend/src/lib/oidc.ts`: discovery against
`https://authentik.example.com/application/o/gamereviews/.well-known/openid-configuration`,
cached, with JWKS caching that tolerates key rotation.

`backend/src/routes/auth.ts` mounted before the GraphQL middleware:

- `GET /auth/login` — generate PKCE verifier, state and nonce, stash them in a
  short-lived cookie, redirect to the authorization endpoint. Carry `returnTo`
  through `state`, validated against a relative-path allowlist so this cannot
  become an open redirect.
- `GET /auth/callback` — verify state, exchange the code, validate the ID token
  (signature, `iss`, `aud`, `nonce`, expiry, clock skew), call `provisionUser`,
  create the session, set the cookie, redirect to `returnTo`.
- `POST /auth/logout` — delete the session row, clear the cookie, then redirect
  to authentik's `end_session_endpoint` so the user is signed out of authentik
  too, not just of this app. That matches today's behaviour, where the outpost's
  `/sign_out` ends the authentik session.

Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. `Lax` rather than
`Strict` so returning from the authentik redirect still carries the cookie.

Library: `openid-client`. It is the certified Node implementation and keeps the
fiddly parts — PKCE, token validation, discovery — out of code we would
otherwise have to review ourselves. `jose` comes along with it for JWKS.

### 3. Context, and collapsing the endpoint split

`backend/src/lib/identity.ts` loses `readIdentity`, `proxyIsTrusted`,
`assertIdentityConfig` and the `X-Proxy-Secret` machinery. `provisionUser` stays
as it is — it is keyed on a stable subject identifier and does not care where
that identifier came from.

`buildContext` loses `trustIdentity` and instead reads the session cookie,
looks up the session, and refreshes the access token when it has expired.

`app.ts` mounts the schema once at `/graphql`. `AUTHENTICATED_PATH` goes away.
`requireAuth` is unchanged and is now the only thing deciding whether a field
needs a user — which is the point of the exercise.

Keep `AUTH_DEV_IDENTITY` working for local development, since there is no
authentik in front of `docker compose up` either way. It stays gated on
`isProduction()`.

### 4. Frontend

`frontend/src/apollo.ts` drops the `split` link and the `IDENTITY_QUERIES` set;
one `createHttpLink` to `/graphql` with `credentials: "same-origin"`.

`frontend/src/lib/authentik.ts` points at the app's own routes instead of the
outpost: `/auth/login?returnTo=…` and a `POST` to `/auth/logout`.

`AuthContext` simplifies. The comment about a signed-out visitor producing a 401
network error stops being true — `me` now returns `{ me: null }` with a 200 — so
`errorPolicy: "all"` is no longer load-bearing.

### 5. Proxy and deployment

`deploy/swag/gamereviews.subdomain.conf` gets simpler and, notably, less
security-critical:

- `location /auth/` proxies to the backend and must not be behind
  `auth_request`.
- The `auth_request` block, the `@graphql_unauthenticated` fallback, the
  identity-header stripping and the `X-Proxy-Secret` injection all go.
- `include /config/nginx/authentik-server.conf;` goes, along with the
  `proxy_buffers` bump that existed for the outpost's headers.
- One `location = /graphql` remains.

Config changes: `AUTH_PROXY_SECRET` is replaced by `OIDC_ISSUER`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `OIDC_REDIRECT_URI` across
`.env.example`, `deploy/gamereviews.yml`, `docker-compose.yml` and
`.github/workflows/ci.yml`. This is a breaking env change: the stack will not
start after pulling the new image until the new variables are set. Worth calling
out in the runbook rather than discovering it on a Watchtower update at 3am.

### 6. Tests

`backend/test/identity.test.ts` is testing a trust model that will no longer
exist and gets replaced rather than edited. The new file should cover: an unknown
session cookie is anonymous; an expired session is anonymous; a session for a
deleted user is anonymous; a tampered cookie value is anonymous; `state`
mismatch on the callback is rejected; a `returnTo` pointing off-site is refused.

The rest of the suite mostly loses its second endpoint. `helpers.ts` needs a
`sessionFor(identity)` that inserts a session row and returns the cookie,
replacing `identityHeaders`. The endpoint-split assertions in `identity.test.ts`
and the "smuggled to the public endpoint" case become meaningless and go.

`authorization.test.ts`, `privacy.test.ts`, `provisioning.test.ts`,
`game-mutations.test.ts`, `response-size.test.ts`, `query-limits.test.ts` and
`rate-limit.test.ts` should survive as behaviour, with mechanical changes to how
they authenticate.

`frontend/test/apollo-routing.test.ts` is deleted — there is no routing left to
test.

Add one thing the current suite has no equivalent of: an end-to-end pass of the
authorization code flow against a stub OIDC provider, so the callback validation
is exercised rather than assumed.

## Things that will bite

**CSRF becomes a live concern in a way it is not today.** Once a browser-attached
cookie authorizes mutations, a cross-site POST can carry it. Three layers stand
in the way, and they stop different attacks, so it is worth being deliberate
about all three rather than assuming one covers it:

- `SameSite=Lax` on the session cookie, which stops the cookie being attached to
  a cross-site POST at all.
- Apollo Server's `csrfPrevention`, on by default in v4+ (confirmed against the
  Apollo docs). It requires a `Content-Type` of `application/json`, which an HTML
  form cannot set, so a form-based CSRF POST is rejected with a 400. It does
  *not* by itself stop a cross-site `fetch()` — that is the next layer's job.
- CORS. `allowedOrigins()` returns `false` in production, so a cross-origin
  `fetch()` sending `application/json` triggers a preflight that gets no
  permissive response and the browser never sends the operation. Worth an
  explicit `Origin` check too, so this does not rest solely on a config default.

This risk is not entirely new — the outpost's cookie is browser-attached as well,
and it is the same three layers covering it today. But `app.ts` does not set
`csrfPrevention` explicitly, so one of the three is running on an unstated
default. Make it explicit and add a test, because a future Apollo major changing
that default is exactly the kind of thing nobody notices.

**Cached SPA bundles.** A browser holding the old JavaScript will POST to
`/graphql-auth` and get a 404 after phase 5. Either keep the path as an alias
for one release or accept it. Minor for a home server with a handful of users.

**Rate limiting.** `documents(req)` in `security.ts` inspects the GraphQL body to
find RAWG operations. Collapsing to one endpoint does not change that, but the
new `/auth/*` routes sit outside the limiters entirely and should get their own
bucket — `/auth/login` triggers an outbound redirect and `/auth/callback` does a
token exchange, so both are cheap to abuse.

## Open questions

The first one is a genuine blocker; the rest change the shape of the work.

### 1. Does the OIDC `sub` match the existing `authentikUid` values?

This decides whether the migration is invisible or whether every existing user
gets a fresh row and silently loses their reviews. `provisionUser` looks up
`User.authentikUid`, currently populated from the outpost's `X-authentik-uid`,
which authentik documents as a hashed user identifier. The OAuth2 provider's
`sub` is governed by a separate **Subject mode** setting, so the two are only
equal for some values of it.

Where to look:

- authentik admin → **Applications → Providers →** your OAuth2 provider →
  **Edit → Advanced protocol settings → Subject mode**. Note the value.
- Fetch the discovery document to confirm the issuer, then complete one login as
  a test user and decode the ID token's `sub`:
  `https://authentik.example.com/application/o/gamereviews/.well-known/openid-configuration`
- Compare against what is already stored:
  `docker exec -it gamereviews-db psql -U gamereview -d gamereview -c 'SELECT "authentikUid", username FROM "User";'`

If they differ, phase 1 gains a one-off backfill keyed on email or username, and
that mapping needs to be right before anyone logs in through the new path.

### 2. Confidential or public client, and where does the secret live?

I have assumed confidential, which is what BFF requires. Confirm the provider's
**Client type** is set to Confidential and decide whether the client secret goes
in the stack `.env` alongside `GAMEREVIEWS_DB_PASSWORD` or somewhere else. Found
at provider → **Protocol settings → Client type / Client secret**.

### 3. Long sessions, or re-login?

Refresh tokens are not automatic. Since authentik 2024.2 an app gets only an
access token unless it requests `offline_access` *and* the provider includes the
`offline_access` scope mapping. So: do you want sessions that survive for days
via refresh, or short sessions that send people back through authentik — 2FA
prompt included — when the access token expires?

Where to look: provider → **Advanced protocol settings → Scopes**, and the
access/refresh token validity fields on the same screen.

### 4. Should the proxy provider be deleted afterwards?

Access control survives the switch — in authentik, policy and group bindings are
a property of the **Application**, not the provider, so your `gamereviews-users`
binding keeps gating who can obtain a token. I would still verify that with an
unbound test user before deleting anything, because the failure mode is the whole
site becoming writable by any authentik account.

The related question is whether you want to keep forward auth on any path for
defence in depth. I do not think it earns its keep once auth is in-app: it would
reintroduce the double login and the endpoint split this change exists to remove.

### 5. How should local development authenticate?

Options: keep `AUTH_DEV_IDENTITY` as-is (smallest change, and the local stack has
no authentik in front of it either way); register `http://localhost:4000/auth/callback`
as a second redirect URI and use the real instance; or run a stub OIDC provider
in compose. I lean toward the first, with the second available by setting the
`OIDC_*` variables locally, so the real flow can be exercised when needed.

If you want option two, the redirect URI goes in provider → **Protocol settings
→ Redirect URIs**.

### 6. Two naming decisions

`User.authentikUid` still describes the field accurately after the migration
(it is still an authentik subject identifier), so I would leave it rather than
introduce a second spelling and a rename migration. Say if you would rather it
were `oidcSub`.

New dependencies: the repo uses caret ranges everywhere except `esbuild`, and
Renovate manages bumps. I will follow that for `openid-client` unless you want
it pinned exactly.
