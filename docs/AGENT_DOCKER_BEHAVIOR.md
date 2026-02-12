# AI Agent Docker Behavior - Quick Reference

**Project**: Quiz Application (cert-app)  
**Approach**: 100% Docker-first development  
**Rule**: NEVER run Node.js directly on host (except E2E tests and git hooks)

## Critical Rule

**NEVER run these commands on host:**

```bash
❌ npm start
❌ npm run dev
❌ node index.js
❌ npx prisma migrate dev
```

**ALWAYS use Docker:**

```bash
✅ docker compose -f docker-compose.dev.yml up
✅ docker compose -f docker-compose.dev.yml exec backend npm test
✅ docker compose exec backend npx prisma migrate dev
```

**EXCEPTIONS (run on host):**

```bash
✅ cd backend && npm run test:e2e  # E2E tests connect to Docker services
✅ npm run lint --fix               # Git hooks (pre-commit)
✅ npm run type-check               # Git hooks (pre-commit)
✅ prettier --write "**/*.{ts,tsx}" # Git hooks (pre-commit)
```

## Architecture

```
Development: dev/docker-compose.yml
- Frontend (Vite HMR, port 5173)
- Backend (Nodemon, port 3000)
- Nginx (proxy, port 80)
- PostgreSQL (port 5432)
- Redis (port 6379)

Production: deployment/docker-compose.yml
- Frontend (static build + Nginx)
- Backend (compiled TypeScript)
- PostgreSQL + Redis
```

## Daily Workflow

### Start Development

```bash
# 1. Start all services
docker compose -f docker-compose.dev.yml up -d

# 2. Check status
docker compose -f docker-compose.dev.yml ps

# 3. Run migrations
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate deploy

# 4. View logs
docker compose -f docker-compose.dev.yml logs -f backend
```

### Stop Development

```bash
# Stop (keeps data)
docker compose -f docker-compose.dev.yml down

# Stop + delete data
docker compose -f docker-compose.dev.yml down -v
```

## Installing Dependencies

**CRITICAL: Always install on host first, then rebuild Docker**

### Why Host-First?

Installing inside Docker doesn't update host `package.json`:

- Changes not tracked in Git
- Disappears on rebuild
- No IDE IntelliSense

### Correct Process

```bash
# 1. Install on host (updates package.json)
cd backend  # or frontend
npm install package-name

# 2. Rebuild Docker container
cd ..
docker compose -f docker-compose.dev.yml up -d --build backend

# 3. Verify
docker compose -f docker-compose.dev.yml logs -f backend

# 4. Commit changes
git add backend/package.json backend/package-lock.json
git commit -m "feat(deps): add package-name"
```

### Examples

**Backend package:**

```bash
cd backend
npm install express-rate-limit
cd ..
docker compose -f docker-compose.dev.yml up -d --build backend
```

**Frontend package:**

```bash
cd frontend
npm install axios
cd ..
docker compose -f docker-compose.dev.yml up -d --build frontend
```

**Dev dependency:**

```bash
cd backend
npm install --save-dev @types/express-rate-limit
cd ..
docker compose -f docker-compose.dev.yml up -d --build backend
```

**Remove package:**

```bash
cd backend
npm uninstall unused-package
cd ..
docker compose -f docker-compose.dev.yml up -d --build backend
```

## Common Commands

### Logs

```bash
# All services
docker compose -f docker-compose.dev.yml logs -f

# Specific service
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend

# Last 100 lines
docker compose -f docker-compose.dev.yml logs --tail=100 backend
```

### Execute Commands

```bash
# Run unit tests (inside Docker)
docker compose -f docker-compose.dev.yml exec backend npm test
docker compose -f docker-compose.dev.yml exec frontend npm test

# Run E2E tests (on host, connects to Docker)
cd backend && npm run test:e2e

# Lint
docker compose -f docker-compose.dev.yml exec backend npm run lint

# Type check
docker compose -f docker-compose.dev.yml exec backend npm run type-check

# Shell access
docker compose -f docker-compose.dev.yml exec backend sh
docker compose -f docker-compose.dev.yml exec frontend sh
```

### Database Operations

```bash
# Run migration
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate dev --name add_field

# Apply migrations
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate deploy

# Prisma Studio (GUI)
docker compose -f docker-compose.dev.yml exec backend npx prisma studio
# Visit: http://localhost:5555

# Seed database
docker compose -f docker-compose.dev.yml exec backend npm run seed

# Reset database (DELETES DATA)
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate reset

# Backup database
docker compose -f docker-compose.dev.yml exec postgres pg_dump -U quizuser quizapp > backup.sql

# Restore database
docker compose -f docker-compose.dev.yml exec -T postgres psql -U quizuser -d quizapp < backup.sql

# PostgreSQL CLI
docker compose -f docker-compose.dev.yml exec postgres psql -U quizuser -d quizapp

# Redis CLI
docker compose -f docker-compose.dev.yml exec redis redis-cli
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.dev.yml restart

# Restart specific service
docker compose -f docker-compose.dev.yml restart backend

# Rebuild and restart
docker compose -f docker-compose.dev.yml up -d --build backend
```

### Cleanup

```bash
# Stop containers (keeps volumes)
docker compose -f docker-compose.dev.yml down

# Stop + remove volumes (DELETES DATA)
docker compose -f docker-compose.dev.yml down -v

# Remove unused Docker resources
docker system prune

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Nuclear option (everything)
docker compose -f docker-compose.dev.yml down -v --rmi all
docker system prune -a --volumes
```

## Dockerfile Best Practices

### Multi-Stage Build Pattern

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Rules

**DO:**

- Use specific tags (`node:20-alpine`, not `node:latest`)
- Use multi-stage builds
- Run as non-root (`USER node`)
- Copy `package*.json` before source code (layer caching)
- Use `npm ci` (deterministic installs)
- Use Alpine variants (smaller)
- Set `NODE_ENV=production`

**DON'T:**

- Use `latest` tag
- Run as root
- Copy `node_modules`
- Install dev dependencies in production
- Hardcode secrets

### .dockerignore

```
node_modules
npm-debug.log
.env
.env.*
!.env.example
.git
.gitignore
.vscode
dist
build
coverage
*.test.ts
*.spec.ts
README.md
*.md
logs
*.log
```

## docker-compose.yml Best Practices

### Development Compose

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend/src:/app/src # Hot reload
    environment:
      - NODE_ENV=development
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER}']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

### Production Compose

```yaml
services:
  backend:
    image: cert-app-backend:latest
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose -f docker-compose.dev.yml logs backend

# Check exit code
docker compose -f docker-compose.dev.yml ps

# Rebuild without cache
docker compose -f docker-compose.dev.yml build --no-cache backend
docker compose -f docker-compose.dev.yml up -d backend
```

### Port Already in Use

```bash
# Find process
sudo lsof -i :3000
sudo ss -tulpn | grep :3000

# Kill process
sudo kill -9 $(sudo lsof -t -i:3000)

# Or change port in compose
ports:
  - "3001:3000"
```

### Database Connection Failed

```bash
# Check PostgreSQL
docker compose -f docker-compose.dev.yml ps postgres
docker compose -f docker-compose.dev.yml logs postgres

# Test connection
docker compose -f docker-compose.dev.yml exec backend sh -c "nc -zv postgres 5432"

# Restart
docker compose -f docker-compose.dev.yml restart postgres
docker compose -f docker-compose.dev.yml restart backend
```

### Hot Reload Not Working

```bash
# Check volumes
docker compose -f docker-compose.dev.yml config | grep volumes

# Verify files
docker compose -f docker-compose.dev.yml exec backend ls -la /app/src

# Restart
docker compose -f docker-compose.dev.yml restart backend

# Rebuild
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d --build
```

### Permission Denied

```bash
# Fix ownership (Linux/macOS)
sudo chown -R $USER:$USER ./backend ./frontend

# Check user in container
docker compose -f docker-compose.dev.yml exec backend whoami
```

### Out of Disk Space

```bash
# Check usage
docker system df

# Clean up
docker system prune -a --volumes
docker volume prune
docker image prune -a
```

## Security

### Never Commit Secrets

```bash
# .env (gitignored)
DATABASE_URL=postgresql://user:password@postgres:5432/db
JWT_SECRET=super-secret-key
REDIS_PASSWORD=redis-password
```

### Run as Non-Root

```dockerfile
FROM node:20-alpine
USER node  # Always run as node user
WORKDIR /app
```

### Network Isolation

```yaml
networks:
  frontend-network:
    internal: false # Internet access
  backend-network:
    internal: true # Isolated
```

### Don't Expose Unnecessary Ports

```yaml
# Bad
ports:
  - '5432:5432' # Exposes PostgreSQL to host

# Good
expose:
  - '5432' # Only within Docker network
```

## Bash Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias dc='docker compose -f docker-compose.dev.yml'
alias dcup='docker compose -f docker-compose.dev.yml up -d'
alias dcdown='docker compose -f docker-compose.dev.yml down'
alias dclogs='docker compose -f docker-compose.dev.yml logs -f'
alias dcexec='docker compose -f docker-compose.dev.yml exec'
alias dcbuild='docker compose -f docker-compose.dev.yml up -d --build'

# Usage
dcup                    # Start
dclogs backend          # Logs
dcexec backend npm test # Tests
```

## Critical Rules

1. **100% Docker**: All Node.js code runs in containers (except E2E tests and git hooks)
2. **E2E Tests**: Run on host, connect to Docker services (port-forwarded)
3. **Git Hooks**: Linting/formatting tools run on host for pre-commit checks
4. **Host-First Dependencies**: Install on host, then rebuild Docker
5. **Never Commit Secrets**: Use `.env` files (gitignored)
6. **Multi-Stage Builds**: Optimize production images
7. **Health Checks**: Always define health checks
8. **Resource Limits**: Set limits in production
9. **Named Volumes**: Persist data with named volumes
10. **Non-Root User**: Always `USER node` in Dockerfile

## Quick Decision Tree

**Need to run Node.js command?**
→ Use `docker compose exec`

**Need to install package?**
→ Install on host first, then rebuild Docker

**Container won't start?**
→ Check logs, rebuild without cache

**Hot reload not working?**
→ Check volumes, restart service

**Database connection failed?**
→ Check PostgreSQL health, restart services

**Need to clean up?**
→ Use `docker system prune`

## Summary

**Docker-first workflow:**

- All code runs in containers (dev + prod)
- E2E tests run on host (connect to Docker services)
- Git hooks run on host (linting/formatting for pre-commit)
- Install dependencies on host first
- Rebuild Docker after package changes
- Use hot reload (Vite + Nodemon)
- Multi-stage builds for production
- Health checks for reliability
- Never commit secrets

**Every operation goes through Docker - except E2E tests and git hooks.**
