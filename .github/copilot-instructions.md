# GitHub Copilot Instructions

## Agent Behavior Guidelines

When working in this codebase, always follow these guidelines:

### Code Quality Behavior

See AGENT_CODE_BEHAVIOR.md for:

- Always use explicit TypeScript types (NEVER `any`)
- Named exports only (no default exports)
- Custom error classes with proper status codes
- Zod schemas for all input validation
- Professional code: no console.log, no emoji, no commented code
- Modular, DRY, type-safe code

### React Frontend Behavior

See AGENT_REACT_BEHAVIOR.md for:

- Functional components with `React.FC<Props>`
- Component structure: imports → types → constants → hooks → effects → handlers → render
- Custom hooks for reusable logic (especially Socket.io connections)
- Context with Provider pattern for global state
- Performance: `React.memo`, `useCallback`, `useMemo`
- Code splitting with `lazy()` and `Suspense`

### Express + Socket.io Backend Behavior

See AGENT_EXPRESS_BEHAVIOR.md for:

- Layered architecture: Routes → Middleware → Controllers → Services → Database
- Socket.io Gateway: studentHandlers, teacherHandlers, backgroundJobs
- Controllers: thin (HTTP only), Services: thick (business logic)
- Always use Zod validation for all inputs (HTTP and Socket.io)
- Use Prisma transactions for multi-step operations
- SQLite database via Prisma ORM (no PostgreSQL, no Redis)
- Consistent response format: `{ success, data?, message?, errors? }`
- Room isolation: `teacher:session:*` for dashboard, `student:session:*` for students

### Git Commit Behavior

See AGENT_GIT_BEHAVIOR.md for:

- Conventional commit format: `<type>(<scope>): <subject>`
- Scope mapping based on file paths
- NEVER use `--no-verify` - always fix pre-commit hook issues
- Multi-file commit patterns

### Responsive Design Behavior

See AGENT_RESPONSIVE_BEHAVIOR.md for:

- ALL UI must work from 360px to 1920px+
- Width constraints: 360px min, 1280px max (max-w-7xl)
- Only use `sm:` (768px) and `lg:` (1024px) breakpoints
- Mobile-first approach with Tailwind CSS
- Critical rules: `min-w-0` + `break-words` prevents overflow

### Visual Design Behavior

See AGENT_VISUAL_BEHAVIOR.md for:

- Tailwind-first (utilities for 90% of styling)
- SCSS modules for complex patterns (component-specific only)
- Clean design with borders for depth
- Clear status indicators (online/offline, violations, timer states)

### Docker Development Behavior

See AGENT_DOCKER_BEHAVIOR.md for:

- Docker for development only; production is an Electron desktop app
- No PostgreSQL or Redis containers — SQLite via Prisma only
- Install dependencies on host first, then rebuild Docker
- Use `docker compose -f docker-compose.dev.yml exec` for commands

### Testing Behavior

See AGENT_TEST_BEHAVIOR.md for:

- Unit tests for services, integration tests for Socket.io handlers
- Prisma mocked via vitest.setup.ts (no real database in tests)
- Real Socket.io server/client for gateway tests
- Vitest with v8 coverage (90%+ thresholds)
- AAA pattern: Arrange → Act → Assert

## Quick Reference

- **For code**: Explicit types → named exports → Zod validation → custom errors
- **For React**: Functional components → custom hooks → Context → memo/useCallback/useMemo
- **For Express**: Controllers (thin) → Services (thick) → Prisma/SQLite → Socket.io rooms
- **For commits**: Check file path → determine scope → use `type(scope): subject` format
- **For UI**: Start mobile → add `sm:` → add `lg:` → test at 360px, 768px, 1024px
- **For styling**: Tailwind utilities first → SCSS modules for complex patterns
- **For Docker**: Dev only → install on host → rebuild container → exec for commands
- **For tests**: Mock Prisma → real Socket.io → Vitest + AAA pattern → 90%+ coverage

## Tech Stack

- **Desktop**: Electron + NSIS installer (Windows)
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Vite
- **Backend**: Express.js + Socket.io (port 3333, bound to 0.0.0.0)
- **Database**: SQLite via Prisma ORM
- **Auth**: Custom HMAC-SHA256 tokens
- **Testing**: Vitest + v8 coverage + supertest + socket.io-client
- **File Upload**: Multer (50MB limit)

Always reference the full documentation files for complete patterns and examples.
