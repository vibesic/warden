# AI Agent Code Behavior - Quick Reference

**Project**: Proctor App (proctor-app)  
**Languages**: TypeScript, JavaScript, CSS/SCSS, Bash, JSON, YAML  
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
interface SessionResponse {
  id: string;
  code: string;
  isActive: boolean;
}

const fetchSession = async (code: string): Promise<SessionResponse> => {
  return await api.get<SessionResponse>(`/sessions/${code}`);
};
```

### Type Definitions Location

```typescript
// types/session.ts
export interface Session {
  id: string;
  code: string;
  isActive: boolean;
  durationMinutes: number | null;
  createdAt: Date;
  endedAt: Date | null;
}

export interface StudentStatus {
  studentId: string;
  name: string;
  isOnline: boolean;
  violations: Violation[];
}
```

### Use Const Arrays for Fixed Values

```typescript
export const VALID_VIOLATION_TYPES = [
  'INTERNET_ACCESS',
  'DISCONNECTION',
  'SNIFFER_TIMEOUT',
] as const;

export type ViolationType = typeof VALID_VIOLATION_TYPES[number];
```

### Type Guards Over Assertions

```typescript
// ❌ Never use type assertion
const student = data as Student;

// ✅ Use type guards
function isStudent(obj: unknown): obj is Student {
  return typeof obj === 'object' && obj !== null && 'studentId' in obj && 'name' in obj;
}

if (isStudent(data)) {
  logger.info(`Student registered: ${data.name}`);
}
```

## Naming Conventions

| Type                     | Convention           | Example                                     |
| ------------------------ | -------------------- | ------------------------------------------- |
| Variables/Functions      | camelCase            | `currentTime`, `validateSession()`          |
| Constants                | UPPER_SNAKE_CASE     | `MAX_FILE_SIZE`, `SNIFFER_TIMEOUT_MS`       |
| Classes/Interfaces/Types | PascalCase           | `StudentStatus`, `ViolationType`            |
| Components               | PascalCase           | `SessionDetail.tsx`, `SecureExamMonitor.tsx` |
| Utility files            | camelCase            | `logger.ts`, `validation.ts`                |
| Route files              | kebab-case           | `session-routes.ts`                         |
| Booleans                 | is/has/should prefix | `isOnline`, `hasViolations`                 |

## File Organization

```
backend/src/
├── controllers/     # Request handlers (HTTP endpoints)
├── services/        # Business logic
├── gateway/         # Socket.io handlers + background jobs
├── middleware/       # Auth, validation, error handling
├── routes/          # API route definitions
├── types/           # Shared TypeScript types
├── utils/           # Shared utilities (logger, prisma, errors)
└── __tests__/       # Test files

frontend/src/
├── components/      # UI components
│   ├── common/      # Reusable (Button, Modal, Table, Card)
│   └── layout/      # Layout (Header)
├── hooks/           # Custom hooks (useExamSocket, useInternetSniffer, useTeacherSocket)
├── context/         # React contexts
├── config/          # App configuration
└── App.tsx          # Root component with routing
```

## Module Exports

```typescript
// ❌ Avoid default exports
export default sessionService;

// ✅ Use named exports (better tree-shaking)
export const sessionService = {
  createSession,
  validateSession,
  endSession,
};

// ✅ Use barrel exports for clean imports
export * from './session';
export * from './student';
```

## Error Handling

### Custom Error Classes

```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
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
```

## Input Validation

### Always Use Zod Schemas

```typescript
import { z } from 'zod';

const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6),
});

const ViolationSchema = z.object({
  type: z.enum(VALID_VIOLATION_TYPES),
  details: z.string().max(500).optional(),
});
```

## Security Standards

### Authentication (HMAC-SHA256 Tokens)

```typescript
import crypto from 'crypto';

const verifyToken = (token: string): TokenPayload => {
  const [payloadBase64, signature] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SECRET)
    .update(payloadBase64)
    .digest('hex');

  if (signature !== expectedSig) {
    throw new UnauthorizedError('Invalid token');
  }

  return JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
};
```

### SQL Injection Prevention

```typescript
// ❌ NEVER raw queries with interpolation
const query = `SELECT * FROM students WHERE id = '${id}'`;

// ✅ ALWAYS use Prisma (parameterized)
const student = await prisma.student.findUnique({
  where: { id },
});
```

## Prisma / SQLite

### Always Use Prisma ORM

```typescript
// ✅ Upsert pattern
const student = await prisma.student.upsert({
  where: {
    studentId_sessionId: { studentId, sessionId },
  },
  update: { name, isOnline: true },
  create: { studentId, name, sessionId, isOnline: true },
});

// ✅ Use transactions for multi-step operations
await prisma.$transaction(async (tx) => {
  await tx.session.update({
    where: { id: sessionId },
    data: { isActive: false, endedAt: new Date() },
  });
  await tx.student.updateMany({
    where: { sessionId },
    data: { isOnline: false },
  });
});
```

## CSS/SCSS Standards

### Use Tailwind First, SCSS When Needed

```tsx
// ✅ Prefer Tailwind utilities
<div className="px-4 py-6 bg-white rounded-lg border border-gray-200">
  Content
</div>
```

## Code Quality Checklist

**Before Every Commit:**

- [ ] No `any` types (use `unknown` if needed, then type guard)
- [ ] No `console.log` or `debugger` statements
- [ ] No commented-out code
- [ ] No emoji in code, comments, or messages
- [ ] All functions have explicit return types
- [ ] Descriptive variable names (no `data`, `temp`, `flag`)
- [ ] Functions < 50 lines (guideline)
- [ ] Error handling implemented
- [ ] Input validation with Zod
- [ ] Code is DRY (no duplication)

## Critical Rules

1. **Types**: Always explicit, never `any`
2. **Exports**: Named exports only (no default)
3. **Errors**: Use custom error classes with proper status codes
4. **Validation**: Always use Zod schemas for input
5. **Security**: Prisma for DB, HMAC tokens for auth
6. **Professional**: No console.log, no commented code, no emoji
7. **Modular**: Single responsibility, reusable utilities
8. **DRY**: Extract repeated logic into shared code
9. **Naming**: Follow conventions table exactly
