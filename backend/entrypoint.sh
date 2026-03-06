#!/bin/sh
set -e

echo "⏳ Applying database schema..."
npx prisma db push

echo "🚀 Starting server..."
exec node dist/index.js
