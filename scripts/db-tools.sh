#!/bin/bash
# Database management tools

# Load environment variables safely
set -a
source <(grep -v '^#' .env | grep -v '^$' | sed 's/^/export /')
set +a

DB_USER="${POSTGRES_USER}"
DB_NAME="${POSTGRES_DB}"

show_help() {
    echo "Database Management Tools"
    echo ""
    echo "Usage: ./db-tools.sh [command]"
    echo ""
    echo "Commands:"
    echo "  login          - Connect to database as admin user"
    echo "  backup         - Create database backup"
    echo "  restore [file] - Restore database from backup"
    echo "  create-user    - Create additional database users"
    echo "  list-users     - List all database users"
    echo "  list-tables    - List all tables"
    echo "  stats          - Show database statistics"
    echo "  test           - Test database connection"
    echo "  help           - Show this help message"
}

db_login() {
    echo "🔐 Connecting to PostgreSQL as $DB_USER..."
    docker-compose exec db psql -U "$DB_USER" -d "$DB_NAME"
}

db_backup() {
    BACKUP_FILE="backups/backup-$(date +%Y%m%d-%H%M%S).sql"
    mkdir -p backups
    echo "📦 Creating backup: $BACKUP_FILE"
    docker-compose exec db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
    echo "✅ Backup created: $BACKUP_FILE"
    echo "   Size: $(du -h "$BACKUP_FILE" | cut -f1)"
}

db_restore() {
    if [ -z "$1" ]; then
        echo "❌ Error: Please provide backup file"
        echo "Usage: ./db-tools.sh restore backup.sql"
        exit 1
    fi
    
    echo "⚠️  WARNING: This will overwrite the current database!"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        echo "📥 Restoring from $1..."
        docker-compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" < "$1"
        echo "✅ Database restored"
    else
        echo "Cancelled"
    fi
}

create_users() {
    echo "Creating additional database users..."
    
    docker-compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" << 'SQL'
DO $$
BEGIN
    -- Create read-only user
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'readonly_user') THEN
        CREATE USER readonly_user WITH PASSWORD 'readonly_password';
        GRANT CONNECT ON DATABASE business_review_db TO readonly_user;
        GRANT USAGE ON SCHEMA public TO readonly_user;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
        RAISE NOTICE 'Created readonly_user';
    ELSE
        RAISE NOTICE 'readonly_user already exists';
    END IF;

    -- Create application user
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE USER app_user WITH PASSWORD 'app_password';
        GRANT CONNECT ON DATABASE business_review_db TO app_user;
        GRANT USAGE ON SCHEMA public TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
        RAISE NOTICE 'Created app_user';
    ELSE
        RAISE NOTICE 'app_user already exists';
    END IF;
END $$;
SQL
    
    echo "✅ User setup complete"
    echo "   - readonly_user (password: readonly_password)"
    echo "   - app_user (password: app_password)"
}

list_users() {
    echo "📋 Database Users:"
    docker-compose exec db psql -U "$DB_USER" -d "$DB_NAME" -c "\du"
}

list_tables() {
    echo "📋 Database Tables:"
    docker-compose exec db psql -U "$DB_USER" -d "$DB_NAME" -c "\dt"
}

show_stats() {
    echo "📊 Database Statistics:"
    docker-compose exec db psql -U "$DB_USER" -d "$DB_NAME" << 'SQL'
\echo '=== Database Size ==='
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

\echo ''
\echo '=== Table Sizes ==='
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

\echo ''
\echo '=== Active Connections ==='
SELECT count(*) AS active_connections FROM pg_stat_activity;

\echo ''
\echo '=== Row Counts ==='
SELECT 
    schemaname,
    tablename,
    n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
SQL
}

test_connection() {
    echo "🧪 Testing database connection..."
    if docker-compose exec db pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        echo "✅ Database is ready and accepting connections"
        docker-compose exec db psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();" | head -3
    else
        echo "❌ Database is not ready"
        exit 1
    fi
}

# Main command dispatcher
case "$1" in
    login)
        db_login
        ;;
    backup)
        db_backup
        ;;
    restore)
        db_restore "$2"
        ;;
    create-user)
        create_users
        ;;
    list-users)
        list_users
        ;;
    list-tables)
        list_tables
        ;;
    stats)
        show_stats
        ;;
    test)
        test_connection
        ;;
    help|*)
        show_help
        ;;
esac
