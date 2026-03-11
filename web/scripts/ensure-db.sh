#!/bin/bash
# Download the restaurant DB to the persistent volume if it doesn't exist
DB_PATH="${DB_PATH:-/data/restaurants.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH — downloading from GitHub release..."
  mkdir -p "$(dirname "$DB_PATH")"
  curl -L -o "$DB_PATH" \
    "https://github.com/alex-friedman-modo/nodash/releases/download/v0.1.0/restaurants.db"
  echo "Database downloaded ($(du -h "$DB_PATH" | cut -f1))"
else
  echo "Database exists at $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
fi

# Start the Next.js server
exec node .next/standalone/server.js
