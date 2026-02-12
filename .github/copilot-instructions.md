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
- Custom hooks for reusable logic
- Context with Provider pattern for global state
- Performance: `React.memo`, `useCallback`, `useMemo`
- Code splitting with `lazy()` and `Suspense`

### Express Backend Behavior

See AGENT_EXPRESS_BEHAVIOR.md for:

- Layered architecture: Routes → Middleware → Controllers → Services → Database
- Controllers: thin (HTTP only), Services: thick (business logic)
- Always use Zod validation middleware
- Use Prisma transactions for multi-step operations
- Cache read-heavy data with Redis
- Consistent response format: `{ success, data?, message?, errors? }`

### Git Commit Behavior

See AGENT_GIT_BEHAVIOR.md for:

- Conventional commit format: `<type>(<scope>): <subject>`
- Scope mapping based on file paths (33 specific rules)
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
- Flat design: No shadows, use borders for depth
- GitHub color palette (professional, accessible)
- Modular: Mixins for reusable patterns, BEM naming in SCSS

### Docker Development Behavior

See AGENT_DOCKER_BEHAVIOR.md for:

- 100% Docker-first: NEVER run Node.js on host (except E2E tests and git hooks)
- Install dependencies on host first, then rebuild Docker
- Use `docker compose -f docker-compose.dev.yml exec` for all commands
- Multi-stage builds for production
- Always use health checks and named volumes

### Testing Behavior

See AGENT_TEST_BEHAVIOR.md for:

- E2E tests ONLY (no unit/integration tests)
- Clone dev database to test database before tests
- Run tests on host with Vitest (connects to Docker services)
- Use factories for test data, API client for requests
- AAA pattern: Arrange → Act → Assert

## Quick Reference

- **For code**: Explicit types → named exports → Zod validation → custom errors
- **For React**: Functional components → custom hooks → Context → memo/useCallback/useMemo
- **For Express**: Controllers (thin) → Services (thick) → Prisma → Redis cache
- **For commits**: Check file path → determine scope → use `type(scope): subject` format
- **For UI**: Start mobile → add `sm:` → add `lg:` → test at 360px, 768px, 1024px
- **For styling**: Tailwind utilities first → SCSS modules for complex patterns → use GitHub colors
- **For Docker**: Install on host → rebuild container → exec for commands → never run Node.js on host (except E2E tests and git hooks)
- **For tests**: E2E only → clone test DB → run on host → Vitest + factories + AAA pattern

Always reference the full documentation files for complete patterns and examples.
