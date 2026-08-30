# Built from the repository root, not from frontend/, because the SPA now
# depends on the `shared` workspace and a build context cannot reach outside
# itself. Both compose files and both CI jobs pass `context: .` with this file
# named explicitly.
#
# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# The root manifests plus the two workspaces this image needs. The backend's
# package.json is deliberately absent: `--workspace` limits the install to the
# SPA's slice, so Prisma and its engines never reach this image.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# npm ci installs exactly what the lockfile pins and fails if the two have
# drifted, which is what makes the build reproducible and Renovate-friendly.
RUN npm ci --no-audit --no-fund \
      --workspace @gamereviews/shared \
      --workspace game-review-site-frontend \
      --include-workspace-root

# Vite resolves the shared package through node_modules like any other, so it
# has to be compiled before the SPA that imports it.
COPY shared ./shared
RUN npm run build --workspace @gamereviews/shared

COPY frontend ./frontend

# The app talks to same-origin paths, which is what lets the session cookie the
# backend issues apply to API calls as well as to the sign-in routes.
#   /graphql     the whole API, authenticated per field
#   /auth/*      the OIDC login flow, served by the backend
ARG VITE_API_URL=/graphql
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace game-review-site-frontend

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
# The unprivileged variant runs entirely as uid 101 and listens on 8080; the
# stock nginx image keeps its master process as root, which this container has
# no need for.
#
# 1.29 rather than 1.27, and pinned by digest: 1.27-alpine is built on Alpine
# 3.21, whose OpenSSL packages carry two fixable CRITICAL advisories. 1.29-alpine
# is on Alpine 3.23 and measured zero. The digest is what Renovate updates; the
# tag alone would have let the base drift silently under a running deployment.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# Included by every location block in default.conf. Deliberately not under
# conf.d/, which nginx globs into the http context on its own.
COPY frontend/security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
