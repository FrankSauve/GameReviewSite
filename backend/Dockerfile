# ── Stage 1: Install → generate → build → prune ──────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Prevent @prisma/client postinstall from auto-running prisma generate
# (we call it explicitly below so the engine is only downloaded once)
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

COPY package*.json ./
COPY prisma ./prisma

RUN npm install \
      --registry https://registry.npmjs.org \
      --no-audit \
      --no-fund

# Generate Prisma client + download query engine for this platform (once)
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Remove devDependencies in-place; far faster than a second npm install
RUN npm prune --omit=dev

# ── Stage 2: Lean runtime image (no network calls) ────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Safe default for a shipped image; the local compose stack overrides it.
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY prisma    ./prisma
COPY entrypoint.sh ./

RUN chmod +x entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./entrypoint.sh"]
