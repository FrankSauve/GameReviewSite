# Built from the repository root, not from backend/, because the backend now
# depends on the `shared` workspace and a build context cannot reach outside
# itself. Both compose files and both CI jobs pass `context: .` with this file
# named explicitly.
#
# ── Stage 1: Install → generate → build → prune ──────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# Prevent @prisma/client postinstall from auto-running prisma generate
# (we call it explicitly below so the engine is only downloaded once)
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

# The root manifests plus the two workspaces this image needs. The frontend's
# package.json is deliberately absent: `--workspace` limits the install to the
# backend's slice, so nothing of the SPA's dependency tree reaches this image.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# npm ci installs exactly what the lockfile pins and fails if the two have
# drifted, which is what makes the build reproducible and Renovate-friendly.
RUN npm ci --no-audit --no-fund \
      --workspace @gamereviews/shared \
      --workspace game-review-site \
      --include-workspace-root

# The shared package is consumed as built JS with its own .d.ts, so it has to be
# compiled before anything that imports it.
COPY shared ./shared
RUN npm run build --workspace @gamereviews/shared

COPY backend/prisma ./backend/prisma

# Generate Prisma client + download query engine for this platform (once).
# Through the workspace script, so the schema is resolved from backend/.
RUN npm run db:generate --workspace game-review-site

COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

RUN npm run build --workspace game-review-site

# Remove devDependencies in-place; far faster than a second npm ci
RUN npm prune --omit=dev

# npm links a workspace into node_modules as a symlink pointing outside it. A
# COPY of node_modules alone would carry a dangling link, so the package is
# replaced by its real contents here and the runtime stage stays a plain copy.
RUN rm -rf node_modules/@gamereviews/shared \
 && cp -r shared node_modules/@gamereviews/shared

# ── Stage 2: Lean runtime image (no network calls) ────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

WORKDIR /app

# Safe default for a shipped image; the local compose stack overrides it.
ENV NODE_ENV=production

# /app is the backend's own root, exactly as before the workspace split: dist/,
# prisma/ and node_modules/ sit where entrypoint.sh and package.json expect
# them, so neither had to learn about the layout above.
COPY --from=builder --chown=node:node /app/node_modules  ./node_modules
COPY --from=builder --chown=node:node /app/backend/dist  ./dist
COPY --chown=node:node backend/prisma        ./prisma
COPY --chown=node:node backend/entrypoint.sh ./
# Declares the module type instead of leaving Node to infer it. This package is
# ESM ("type": "module"), and dist/ is emitted as ESM. Node 22 would actually
# cope without this — module syntax detection has been on by default since
# 22.7, so it retries a failed CommonJS parse as ESM — but that is a fallback
# with two sharp edges: a file containing no import or export syntax is still
# treated as CommonJS, and the behaviour is version-dependent. One line to stop
# depending on it.
COPY --chown=node:node backend/package.json  ./

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
