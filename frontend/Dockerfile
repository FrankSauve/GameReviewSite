# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install \
      --registry https://registry.npmjs.org \
      --no-audit \
      --no-fund

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
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
