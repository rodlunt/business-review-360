# Project Structure & Quick Reference

## 📁 Directory Organization

```text
business-review-360/
├── backend/                 # Node.js API server
├── frontend/                # React frontend application
├── testing/                 # Playwright E2E tests
├── db/                      # Database schema & seed data
├── uploads/                 # File uploads directory
├── scripts/                 # Utility scripts
│   ├── db-tools.sh         # Database management CLI
│   ├── db-login.sh         # Quick database login
│   └── check-secrets.sh    # Security checker
├── docs/                    # Documentation
│   ├── README-DEPLOYMENT.md
│   ├── RECAPTCHA_SETUP.md
│   └── archive/            # Archived/temporary docs
├── .env                     # Environment variables (gitignored)
├── .env.example            # Environment template
├── docker-compose.yml      # Docker configuration
└── README.md               # Main documentation
```

## 🛠️ Utility Scripts

### Database Tools

```bash
# Connect to database
./scripts/db-tools.sh login

# Create backup
./scripts/db-tools.sh backup

# Show database stats
./scripts/db-tools.sh stats

# List all users
./scripts/db-tools.sh list-users

# List all tables
./scripts/db-tools.sh list-tables

# Quick login shortcut
./scripts/db-login.sh
```

### Security

```bash
# Check for hardcoded secrets
./scripts/check-secrets.sh
```

## 📝 Documentation

- **Main README**: [/README.md](../README.md)
- **Deployment Guide**: /docs/README-DEPLOYMENT.md
- **reCAPTCHA Setup**: [/docs/RECAPTCHA_SETUP.md](RECAPTCHA_SETUP.md)
- **Environment Reference**: See `.env.example`

## 🔑 Environment Setup

### Development

```bash
cp .env.example .env
# Edit .env with your development values
```

### Production Environment Setup

```bash
cp .env.production.example .env
# Generate secure secrets
# Update with production values
```

## 🚀 Running the Application

### Development (Recommended)

```bash
# Backend + Database (Docker)
docker-compose up -d db backend

# Frontend (Local npm - hot reload)
cd frontend && npm run dev
```

### Production

```bash
# All services in Docker
docker-compose up -d
```

## 🗄️ Database Access

### Quick Login

```bash
./scripts/db-login.sh
```

### Direct Access

```bash
# Via Docker
docker-compose exec db psql -U business_review_user -d business_review_db

# From host (if port 5432 exposed)
psql -h localhost -p 5432 -U business_review_user -d business_review_db
```

### Database Management

```bash
# Backup
./scripts/db-tools.sh backup

# Restore
./scripts/db-tools.sh restore backups/backup-YYYYMMDD-HHMMSS.sql

# Stats
./scripts/db-tools.sh stats
```

## 🧪 Testing

### Run E2E Tests

```bash
cd testing
npx playwright test

# Run specific test file
npx playwright test e2e/12-new-features.spec.js

# Run with UI
npx playwright test --ui
```

## 🔐 Security

### Secrets Management

- ✅ All secrets in `.env` (gitignored)
- ✅ No hardcoded credentials
- ✅ Different credentials per environment
- ✅ Use `./scripts/check-secrets.sh` to verify

### Production Checklist

- [ ] Generate new database password
- [ ] Generate new JWT secret
- [ ] Create new Gmail app password
- [ ] Create new GitHub token
- [ ] Set `NODE_ENV=production`
- [ ] Set `DISABLE_RATE_LIMIT=false`
- [ ] Update all environment-specific values

## 📦 Deployment

See docs/README-DEPLOYMENT.md for complete deployment guide.

Quick deploy:

```bash
# With production .env configured
docker-compose down
docker-compose up -d --build
```

## 🆘 Troubleshooting

### Database Connection Issues

```bash
# Check database is running
docker-compose ps

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

### Frontend Issues

```bash
# Check if running on port 3000
netstat -ano | findstr :3000

# Restart frontend
cd frontend && npm run dev
```

### Backend Issues

```bash
# View backend logs
docker-compose logs backend

# Restart backend
docker-compose restart backend
```

## 📚 Additional Resources

- Docker Compose Docs: <https://docs.docker.com/compose/>
- PostgreSQL Docs: <https://www.postgresql.org/docs/15/>
- Playwright Docs: <https://playwright.dev/>
- React Docs: <https://react.dev/>
