# ── Stage 1: Install → generate → build → prune ──────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Prevent @prisma/client postinstall from auto-running prisma generate
# (we call it explicitly below so the engine is only downloaded once)
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package.json package-lock.json ./
COPY prisma ./prisma

# npm ci installs exactly what the lockfile pins and fails if the two have
# drifted, which is what makes the build reproducible and Renovate-friendly.
RUN npm ci --no-audit --no-fund

# Generate Prisma client + download query engine for this platform (once)
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Remove devDependencies in-place; far faster than a second npm ci
RUN npm prune --omit=dev

# ── Stage 2: Lean runtime image (no network calls) ────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Safe default for a shipped image; the local compose stack overrides it.
ENV NODE_ENV=production

# The node image ships an unprivileged `node` user (uid 1000); own the files so
# nothing in the container needs to run as root.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist         ./dist
COPY --chown=node:node prisma        ./prisma
COPY --chown=node:node entrypoint.sh ./

RUN chmod +x entrypoint.sh

USER node

EXPOSE 4000

ENTRYPOINT ["./entrypoint.sh"]
