#!/bin/bash
set -e

# Resolve PostgreSQL binaries path on Debian
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -n 1)
if [ -n "$PG_BIN" ]; then
  export PATH="$PG_BIN:$PATH"
fi

echo "🚀 Starting Redis in user-space..."
redis-server --port 6379 --daemonize yes

echo "🚀 Starting PostgreSQL in user-space..."
mkdir -p /app/pg_data
# Initialize PostgreSQL DB cluster if not already done
if [ ! -f /app/pg_data/PG_VERSION ]; then
  initdb -D /app/pg_data
  
  # Configure PostgreSQL to accept connections
  echo "host all all 127.0.0.1/32 trust" >> /app/pg_data/pg_hba.conf
fi

# Start PostgreSQL server on port 5432
pg_ctl -D /app/pg_data -o "-p 5432 -h 127.0.0.1" start -l /app/pg_data/pg.log

# Wait for PostgreSQL to start
echo "⏳ Waiting for PostgreSQL to boot..."
until pg_isready -h 127.0.0.1 -p 5432; do
  sleep 1
done

# Create and seed database
echo "🌱 Initializing stock_dashboard database..."
createdb -h 127.0.0.1 -p 5432 stock_dashboard || true
psql -h 127.0.0.1 -p 5432 -d stock_dashboard -f /app/backend/init.sql

echo "🔥 Launching Node.js backend & frontend server..."
# Hugging Face sets PORT to 7860, default to 7860
export PORT=${PORT:-7860}
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=stock_dashboard
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379

node backend/src/server.js
