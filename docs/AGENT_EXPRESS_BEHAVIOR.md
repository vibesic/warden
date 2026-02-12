# AI Agent Express Behavior - Quick Reference

**Project**: Quiz Application (cert-app)  
**Framework**: Express.js + TypeScript + Prisma  
**Architecture**: Layered (Routes → Middleware → Controllers → Services → Data Access)

## Architecture Pattern

```
Routes (HTTP endpoints)
  ↓
Middleware (Auth, validation)
  ↓
Controllers (Request handling)
  ↓
Services (Business logic)
  ↓
Database (Prisma ORM)
```

## File Structure

```
backend/src/
├── routes/         # API endpoints
├── middleware/     # Auth, validation, error handling
├── controllers/    # Request/response handlers
├── services/       # Business logic
├── validators/     # Zod schemas
├── utils/          # Errors, logger, helpers
└── config/         # DB, Redis, logger config
```

## Controller Pattern

### Responsibilities

- Handle HTTP request/response **ONLY**
- Extract data from request
- Call service methods
- Format response
- **NO business logic**

### Template

```typescript
// controllers/exam.controller.ts
import { Request, Response, NextFunction } from 'express';
import { examService } from '@/services/exam.service';
import { AppError } from '@/utils/errors';

export const examController = {
  async getExamById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const exam = await examService.getExamById(id);

      if (!exam) {
        throw new AppError('Exam not found', 404);
      }

      res.json({
        success: true,
        data: exam,
      });
    } catch (error) {
      next(error);
    }
  },

  async createExam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = req.user!.id;
      const exam = await examService.createExam(teacherId, req.body);

      res.status(201).json({
        success: true,
        data: exam,
        message: 'Exam created successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};
```

### Controller Rules

**✅ DO:**

- Use try-catch blocks
- Pass errors to `next(error)`
- Return consistent response format: `{ success, data?, message?, errors? }`
- Use correct HTTP status codes (200, 201, 204, 400, 401, 403, 404, 500)
- Document endpoints with JSDoc

**❌ DON'T:**

- Put business logic in controllers
- Access database directly
- Perform validations (use middleware)
- Handle errors without `next()`
- Return inconsistent formats

## Service Pattern

### Responsibilities

- Implement **ALL business logic**
- Validate business rules
- Database operations
- Caching (Redis)
- **NO HTTP concerns**

### Template

```typescript
// services/exam.service.ts
import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export const examService = {
  async getExamById(examId: string) {
    const cacheKey = `exam:${examId}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Fetch from DB
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        teacher: { select: { id: true, name: true } },
      },
    });

    // Cache result
    if (exam) {
      await redis.setex(cacheKey, 3600, JSON.stringify(exam));
    }

    return exam;
  },

  async createExam(teacherId: string, data: CreateExamData) {
    // Validate business rules
    this.validateExamData(data);

    // Use transaction for atomic operations
    const exam = await prisma.$transaction(async tx => {
      return await tx.exam.create({
        data: {
          title: data.title,
          description: data.description,
          duration: data.duration,
          teacherId,
          questions: {
            create: data.questions.map((q, index) => ({
              ...q,
              order: index,
            })),
          },
        },
        include: { questions: true },
      });
    });

    logger.info(`Exam created: ${exam.id} by teacher: ${teacherId}`);
    return exam;
  },

  async updateExam(examId: string, teacherId: string, updates: UpdateExamData) {
    // Check ownership
    const exam = await prisma.exam.findUnique({ where: { id: examId } });

    if (!exam) {
      throw new AppError('Exam not found', 404);
    }

    if (exam.teacherId !== teacherId) {
      throw new AppError('Unauthorized to update this exam', 403);
    }

    // Business rule: no updates during active sessions
    const activeSessions = await prisma.examSession.count({
      where: { examId, status: 'IN_PROGRESS' },
    });

    if (activeSessions > 0) {
      throw new AppError('Cannot update exam with active sessions', 400);
    }

    // Update and invalidate cache
    const updated = await prisma.exam.update({
      where: { id: examId },
      data: updates,
      include: { questions: true },
    });

    await redis.del(`exam:${examId}`);
    return updated;
  },

  validateExamData(data: CreateExamData): void {
    if (!data.title?.trim()) {
      throw new AppError('Exam title is required', 400);
    }

    if (data.duration <= 0 || data.duration > 480) {
      throw new AppError('Duration must be between 1-480 minutes', 400);
    }

    if (!data.questions?.length) {
      throw new AppError('Exam must have at least one question', 400);
    }

    data.questions.forEach((q, i) => {
      if (!q.question?.trim()) {
        throw new AppError(`Question ${i + 1} is empty`, 400);
      }
      if (q.options.length < 2) {
        throw new AppError(`Question ${i + 1} needs at least 2 options`, 400);
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        throw new AppError(`Question ${i + 1} has invalid answer index`, 400);
      }
    });
  },
};
```

### Service Rules

**✅ DO:**

- Implement all business logic
- Use transactions for multi-step operations
- Validate business rules
- Use caching for read-heavy data
- Log important operations
- Throw `AppError` with proper status codes

**❌ DON'T:**

- Access `req`/`res` objects
- Return HTTP status codes
- Handle HTTP concerns
- Skip error handling

## Middleware Pattern

### Authentication Middleware

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '@/utils/errors';

interface JwtPayload {
  id: string;
  email: string;
  role: 'TEACHER' | 'STUDENT';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

export const authorize = (...roles: ('TEACHER' | 'STUDENT')[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};
```

### Validation Middleware

```typescript
// middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '@/utils/errors';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        next(new AppError('Validation failed', 400, errors));
      } else {
        next(error);
      }
    }
  };
};
```

### Error Handler Middleware

```typescript
// middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
  });

  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json({
      success: false,
      message: 'Database operation failed',
    });
    return;
  }

  // Unknown errors
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
};
```

## Routes Pattern

```typescript
// routes/exam.routes.ts
import { Router } from 'express';
import { examController } from '@/controllers/exam.controller';
import { authenticate, authorize } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { createExamSchema, updateExamSchema } from '@/validators/exam.validator';

const router = Router();

// Teacher routes
router.get('/teacher/exams', authenticate, authorize('TEACHER'), examController.getTeacherExams);

router.post(
  '/teacher/exams',
  authenticate,
  authorize('TEACHER'),
  validate(createExamSchema),
  examController.createExam
);

router.put(
  '/teacher/exams/:id',
  authenticate,
  authorize('TEACHER'),
  validate(updateExamSchema),
  examController.updateExam
);

// Student routes
router.get('/student/exams', authenticate, authorize('STUDENT'), examController.getStudentExams);

export default router;
```

## Validation Pattern

```typescript
// validators/exam.validator.ts
import { z } from 'zod';

export const createExamSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(480),
    questions: z
      .array(
        z.object({
          question: z.string().min(1),
          options: z.array(z.string()).min(2).max(10),
          answer: z.number().int().min(0),
          points: z.number().int().min(1).default(1),
        })
      )
      .min(1)
      .max(100),
  }),
});

export const updateExamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    duration: z.number().int().min(1).max(480).optional(),
    isActive: z.boolean().optional(),
  }),
});
```

## Database Patterns

### Use Transactions

```typescript
// ✅ Use transactions for multi-step operations
await prisma.$transaction(async tx => {
  const exam = await tx.exam.create({ data: examData });
  const sessions = await tx.examSession.createMany({ data: sessionData });
  return { exam, sessions };
});
```

### Use Includes for Relations

```typescript
// ✅ Load related data efficiently
const exam = await prisma.exam.findUnique({
  where: { id },
  include: {
    questions: { orderBy: { order: 'asc' } },
    teacher: { select: { id: true, name: true } },
  },
});
```

### Use Select for Specific Fields

```typescript
// ✅ Reduce payload size
const exams = await prisma.exam.findMany({
  select: {
    id: true,
    title: true,
    duration: true,
    _count: { select: { sessions: true } },
  },
});
```

## Security Patterns

```typescript
// app.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // 100 requests per IP
});
app.use('/api/', limiter);

// Strict limit for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});
app.use('/api/auth/login', authLimiter);
```

## Response Format

**Always use consistent format:**

```typescript
// Success (200, 201)
{
  success: true,
  data: { ... },
  message?: "Optional message"
}

// Error (400, 401, 403, 404, 500)
{
  success: false,
  message: "Error message",
  errors?: [ ... ] // Optional validation errors
}
```

## HTTP Status Codes

| Code | Usage                                |
| ---- | ------------------------------------ |
| 200  | Success (GET, PUT, DELETE)           |
| 201  | Created (POST)                       |
| 204  | No Content (DELETE with no response) |
| 400  | Bad Request (validation errors)      |
| 401  | Unauthorized (no/invalid token)      |
| 403  | Forbidden (insufficient permissions) |
| 404  | Not Found                            |
| 500  | Internal Server Error                |

## Critical Rules

1. **Separation**: Controllers handle HTTP, services handle business logic
2. **Errors**: Always use custom `AppError` classes with status codes
3. **Validation**: Use Zod schemas in middleware, NOT in controllers
4. **Transactions**: Use for multi-step DB operations
5. **Caching**: Cache read-heavy data with Redis
6. **Logging**: Log all important operations and errors
7. **Security**: Always authenticate/authorize, validate input, rate limit
8. **Consistency**: Use standard response format everywhere

## Quick Decision Tree

**Need to handle HTTP request?**
→ Create controller method (thin, calls service)

**Need business logic?**
→ Create service method (thick, all logic here)

**Need to validate input?**
→ Create Zod schema in `validators/`, use `validate()` middleware

**Need to check auth?**
→ Use `authenticate` + `authorize('TEACHER')` middleware

**Need multi-step DB operation?**
→ Use `prisma.$transaction()`

**Need to cache data?**
→ Check Redis first, then DB, then cache result

**Need to throw error?**
→ Use `AppError` with proper status code (400, 401, 403, 404)

## Summary

**Express architecture:**

- Routes → Middleware → Controllers → Services → Database
- Controllers: thin, HTTP only
- Services: thick, all business logic
- Middleware: auth, validation, error handling
- Always use transactions, caching, proper errors

**Every endpoint should follow this exact pattern.**
