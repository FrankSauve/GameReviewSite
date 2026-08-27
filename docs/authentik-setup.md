# Setting up authentik in front of GameReviews

This site has no login form and no password storage of its own. authentik
authenticates people — 2FA included — and GameReviews learns who they are by
completing an OpenID Connect login against it. This guide covers the authentik
objects to create, the values to give the backend, the reverse proxy
configuration, and how to verify the result.

## How it fits together

GameReviews is a confidential OAuth2 client. It runs the authorization code flow
with PKCE, exchanges the code for an ID token server-side, and turns the result
into a session cookie of its own. The browser never holds a token, and the
reverse proxy is not involved in authentication at all.

| Path | Served by | Purpose |
| ---- | --------- | ------- |
| `/` | frontend | the SPA, readable by anyone |
| `/graphql` | backend | the whole API; each field decides whether it needs a user |
| `/auth/login` | backend | starts the flow, redirects to authentik |
| `/auth/callback` | backend | receives the authorization code, issues the session |
| `/auth/logout` | backend | drops the session, then ends authentik's |

```
browser ──► SWAG ──┬─► /         → gamereviews-frontend:8080
                   ├─► /graphql  → gamereviews-backend:4000
                   └─► /auth/*   → gamereviews-backend:4000
                                        │
                                        └─► authentik  (OIDC, server to server)
```

Reviews are public. Writing requires a session, and every mutation calls
`requireAuth`. A signed-out visitor gets `{ "me": null }` and a 200, which is an
ordinary state rather than an error.

### If you are coming from the proxy provider

Earlier versions of this deployment used a **proxy provider** in forward-auth
mode: nginx asked an authentik outpost about every request to a second, guarded
GraphQL endpoint, and the outpost passed identity back in `X-authentik-*`
headers. That is gone.

It was replaced because the two-endpoint split was scaffolding around a proxy
limitation — `auth_request` decides before it can read a GraphQL body, so it
cannot tell a mutation from a query. With the app holding the OAuth credentials,
that decision moves next to the resolvers and one endpoint suffices. It also
retires a shared secret and the assumption that the backend is unreachable except
through SWAG.

To clean up, after this is working: delete the proxy provider, remove
GameReviews from the outpost's applications, and drop
`GAMEREVIEWS_AUTH_PROXY_SECRET` from your `.env`. The `authentik-server.conf`
include is no longer needed in this site's proxy conf, though leave the file in
place if other services use it.

## Prerequisites

- A working authentik instance, reachable from the backend container over HTTPS.
  Unlike the proxy setup, the two talk **server to server**, so it does not need
  to share a network with SWAG.
- SWAG, or any reverse proxy that terminates TLS for one hostname.
- A DNS record for the site, for example `gamereviews.example.com`.

## Step 1 — create the OAuth2 provider

**Applications → Providers → Create**, and choose **OAuth2/OpenID Provider**.

| Field | Value |
| ----- | ----- |
| Name | `gamereviews-oidc` |
| Authorization flow | your usual explicit or implicit consent flow |
| Client type | **Confidential** |
| Redirect URIs | `https://gamereviews.example.com/auth/callback` |

**Confidential** is required, not a preference: the code is exchanged from the
backend using a client secret, which is what lets the browser stay out of it.

Leave the scopes at their defaults. `openid`, `profile` and `email` are what this
app asks for, and `profile` is what supplies `preferred_username`. There is no
need for `offline_access`: the app never calls authentik again after login, so it
has nothing to refresh.

Copy the **Client ID** and **Client secret** from the provider's *Protocol
settings*. They become `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` in step 4.

### If you want a tidy sign-out landing page

By default authentik shows its own page after signing out. To come back to the
site instead, add `https://gamereviews.example.com/` to the provider's **Redirect
URIs** as a second entry and set `OIDC_POST_LOGOUT_REDIRECT_URI` to it. authentik
validates post-logout redirects against that same list, which is why an
unregistered value silently breaks logout — hence it being opt-in.

## Step 2 — create the application

**Applications → Applications → Create**:

| Field | Value |
| ----- | ----- |
| Name | `GameReviews` |
| Slug | `gamereviews` |
| Provider | `gamereviews-oidc` |

The slug matters beyond cosmetics: it appears in the issuer URL you will need in
step 4.

Then bind whoever should be able to post reviews. Under the application's
**Policy / Group / User Bindings** tab, bind a group such as `gamereviews-users`.

Bindings live on the *application*, not the provider, so this works exactly as it
did with the proxy provider — an unbound user cannot obtain a token, and
therefore cannot get a session. Anyone not bound can still read the site.

## Step 3 — require 2FA

Unchanged by this migration: 2FA is a property of the authentication flow, not of
the application or the provider, so configuring it applies to every app behind
your authentik instance.

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
rather than optional: a user without an enrolled authenticator is walked through
enrolment mid-login instead of being let through. The alternatives are *Skip*,
which silently allows single-factor logins, and *Deny*, which locks out anyone
not already enrolled.

Bind the stage to your authentication flow (**Flows → your flow → Stage
Bindings**) after the Password stage and before the User Login stage.

## Step 4 — backend environment

The deployment snippet sets these from `.env`; see
[docs/deployment.md](deployment.md). The values that matter here:

```env
OIDC_ISSUER=https://authentik.example.com/application/o/gamereviews/
OIDC_CLIENT_ID=<from step 1>
OIDC_CLIENT_SECRET=<from step 1>
OIDC_REDIRECT_URI=https://gamereviews.example.com/auth/callback
TRUST_PROXY_HOPS=1
NODE_ENV=production
CORS_ORIGINS=
```

`OIDC_ISSUER` is the per-application issuer, ending in your slug and a trailing
slash. Confirm it by fetching the discovery document, which is the same thing the
backend does at startup:

```bash
curl -s https://authentik.example.com/application/o/gamereviews/.well-known/openid-configuration | jq .issuer
```

The backend refuses to start in production if any of the four is missing. That is
deliberate — without them nobody can sign in, and there is no proxy to
authenticate on the app's behalf.

`OIDC_REDIRECT_URI` must match the provider's Redirect URI exactly, including
scheme and any non-standard port.

`TRUST_PROXY_HOPS=1` because SWAG proxies to the backend directly. Get this wrong
and rate limiting keys on SWAG's container IP, so one abusive client locks out
everyone. `CORS_ORIGINS` stays empty: the SPA and API share a hostname, so no
CORS headers are needed and none are sent.

`AUTH_DEV_IDENTITY` must not be set. It is ignored whenever `NODE_ENV` is
`production`, but leaving it in a production `.env` is asking for trouble the day
someone changes `NODE_ENV`.

Optional: `SESSION_TTL_HOURS`, defaulting to 720 (30 days) to match authentik's
own session length. See the note on revocation at the end.

## Step 5 — SWAG proxy configuration

The configuration is version-controlled at
[`deploy/swag/gamereviews.subdomain.conf`](../deploy/swag/gamereviews.subdomain.conf).
There is nothing to substitute in it any more — no secret, and no participation
in authentication — so copy it into place as-is:

```bash
cp deploy/swag/gamereviews.subdomain.conf \
  /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
```

Two things in that file are worth understanding before you change it:

- **The geoblocking check needs SWAG's geoip2 setup.** `$lan-ip` and
  `$geo-whitelist` are defined by that setup, not by nginx, so if you do not run
  geoip2 the config will not load at all — nginx exits with
  `unknown "lan-ip" variable`. Delete both `if` lines in that case. Also note
  what they do: a site whose reviews are otherwise readable by anyone becomes
  readable only from your whitelisted countries and your LAN.
- **`location /auth/` must not be given any proxy-level authentication.** Those
  routes are the authentication. Putting `auth_request` in front of them, or in
  front of `/graphql`, would produce a redirect loop.

Reload SWAG afterwards: `docker exec swag nginx -s reload`, or restart the
container.

## Step 6 — verify

Public reads work without a session:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{recentReviewsCount}"}'
# {"data":{"recentReviewsCount":0}}
```

Anonymous callers are anonymous, with a 200 rather than a 401:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' -d '{"query":"{me{username}}"}'
# {"data":{"me":null}}
```

Writes are refused without a session:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"mutation{createGame(input:{title:\"x\"}){id}}"}'
# UNAUTHENTICATED
```

The old proxy headers are inert — this must **not** return a user:

```bash
curl -s https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' \
  -H 'X-authentik-uid: forged' -H 'X-authentik-username: admin' \
  -d '{"query":"{me{username}}"}'
# {"data":{"me":null}}
```

A request claiming to come from another site is refused outright:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://gamereviews.example.com/graphql \
  -H 'content-type: application/json' -H 'Origin: https://evil.example.com' \
  -d '{"query":"{me{username}}"}'
# 403
```

Sign-in redirects to authentik rather than answering itself:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  'https://gamereviews.example.com/auth/login?returnTo=%2F'
# 302 https://authentik.example.com/application/o/authorize/?...
```

Then in a browser, which is the only thing that exercises the whole flow: load
the site signed out and confirm reviews render with a **Sign in** button. Click
it, complete the authentik flow including the 2FA prompt, and confirm you land
back where you started with your username in the navbar. Post a review. Then use
**Sign out** and confirm you are signed out of authentik itself, not just of this
app.

## Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| Backend exits at startup complaining about OIDC | One of the four `OIDC_*` values is missing. Intentional: it will not serve a site nobody can sign in to. |
| `/auth/login` returns 503 | Same thing, outside production, where it is a warning rather than a fatal error. |
| `/auth/login` returns 502 | Discovery failed. The backend cannot reach `OIDC_ISSUER`, or the slug in it is wrong. Check with the `curl` in step 4. |
| authentik says the redirect URI is invalid | `OIDC_REDIRECT_URI` and the provider's Redirect URIs disagree. They must match exactly, scheme and port included. |
| Sign-in ends on a 400 "could not be completed" | Usually a stale tab: the 10-minute transaction cookie expired, or the back button replayed a spent code. Start again from the site. The backend log has the specific reason. |
| Signed in, but the navbar still shows **Sign in** | The session cookie was not set or is not coming back. Confirm the site is HTTPS — the cookie is `Secure` in production — and that `/graphql` and `/auth/*` are on the same hostname as the SPA. |
| Everything returns 403 | A cross-origin request. The SPA is being served from a different origin than the API; they must share one. |
| Signing out leaves you on an authentik error page | `OIDC_POST_LOGOUT_REDIRECT_URI` is set to something not registered as a Redirect URI. Register it or unset it. |
| Everyone gets rate limited at once | `TRUST_PROXY_HOPS` does not match the real number of proxies. |
| A second account appeared as `yourname-a1b2c3` | An unrelated local row already held that username, so provisioning disambiguated it. |

## Notes on the trust model

Identity is now a verified fact rather than an assertion. The ID token's
signature is checked against authentik's JWKS, its `iss`, `aud`, `nonce` and
expiry are validated, and the authorization code is bound to the request that
started it by PKCE. None of that depends on the network topology being right.

What still depends on configuration is CSRF, and it has three overlapping
defences because a session cookie — unlike the old proxy headers — is attached by
the browser to requests other sites initiate:

1. The session cookie is `SameSite=Lax`, so it is not sent on a cross-site POST.
2. Apollo Server's CSRF prevention requires a `Content-Type` an HTML form cannot
   produce, so a form-based attack is rejected before it reaches a resolver.
3. The backend refuses any request whose `Origin` names another host.

Two limitations worth knowing:

**Revocation lags.** Because the app asks for no refresh token, it never
re-checks with authentik after login. Revoking someone in authentik does not end
a session already issued here; it lasts until it expires or the `Session` row is
deleted. `SESSION_TTL_HOURS` is the outer bound, 30 days by default. To end
someone's access immediately, delete their rows:

```sql
DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE username = 'name');
```

**Profile changes lag too.** Username and email are refreshed from the ID token
at each login rather than on every request, so a rename in authentik lands the
next time that person signs in.
