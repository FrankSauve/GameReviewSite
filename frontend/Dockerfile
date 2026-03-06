# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install \
      --registry https://registry.npmjs.org \
      --no-audit \
      --no-fund

COPY . .

# VITE_API_URL can be overridden at build time:
#   docker-compose build --build-arg VITE_API_URL=https://api.example.com/graphql
ARG VITE_API_URL=http://localhost:4000/graphql
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
