#!/bin/bash
# Download the restaurant DB to the persistent volume if it doesn't exist
DB_PATH="${DB_PATH:-/data/restaurants.db}"
DB_VERSION="v0.1.5"
VERSION_FILE="$(dirname "$DB_PATH")/.db-version"

# Download if missing or version mismatch
if [ ! -f "$DB_PATH" ] || [ "$(cat "$VERSION_FILE" 2>/dev/null)" != "$DB_VERSION" ]; then
  echo "Database not found at $DB_PATH — downloading from GitHub release..."
  mkdir -p "$(dirname "$DB_PATH")"
  curl -L -o "$DB_PATH" \
    "https://github.com/alex-friedman-modo/nodash/releases/download/v0.1.5/restaurants.db"
  echo "$DB_VERSION" > "$VERSION_FILE"
  echo "Database downloaded ($(du -h "$DB_PATH" | cut -f1)) — $DB_VERSION"
else
  echo "Database exists at $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
fi

# Copy static assets to standalone directory (Next.js standalone doesn't include them)
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# Start the Next.js server (HOSTNAME=0.0.0.0 required for Railway)
export HOSTNAME="0.0.0.0"
exec node .next/standalone/server.js
