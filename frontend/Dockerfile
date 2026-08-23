# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# npm ci installs exactly what the lockfile pins and fails if the two have
# drifted, which is what makes the build reproducible and Renovate-friendly.
RUN npm ci --no-audit --no-fund

COPY . .

# The app talks to same-origin GraphQL paths, which is what lets the authentik
# session cookie and the outpost's identity headers apply to API calls too.
#   /graphql       public reads
#   /graphql-auth  guarded by the authentik outpost
ARG VITE_API_URL=/graphql
ARG VITE_API_AUTH_URL=/graphql-auth
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_AUTH_URL=$VITE_API_AUTH_URL

RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
# The unprivileged variant runs entirely as uid 101 and listens on 8080; the
# stock nginx image keeps its master process as root, which this container has
# no need for.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
