#!/bin/bash
set -e

# Resolve PostgreSQL binaries path on Debian
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -n 1)
if [ -n "$PG_BIN" ]; then
  export PATH="$PG_BIN:$PATH"
fi

CURRENT_USER=$(whoami)
echo "👤 Current Container User: $CURRENT_USER"

# Prepare workspace directories and permissions if root
if [ "$CURRENT_USER" = "root" ]; then
  echo "🔑 Running as root. Granting ownership of /app to 'node' user..."
  mkdir -p /app/pg_data
  chown -R node:node /app
fi

# Helper function to run commands as unprivileged 'node' user if root
run_as_user() {
  if [ "$CURRENT_USER" = "root" ]; then
    su -s /bin/bash node -c "export PATH=\"$PATH\"; $1"
  else
    eval "$1"
  fi
}

echo "🚀 Starting Redis..."
if [ "$CURRENT_USER" = "root" ]; then
  # If root, launch redis daemonized under node or fallback to standard daemon
  redis-server --port 6379 --daemonize yes --user node || redis-server --port 6379 --daemonize yes
else
  redis-server --port 6379 --daemonize yes
fi

echo "🚀 Starting PostgreSQL..."
# Initialize database cluster if not already present
if [ ! -f /app/pg_data/PG_VERSION ]; then
  echo "⚙️  Initializing PostgreSQL database cluster as unprivileged user..."
  run_as_user "initdb -D /app/pg_data"
  
  # Allow passwordless local connections inside the container
  echo "host all all 127.0.0.1/32 trust" >> /app/pg_data/pg_hba.conf
fi

# Boot PostgreSQL
run_as_user "pg_ctl -D /app/pg_data -o \"-p 5432 -h 127.0.0.1\" start -l /app/pg_data/pg.log"

# Wait for PostgreSQL to be active
echo "⏳ Waiting for PostgreSQL to boot..."
until run_as_user "pg_isready -h 127.0.0.1 -p 5432"; do
  sleep 1
done

# Create and seed database
echo "🌱 Initializing stock_dashboard database..."
run_as_user "createdb -h 127.0.0.1 -p 5432 stock_dashboard || true"
run_as_user "psql -h 127.0.0.1 -p 5432 -d stock_dashboard -f /app/backend/init.sql"

echo "🔥 Launching Node.js backend & frontend server..."
export PORT=${PORT:-7860}
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=stock_dashboard
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379

if [ "$CURRENT_USER" = "root" ]; then
  # Run server process under unprivileged 'node' user to maintain security best-practices
  su -s /bin/bash node -c "export PATH=\"$PATH\"; export PORT=$PORT; export POSTGRES_USER=$POSTGRES_USER; export POSTGRES_PASSWORD=$POSTGRES_PASSWORD; export POSTGRES_HOST=$POSTGRES_HOST; export POSTGRES_PORT=$POSTGRES_PORT; export POSTGRES_DB=$POSTGRES_DB; export REDIS_HOST=$REDIS_HOST; export REDIS_PORT=$REDIS_PORT; node /app/backend/src/server.js"
else
  node backend/src/server.js
fi
