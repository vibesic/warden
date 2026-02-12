# AI Agent Code Behavior - Quick Reference

**Project**: Quiz Application (cert-app)  
**Languages**: TypeScript, JavaScript, CSS/SCSS, Bash, SQL, JSON, YAML  
**Style**: Professional, modular, DRY, type-safe code

## Core Principles

1. **Professional**: No emoji, no console.log in production, no commented code
2. **Modular**: Extract reusable logic, single responsibility per module
3. **DRY**: Never repeat yourself - create utilities, constants, shared code
4. **Type-safe**: Always use explicit TypeScript types, NEVER `any`
5. **Simple**: Clear code over clever solutions (max 50 lines per function)

## TypeScript Rules

### Always Use Explicit Types

```typescript
// ❌ Never
const fetchData = (id: any) => api.get(id);

// ✅ Always
interface FetchResponse {
  id: string;
  data: ExamData;
}

const fetchData = async (id: string): Promise<FetchResponse> => {
  return await api.get<FetchResponse>(`/exams/${id}`);
};
```

### Type Definitions Location

```typescript
// types/exam.ts
export interface Exam {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  teacherId: string;
  isActive: boolean;
  createdAt: Date;
}

export type ExamWithQuestions = Exam & {
  questions: Question[];
};
```

### Use Enums for Fixed Values

```typescript
export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export enum SessionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

export enum ViolationType {
  TAB_SWITCH = 'TAB_SWITCH',
  EXIT_FULLSCREEN = 'EXIT_FULLSCREEN',
  COPY_ATTEMPT = 'COPY_ATTEMPT',
}
```

### Type Guards Over Assertions

```typescript
// ❌ Never use type assertion
const user = data as User;

// ✅ Use type guards
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'email' in obj;
}

if (isUser(data)) {
  console.log(data.email);
}
```

## Naming Conventions

| Type                     | Convention           | Example                            |
| ------------------------ | -------------------- | ---------------------------------- |
| Variables/Functions      | camelCase            | `currentDate`, `fetchExamData()`   |
| Constants                | UPPER_SNAKE_CASE     | `MAX_ATTEMPTS`, `API_BASE_URL`     |
| Classes/Interfaces/Types | PascalCase           | `ExamSession`, `UserProfile`       |
| Components               | PascalCase           | `ExamList.tsx`, `QuestionCard.tsx` |
| Utility files            | camelCase            | `formatDate.ts`, `validation.ts`   |
| Route files              | kebab-case           | `exam-routes.ts`                   |
| Booleans                 | is/has/should prefix | `isAuthenticated`, `hasPermission` |

## File Organization

```
src/
├── config/          # Configuration (logger, prisma, redis)
├── types/           # Shared TypeScript types
├── utils/           # Shared utilities
├── constants/       # Application constants
└── [feature]/       # Feature modules
    ├── components/  # UI components (frontend)
    ├── controllers/ # Request handlers (backend)
    ├── services/    # Business logic (backend)
    ├── routes/      # API routes (backend)
    ├── types/       # Feature-specific types
    └── utils/       # Feature-specific utilities
```

## Module Exports

```typescript
// ❌ Avoid default exports
export default examService;

// ✅ Use named exports (better tree-shaking)
export const examService = {
  getExamById,
  createExam,
};

// ✅ Use barrel exports for clean imports
// types/index.ts
export * from './user';
export * from './exam';

// Usage
import { User, Exam } from '@/types';
```

## Error Handling

### Custom Error Classes

```typescript
// utils/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errors?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ValidationError extends AppError {
  constructor(errors: any) {
    super('Validation failed', 400, errors);
    this.name = 'ValidationError';
  }
}
```

### Usage Pattern

```typescript
// In services/controllers
if (!exam) {
  throw new NotFoundError('Exam');
}

if (!hasPermission) {
  throw new UnauthorizedError('Insufficient permissions');
}

const validatedData = schema.parse(data); // Throws ValidationError
```

## Input Validation

### Always Use Zod Schemas

```typescript
// validators/examValidator.ts
import { z } from 'zod';

export const createExamSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  duration: z.number().int().min(1).max(480),
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string()).min(2).max(10),
        answer: z.number().int().min(0),
      })
    )
    .min(1),
});

// In controller
const validatedData = createExamSchema.parse(req.body);
```

## Security Standards

### SQL Injection Prevention

```typescript
// ❌ NEVER raw queries
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ ALWAYS use Prisma (parameterized)
const user = await prisma.user.findUnique({
  where: { email },
});
```

### XSS Prevention

```typescript
// React automatically escapes
<div>{userInput}</div>

// For HTML content, use DOMPurify
import DOMPurify from 'dompurify';
const sanitizedHTML = DOMPurify.sanitize(htmlContent);
```

### Authentication

```typescript
// Always verify JWT tokens
const token = req.headers.authorization?.replace('Bearer ', '');
const decoded = jwt.verify(token, JWT_SECRET);

// Check permissions
if (decoded.role !== 'TEACHER') {
  throw new UnauthorizedError();
}
```

## Utility Functions

### Keep Pure and Focused

```typescript
// utils/formatDate.ts
export const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
  // Implementation
};

// utils/validation.ts
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};
```

## CSS/SCSS Standards

### Use Tailwind First, SCSS When Needed

```tsx
// ✅ Prefer Tailwind utilities
<div className="px-4 py-6 bg-white rounded-lg shadow-md">
  Content
</div>

// ✅ Use SCSS for complex responsive logic
// styles/custom.scss
.custom-component {
  padding: 1rem;

  @media (min-width: 768px) {
    padding: 1.5rem;
  }

  @media (min-width: 1024px) {
    padding: 2rem;
  }
}
```

### CSS Naming (BEM for Custom Classes)

```scss
// ✅ Use BEM naming convention
.exam-card {
  &__header {
    font-weight: bold;
  }

  &__body {
    padding: 1rem;
  }

  &--active {
    border-color: blue;
  }
}

// ❌ Avoid generic names
.header {
}
.content {
}
```

## Bash Scripts

### Always Use Error Handling

```bash
#!/bin/bash
set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# ✅ Good script structure
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/logs/deploy.log"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
  echo "[ERROR] $*" >&2
  exit 1
}

# Check prerequisites
command -v docker >/dev/null 2>&1 || error "Docker not found"

log "Starting deployment..."
docker-compose up -d || error "Docker compose failed"
log "Deployment complete"
```

### Bash Naming Conventions

```bash
# Variables: lowercase with underscores
my_variable="value"
database_url="postgres://..."

# Constants: uppercase with underscores
readonly MAX_RETRIES=3
readonly API_BASE_URL="https://api.example.com"

# Functions: lowercase with underscores
check_dependencies() {
  # Implementation
}

deploy_application() {
  # Implementation
}
```

## SQL/Prisma

### Always Use Parameterized Queries

```typescript
// ❌ NEVER concatenate SQL
const query = `SELECT * FROM users WHERE email = '${email}'`;

// ✅ Use Prisma (parameterized automatically)
const user = await prisma.user.findUnique({
  where: { email },
});

// ✅ Raw SQL with parameters (if needed)
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${email}
`;
```

### Prisma Schema Conventions

```prisma
// schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      UserRole @default(STUDENT)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  exams     Exam[]
  sessions  ExamSession[]

  @@index([email])
  @@map("users")
}

enum UserRole {
  TEACHER
  STUDENT
}
```

## JSON Configuration

### Consistent Formatting

```json
{
  "name": "cert-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "react": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

### Environment Variables (.env)

```bash
# Use UPPER_SNAKE_CASE
DATABASE_URL="postgresql://user:pass@localhost:5432/db"
JWT_SECRET="your-secret-key"
API_BASE_URL="http://localhost:3000"

# Group related variables
# Database
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="cert_app"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

## YAML Configuration

### Docker Compose Structure

```yaml
version: '3.8'

services:
  backend:
    image: cert-app-backend:latest
    container_name: cert-app-backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - '3000:3000'
    volumes:
      - ./logs:/app/logs
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: cert_app
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Code Quality Checklist

**Before Every Commit:**

- [ ] No `any` types (use `unknown` if needed, then type guard)
- [ ] No `console.log` or `debugger` statements
- [ ] No commented-out code
- [ ] No TODO without ticket reference (e.g., `// TODO(CERT-123): Fix this`)
- [ ] No emoji in code, comments, or messages
- [ ] All functions have explicit return types
- [ ] All variables have explicit types (or inferred correctly)
- [ ] Descriptive variable names (no `data`, `temp`, `flag`)
- [ ] Functions < 50 lines (guideline)
- [ ] Error handling implemented
- [ ] Input validation with Zod
- [ ] Code is DRY (no duplication)

## Common Patterns

### Async/Await (Always Use)

```typescript
// ✅ Use async/await
const exam = await prisma.exam.findUnique({ where: { id } });

// ❌ Avoid raw promises
prisma.exam.findUnique({ where: { id } }).then(exam => {});
```

### Optional Chaining

```typescript
// ✅ Use optional chaining
const email = user?.profile?.email;

// ❌ Avoid nested checks
const email = user && user.profile && user.profile.email;
```

### Nullish Coalescing

```typescript
// ✅ Use ?? for null/undefined
const timeout = config.timeout ?? 30000;

// ❌ Avoid || (wrong for 0, false)
const timeout = config.timeout || 30000;
```

### Array Methods

```typescript
// ✅ Use functional methods
const activeExams = exams.filter(e => e.isActive);
const examIds = exams.map(e => e.id);
const hasCompleted = sessions.some(s => s.status === 'COMPLETED');

// ❌ Avoid loops when functional works
const activeExams = [];
for (let i = 0; i < exams.length; i++) {
  if (exams[i].isActive) activeExams.push(exams[i]);
}
```

## Critical Rules

1. **Types**: Always explicit, never `any`
2. **Exports**: Named exports only (no default)
3. **Errors**: Use custom error classes with proper status codes
4. **Validation**: Always use Zod schemas for input
5. **Security**: Prisma for DB, verify JWT, sanitize HTML
6. **Professional**: No console.log, no commented code, no emoji
7. **Modular**: Single responsibility, reusable utilities
8. **DRY**: Extract repeated logic into shared code
9. **Naming**: Follow conventions table exactly

## Quick Decision Tree

**Need to validate input?**
→ Create Zod schema in `validators/`

**Need error handling?**
→ Use custom error classes from `utils/errors.ts`

**Need shared logic?**
→ Create utility in `utils/` with explicit types

**Need database query?**
→ Use Prisma with proper error handling

**Need to format data?**
→ Create pure function in `utils/`

**Need bash script?**
→ Use `set -e`, error handling, logging

**Need styling?**
→ Tailwind first, SCSS for complex cases (BEM naming)

## Summary

**Write professional TypeScript:**

- Explicit types everywhere
- Named exports only
- Custom error classes
- Zod validation
- Pure utilities
- DRY and modular

**Every file should look intentional, well-architected, and maintainable.**
