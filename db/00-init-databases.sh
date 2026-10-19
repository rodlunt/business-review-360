#!/bin/bash
# Initialize additional databases needed by the application
# This script runs BEFORE the SQL schema scripts (due to 00- prefix)

set -e

echo "Creating br360_platform database if it doesn't exist..."

# Check if database exists and create if not
# Note: CREATE DATABASE cannot be run inside a DO block/function in PostgreSQL
if psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -tAc "SELECT 1 FROM pg_database WHERE datname = 'br360_platform'" | grep -q 1; then
    echo "Database br360_platform already exists"
else
    echo "Creating database br360_platform..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -c "CREATE DATABASE br360_platform;"
    echo "Database br360_platform created successfully"
fi

# Grant privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" -c "GRANT ALL PRIVILEGES ON DATABASE br360_platform TO $POSTGRES_USER;"

echo "Running platform schema on br360_platform database..."

# Run the platform schema on the br360_platform database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "br360_platform" -f /docker-entrypoint-initdb.d/03-platform-schema.sql

echo "Database initialization complete."
