#!/bin/sh
set -e

echo "⏳ Applying database migrations..."

# migrate deploy only replays the SQL committed in prisma/migrations. Unlike
# `db push` it never infers changes from the schema, so it cannot silently drop
# a column that live data still needs.
#
# The binary is called directly rather than through npx. `npx prisma` falls back
# to downloading prisma from the registry when it cannot find a local copy, so a
# packaging mistake would turn a startup step into an unpinned network install
# instead of failing. The read-only root filesystem would stop it in production,
# but not before it had tried.
if ! output=$(./node_modules/.bin/prisma migrate deploy 2>&1); then
  echo "$output" >&2

  if echo "$output" | grep -q 'P3005'; then
    cat >&2 <<'MSG'

────────────────────────────────────────────────────────────────────────────
This database has tables but no migration history, which means it was
created by an older version of this image using `prisma db push`.

Baseline it once by recording the initial migration as already applied. The
service is called `backend` in the development stack and
`gamereviews-backend` in the deployment snippet:

  docker compose run --rm \
    --entrypoint "./node_modules/.bin/prisma migrate resolve --applied 0_init" <service>

Then start the stack again. This records history only; it does not alter
any data.
────────────────────────────────────────────────────────────────────────────
MSG
  fi
  exit 1
fi

echo "$output"

echo "🚀 Starting server..."
exec node dist/index.js
