# Setting up authentik in front of GameReviews

GameReviews is a confidential OAuth2 client: authorization code flow with PKCE,
exchanged server-side, turned into a session cookie of its own.

| Path | Served by |
| ---- | --------- |
| `/` | frontend — the SPA, readable by anyone |
| `/graphql` | backend — the whole API; each field decides whether it needs a user |
| `/auth/login` | backend — starts the flow |
| `/auth/callback` | backend — receives the code, issues the session |
| `/auth/logout` | backend — drops the session, then ends authentik's |

## Prerequisites

- A working authentik instance, reachable from the backend container over HTTPS.
  They talk server to server — no shared network, no outpost.
- SWAG, or another reverse proxy terminating TLS for one hostname.
- A DNS record, e.g. `reviews.example.com`.

## 1. Create the OAuth2 provider

**Applications → Providers → Create → OAuth2/OpenID Provider**.

| Field | Value |
| ----- | ----- |
| Name | `gamereviews-oidc` |
| Authorization flow | your usual explicit or implicit consent flow |
| Client type | **Confidential** |
| Redirect URIs | `https://reviews.example.com/auth/callback` |

Leave the scopes at their defaults. `offline_access` is not needed.

Copy the **Client ID** and **Client secret** from *Protocol settings* — they
become `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` in step 4.

Optional: to land back on the site after sign-out, add
`https://reviews.example.com/` as a second **Redirect URI** and set
`OIDC_POST_LOGOUT_REDIRECT_URI` to it. An unregistered value breaks logout.

## 2. Create the application

**Applications → Applications → Create**:

| Field | Value |
| ----- | ----- |
| Name | `GameReviews` |
| Slug | `gamereviews` |
| Provider | `gamereviews-oidc` |

The slug appears in the issuer URL needed in step 4.

Under the application's **Policy / Group / User Bindings** tab, bind a group such
as `gamereviews-users`. An unbound user cannot write; they can still read.

## 3. Require 2FA

If your authentication flow does not already validate a second factor, add an
**Authenticator Validation** stage (**Flows and Stages → Stages → Create**):

| Field | Value |
| ----- | ----- |
| Device classes | `TOTP`, and `WebAuthn` if you use passkeys or a security key |
| Not configured action | **Configure** |
| Configuration stages | your TOTP setup stage (and WebAuthn setup stage) |
| Last validation threshold | `0` to prompt every login, or e.g. `hours=12` |

Set **Not configured action** to *Configure*, not *Skip* (which silently allows
single-factor logins) or *Deny* (which locks out anyone not already enrolled).

Bind the stage to your authentication flow (**Flows → your flow → Stage
Bindings**) after the Password stage and before the User Login stage. This applies
instance-wide, so if your other authentik apps already enforce 2FA it is done.

## 4. Backend environment

The deployment snippet sets these from `.env`; see
[deployment.md](deployment.md).

```env
OIDC_ISSUER=https://authentik.example.com/application/o/gamereviews/
OIDC_CLIENT_ID=<from step 1>
OIDC_CLIENT_SECRET=<from step 1>
OIDC_REDIRECT_URI=https://reviews.example.com/auth/callback
TRUST_PROXY_HOPS=1
NODE_ENV=production
CORS_ORIGINS=
```

`OIDC_ISSUER` is the per-application issuer, ending in your slug and a trailing
slash. Confirm it:

```bash
curl -s https://authentik.example.com/application/o/gamereviews/.well-known/openid-configuration | jq .issuer
```

`OIDC_REDIRECT_URI` must match the provider's entry exactly, scheme and port
included. `TRUST_PROXY_HOPS=1` for SWAG proxying directly — wrong values make rate
limiting key on SWAG's IP. `AUTH_DEV_IDENTITY` must not be set.

Optional: `SESSION_TTL_HOURS`, default 720 (30 days).

## 5. SWAG proxy configuration

```bash
cp deploy/swag/gamereviews.subdomain.conf \
  /path/to/swag/config/nginx/proxy-confs/gamereviews.subdomain.conf
docker exec swag nginx -s reload
```

Two things before you change that file:

- `$lan-ip` and `$geo-whitelist` come from SWAG's geoip2 setup, not from nginx. If
  you do not run geoip2, nginx will not load the config at all — delete both `if`
  lines. They also make an otherwise public site readable only from your
  whitelisted countries and your LAN.
- `location /auth/` must get no proxy-level authentication. Those routes *are* the
  authentication; `auth_request` in front of them, or of `/graphql`, is a redirect
  loop.

## 6. Verify

The curl checks are in [deployment.md § 8](deployment.md#8-verify). Then use a
browser: load the site signed out, sign in through authentik including the 2FA
prompt, confirm you land back where you started with your username in the navbar,
post a review, then sign out and confirm you are signed out of authentik itself.

## If you used the proxy provider

Once OIDC works: delete the proxy provider, remove GameReviews from the outpost's
applications, and drop `GAMEREVIEWS_AUTH_PROXY_SECRET` from your `.env`. Leave
`authentik-server.conf` in place if other services include it.

## Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| Backend exits at startup complaining about OIDC | One of the four `OIDC_*` values is missing. |
| `/auth/login` returns 503 | Same, outside production, where it is not fatal. |
| `/auth/login` returns 502 | Discovery failed — the backend cannot reach `OIDC_ISSUER`, or the slug is wrong. Check with the `curl` in step 4. |
| authentik says the redirect URI is invalid | `OIDC_REDIRECT_URI` and the provider's entry disagree. |
| Sign-in ends on a 400 "could not be completed" | Usually a stale tab: the 10-minute transaction cookie expired, or the back button replayed a spent code. Start again from the site; the backend log has the reason. |
| Signed in, but the navbar still shows **Sign in** | The session cookie is not coming back. The site must be HTTPS (the cookie is `Secure`), and `/graphql` and `/auth/*` must be on the SPA's hostname. |
| Everything returns 403 | The SPA and API are on different origins. |
| Signing out leaves you on an authentik error page | `OIDC_POST_LOGOUT_REDIRECT_URI` is not registered as a Redirect URI. |
| Everyone gets rate limited at once | `TRUST_PROXY_HOPS` does not match the real number of proxies. |
| A second account appeared as `yourname-a1b2c3` | An unrelated local row already held that username. |

## Two lags worth knowing

No refresh token is requested, so the app never re-checks with authentik after
login: revoking someone there does not end a session already issued here. To cut
access immediately:

```sql
DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE username = 'name');
```

Username and email refresh from the ID token at each login, so a rename in
authentik lands the next time that person signs in.
