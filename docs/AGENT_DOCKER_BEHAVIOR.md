# AI Agent Docker Behavior - Quick Reference

**Project**: Warden (warden)  
**Approach**: Docker for development and production  
**Database**: SQLite via Prisma ORM

## Architecture Overview

The Warden runs entirely via Docker Compose. Development uses hot-reload volumes; production serves the built frontend from Express static files.

```
Development: docker-compose.dev.yml
- Frontend (Vite HMR, port 5174)
- Backend (Express + Socket.io, port 4444)

Production: docker-compose.yml (or docker-compose.dev.yml)
- Backend serves built frontend as static files
- Express + Socket.io on port 3333
- SQLite database in persistent Docker volume
```

## Development Workflow

### Start Development

```bash
# Start all services
docker compose -f docker-compose.dev.yml up -d

# Check status
docker compose -f docker-compose.dev.yml ps

# View logs
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

**Install on host first, then rebuild Docker:**

```bash
# 1. Install on host (updates package.json)
cd backend  # or frontend
npm install package-name

# 2. Rebuild Docker container
cd ..
docker compose -f docker-compose.dev.yml up -d --build backend

# 3. Commit changes
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): add package-name"
```

## Common Commands

### Logs

```bash
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend
docker compose -f docker-compose.dev.yml logs --tail=100 backend
```

### Execute Commands

```bash
# Run tests (inside Docker)
docker compose -f docker-compose.dev.yml exec backend npm test

# Shell access
docker compose -f docker-compose.dev.yml exec backend sh

# Run Prisma commands
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate dev
docker compose -f docker-compose.dev.yml exec backend npx prisma studio
```

### Restart / Rebuild

```bash
docker compose -f docker-compose.dev.yml restart backend
docker compose -f docker-compose.dev.yml up -d --build backend
```

## docker-compose.dev.yml Structure

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3333:3333"
    volumes:
      - ./backend:/app
      - /app/node_modules
      - backend_data:/app/data
    environment:
      - DATABASE_URL=file:./data/dev.db
      - NODE_ENV=development

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:3333

volumes:
  backend_data:
```

## Key Differences from Typical Docker Setups

| Aspect          | Typical Docker App             | Warden                      |
| --------------- | ------------------------------ | -------------------------------- |
| **Database**    | PostgreSQL/MySQL in container  | SQLite file (no DB container)    |
| **Production**  | Docker Compose deployment      | Docker Compose deployment        |
| **Cache**       | Redis container                | Not used                         |
| **Port**        | 3000 (typical)                 | 3333 (bound to 0.0.0.0)         |
| **Networking**  | Docker internal network        | LAN access (private network)     |

## Troubleshooting

### Container Won't Start

```bash
docker compose -f docker-compose.dev.yml logs backend
docker compose -f docker-compose.dev.yml build --no-cache backend
docker compose -f docker-compose.dev.yml up -d backend
```

### Port Already in Use

```bash
sudo lsof -i :3333
sudo kill -9 $(sudo lsof -t -i:3333)
```

### Hot Reload Not Working

```bash
docker compose -f docker-compose.dev.yml restart backend
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d --build
```

## Cleanup

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml down -v
docker system prune
```

## Critical Rules

1. **Docker for dev and prod**: All environments use Docker Compose
2. **No PostgreSQL/Redis**: Database is SQLite via Prisma
3. **Host-first deps**: Install packages on host, then rebuild Docker
4. **Named volumes**: Persist SQLite data with named volumes
5. **Port 3333**: Backend binds to 0.0.0.0:3333 for LAN access
