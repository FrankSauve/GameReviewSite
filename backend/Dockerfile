# ── Stage 1: Install → generate → build → prune ──────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

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
RUN ./node_modules/.bin/prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Remove devDependencies in-place; far faster than a second npm ci
RUN npm prune --omit=dev

# ── Stage 2: Lean runtime image (no network calls) ────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

WORKDIR /app

# Safe default for a shipped image; the local compose stack overrides it.
ENV NODE_ENV=production

# The node image ships an unprivileged `node` user (uid 1000); own the files so
# nothing in the container needs to run as root.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist         ./dist
COPY --chown=node:node prisma        ./prisma
COPY --chown=node:node entrypoint.sh ./
# Declares the module type instead of leaving Node to infer it. This package is
# ESM ("type": "module"), and dist/ is emitted as ESM. Node 22 would actually
# cope without this — module syntax detection has been on by default since
# 22.7, so it retries a failed CommonJS parse as ESM — but that is a fallback
# with two sharp edges: a file containing no import or export syntax is still
# treated as CommonJS, and the behaviour is version-dependent. One line to stop
# depending on it.
COPY --chown=node:node package.json  ./

RUN chmod +x entrypoint.sh

# npm is not needed to run this image: the entrypoint calls the Prisma binary
# directly and then `node dist/index.js`, and the healthcheck is `node -e`. It
# was, however, the single largest source of vulnerability findings in the image
# — the CVEs were all in npm's own bundled dependencies (tar, sigstore,
# brace-expansion, ip-address, picomatch), reachable by nothing here because
# nothing here runs npm. Removing it drops a fixable CRITICAL and five HIGH
# findings and is one fewer way to fetch and execute code inside a container that
# should only ever run the code it shipped with.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/bin/npm \
           /usr/local/bin/npx

USER node

EXPOSE 4000

ENTRYPOINT ["./entrypoint.sh"]
