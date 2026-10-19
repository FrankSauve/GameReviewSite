# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci installs exactly what the lockfile pins and fails if the two have
# drifted, which is what makes the build reproducible and Renovate-friendly.
RUN npm ci --no-audit --no-fund

COPY . .

# The app talks to same-origin paths, which is what lets the session cookie the
# backend issues apply to API calls as well as to the sign-in routes.
#   /graphql     the whole API, authenticated per field
#   /auth/*      the OIDC login flow, served by the backend
ARG VITE_API_URL=/graphql
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
# The unprivileged variant runs entirely as uid 101 and listens on 8080; the
# stock nginx image keeps its master process as root, which this container has
# no need for.
#
# 1.29 rather than 1.27, and pinned by digest: 1.27-alpine is built on Alpine
# 3.21, whose OpenSSL packages carry two fixable CRITICAL advisories. 1.29-alpine
# is on Alpine 3.23 and measured zero. The digest is what Renovate updates; the
# tag alone would have let the base drift silently under a running deployment.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Included by every location block in default.conf. Deliberately not under
# conf.d/, which nginx globs into the http context on its own.
COPY security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
