# AI Agent Test Behavior - Quick Reference

**Project**: Quiz Application (cert-app)  
**Framework**: Vitest for E2E tests  
**Approach**: E2E only, no unit/integration tests  
**Environment**: Clone test database from dev

## Testing Philosophy

**ONLY E2E tests:**

- Test complete API flows end-to-end
- Real database operations (test DB clone)
- Real HTTP requests to backend
- No mocking, no unit tests, no integration tests

**Why E2E Only:**

- Tests real user scenarios
- Catches integration issues
- Validates complete request/response cycle
- Tests database transactions
- Verifies authentication/authorization

## Test Environment

### Architecture

```
Host Machine (E2E Tests)
  ↓ HTTP requests
Docker Container (backend-test service)
  ↓ connects to
Docker Container (postgres-test with cloned data)
```

### Database Setup

**Test database is cloned from dev:**

1. Development database runs normally
2. Test script clones dev database → test database
3. E2E tests run against test database
4. Test database reset after tests

**Never test against:**

- ❌ Development database (pollutes data)
- ❌ Production database (dangerous)
- ❌ In-memory database (not realistic)

## Test Structure

### File Organization

```
backend/test/
├── api/                    # E2E API tests
│   ├── auth.e2e.test.ts   # Authentication flows
│   ├── exam.e2e.test.ts   # Exam CRUD operations
│   ├── session.e2e.test.ts # Exam sessions
│   └── admin.e2e.test.ts   # Admin operations
├── helpers/                # Test utilities
│   ├── setup.ts           # Global setup/teardown
│   ├── factories.ts       # Test data factories
│   └── api-client.ts      # HTTP client wrapper
├── setup-test-db.sh       # Clone dev DB → test DB
├── teardown-test-db.sh    # Cleanup test DB
└── run-tests.sh           # Run all E2E tests
```

### Naming Convention

```
<feature>.e2e.test.ts  # E2E test file
```

Examples:

- `auth.e2e.test.ts`
- `exam.e2e.test.ts`
- `question.e2e.test.ts`
- `certificate.e2e.test.ts`

## Vitest Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // E2E test settings
    include: ['test/api/**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Run tests sequentially (avoid DB conflicts)
    threads: false,

    // Timeout for E2E tests (longer than unit tests)
    testTimeout: 30000,
    hookTimeout: 30000,

    // Global setup/teardown
    globalSetup: ['./test/helpers/setup.ts'],

    // Environment
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://quizuser:quizpass@localhost:5433/quizapp_test',
      JWT_SECRET: 'test-secret-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Key Settings

| Setting              | Value               | Reason                           |
| -------------------- | ------------------- | -------------------------------- |
| `threads: false`     | Sequential          | Avoid database conflicts         |
| `testTimeout: 30000` | 30 seconds          | E2E tests slower than unit tests |
| `include`            | `**/*.e2e.test.ts`  | Only E2E tests                   |
| `DATABASE_URL`       | Test DB (port 5433) | Separate from dev DB (5432)      |

## Test Template

### Complete E2E Test Pattern

```typescript
// test/api/exam.e2e.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { apiClient } from '../helpers/api-client';
import { createUser, createExam } from '../helpers/factories';
import { prisma } from '@/config/prisma';

describe('Exam API (E2E)', () => {
  let teacherToken: string;
  let studentToken: string;
  let teacherId: string;

  // Setup: Create test users
  beforeAll(async () => {
    const teacher = await createUser({ role: 'TEACHER' });
    const student = await createUser({ role: 'STUDENT' });

    teacherId = teacher.id;

    teacherToken = await apiClient.login(teacher.email, 'password');
    studentToken = await apiClient.login(student.email, 'password');
  });

  // Cleanup: Delete test data after each test
  beforeEach(async () => {
    await prisma.exam.deleteMany({});
  });

  // Cleanup: Close connections
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/teacher/exams', () => {
    it('should create exam with valid data', async () => {
      // Arrange
      const examData = {
        title: 'Mathematics Final',
        description: 'End of semester exam',
        duration: 60,
        questions: [
          {
            question: 'What is 2+2?',
            options: ['3', '4', '5', '6'],
            answer: 1,
            points: 10,
          },
        ],
      };

      // Act
      const response = await apiClient.post('/api/teacher/exams', examData, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });

      // Assert
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toMatchObject({
        title: examData.title,
        duration: examData.duration,
        teacherId: teacherId,
      });
      expect(response.data.data.questions).toHaveLength(1);

      // Verify in database
      const savedExam = await prisma.exam.findUnique({
        where: { id: response.data.data.id },
        include: { questions: true },
      });
      expect(savedExam).not.toBeNull();
      expect(savedExam!.questions).toHaveLength(1);
    });

    it('should reject exam without authentication', async () => {
      const examData = { title: 'Test', duration: 60, questions: [] };

      const response = await apiClient.post('/api/teacher/exams', examData, {
        validateStatus: () => true, // Don't throw on 401
      });

      expect(response.status).toBe(401);
      expect(response.data.success).toBe(false);
    });

    it('should reject exam with invalid data', async () => {
      const examData = {
        title: '', // Invalid: empty title
        duration: 0, // Invalid: zero duration
        questions: [], // Invalid: no questions
      };

      const response = await apiClient.post('/api/teacher/exams', examData, {
        headers: { Authorization: `Bearer ${teacherToken}` },
        validateStatus: () => true,
      });

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.errors).toBeDefined();
    });

    it('should reject student creating exam', async () => {
      const examData = { title: 'Test', duration: 60, questions: [] };

      const response = await apiClient.post('/api/teacher/exams', examData, {
        headers: { Authorization: `Bearer ${studentToken}` },
        validateStatus: () => true,
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });
  });

  describe('GET /api/teacher/exams', () => {
    it('should list teacher exams', async () => {
      // Arrange: Create test exams
      await createExam({ teacherId, title: 'Exam 1' });
      await createExam({ teacherId, title: 'Exam 2' });

      // Act
      const response = await apiClient.get('/api/teacher/exams', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });

      // Assert
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveLength(2);
      expect(response.data.data[0]).toHaveProperty('title');
      expect(response.data.data[0]).toHaveProperty('duration');
    });
  });
});
```

## Test Helpers

### API Client Wrapper

```typescript
// test/helpers/api-client.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      validateStatus: status => status < 500, // Don't throw on 4xx
    });
  }

  async get(url: string, config?: AxiosRequestConfig) {
    return this.client.get(url, config);
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.post(url, data, config);
  }

  async put(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.client.put(url, data, config);
  }

  async delete(url: string, config?: AxiosRequestConfig) {
    return this.client.delete(url, config);
  }

  async login(email: string, password: string): Promise<string> {
    const response = await this.post('/api/auth/login', { email, password });
    return response.data.data.token;
  }
}

export const apiClient = new ApiClient();
```

### Test Data Factories

```typescript
// test/helpers/factories.ts
import { prisma } from '@/config/prisma';
import bcrypt from 'bcrypt';

export async function createUser(data: {
  email?: string;
  name?: string;
  role?: 'TEACHER' | 'STUDENT';
}) {
  const email = data.email || `test-${Date.now()}@example.com`;
  const hashedPassword = await bcrypt.hash('password', 10);

  return await prisma.user.create({
    data: {
      email,
      name: data.name || 'Test User',
      password: hashedPassword,
      role: data.role || 'STUDENT',
    },
  });
}

export async function createExam(data: { teacherId: string; title?: string; duration?: number }) {
  return await prisma.exam.create({
    data: {
      title: data.title || 'Test Exam',
      description: 'Test description',
      duration: data.duration || 60,
      teacherId: data.teacherId,
      questions: {
        create: [
          {
            question: 'Test question?',
            options: ['A', 'B', 'C', 'D'],
            answer: 0,
            points: 10,
            order: 0,
          },
        ],
      },
    },
  });
}

export async function createSession(data: { examId: string; studentId: string }) {
  const exam = await prisma.exam.findUnique({ where: { id: data.examId } });
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + exam!.duration * 60 * 1000);

  return await prisma.examSession.create({
    data: {
      examId: data.examId,
      studentId: data.studentId,
      startTime,
      endTime,
      status: 'IN_PROGRESS',
    },
  });
}
```

### Global Setup/Teardown

```typescript
// test/helpers/setup.ts
import { execSync } from 'child_process';

export async function setup() {
  console.log('Setting up test environment...');

  // Clone dev database to test database
  try {
    execSync('bash test/setup-test-db.sh', { stdio: 'inherit' });
    console.log('Test database ready');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

export async function teardown() {
  console.log('Cleaning up test environment...');

  // Optional: Clean up test database
  try {
    execSync('bash test/teardown-test-db.sh', { stdio: 'inherit' });
    console.log('Test database cleaned up');
  } catch (error) {
    console.error('Failed to teardown test database:', error);
  }
}
```

## Database Scripts

### Setup Test Database

```bash
#!/bin/bash
# test/setup-test-db.sh

set -e

echo "Setting up test database..."

# Drop existing test database
docker compose -f docker-compose.dev.yml exec -T postgres psql -U quizuser -d postgres -c "DROP DATABASE IF EXISTS quizapp_test;"

# Create test database by cloning dev database
docker compose -f docker-compose.dev.yml exec -T postgres psql -U quizuser -d postgres -c "CREATE DATABASE quizapp_test WITH TEMPLATE quizapp;"

echo "Test database ready (cloned from dev)"
```

### Teardown Test Database

```bash
#!/bin/bash
# test/teardown-test-db.sh

set -e

echo "Cleaning up test database..."

# Drop test database
docker compose -f docker-compose.dev.yml exec -T postgres psql -U quizuser -d postgres -c "DROP DATABASE IF EXISTS quizapp_test;"

echo "Test database cleaned up"
```

### Run Tests Script

```bash
#!/bin/bash
# test/run-tests.sh

set -e

echo "Running E2E tests..."

# 1. Setup test database
bash test/setup-test-db.sh

# 2. Run tests on host (connects to Docker services)
cd backend
npm run test:e2e

# 3. Cleanup (optional)
# bash test/teardown-test-db.sh

echo "E2E tests complete"
```

## Running Tests

### Commands

```bash
# Run all E2E tests (from project root)
cd backend && npm run test:e2e

# Run specific test file
cd backend && npx vitest test/api/exam.e2e.test.ts

# Run tests in watch mode
cd backend && npx vitest --watch

# Run tests with coverage
cd backend && npx vitest --coverage

# Run tests matching pattern
cd backend && npx vitest -t "should create exam"
```

### package.json Scripts

```json
{
  "scripts": {
    "test:e2e": "bash test/setup-test-db.sh && vitest run",
    "test:e2e:watch": "vitest --watch",
    "test:e2e:coverage": "vitest run --coverage"
  }
}
```

## Test Patterns

### AAA Pattern (Arrange-Act-Assert)

```typescript
it('should create exam', async () => {
  // Arrange: Setup test data
  const examData = { title: 'Test', duration: 60, questions: [] };

  // Act: Execute the operation
  const response = await apiClient.post('/api/teacher/exams', examData, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Assert: Verify the result
  expect(response.status).toBe(201);
  expect(response.data.data.title).toBe('Test');
});
```

### Test CRUD Operations

```typescript
describe('Exam CRUD', () => {
  it('should CREATE exam', async () => {
    const response = await apiClient.post('/api/teacher/exams', data, { headers });
    expect(response.status).toBe(201);
  });

  it('should READ exam', async () => {
    const response = await apiClient.get(`/api/teacher/exams/${examId}`, { headers });
    expect(response.status).toBe(200);
  });

  it('should UPDATE exam', async () => {
    const response = await apiClient.put(`/api/teacher/exams/${examId}`, updates, { headers });
    expect(response.status).toBe(200);
  });

  it('should DELETE exam', async () => {
    const response = await apiClient.delete(`/api/teacher/exams/${examId}`, { headers });
    expect(response.status).toBe(204);
  });
});
```

### Test Authentication/Authorization

```typescript
describe('Authorization', () => {
  it('should reject unauthenticated request', async () => {
    const response = await apiClient.get('/api/teacher/exams', {
      validateStatus: () => true,
    });
    expect(response.status).toBe(401);
  });

  it('should reject student accessing teacher endpoint', async () => {
    const response = await apiClient.get('/api/teacher/exams', {
      headers: { Authorization: `Bearer ${studentToken}` },
      validateStatus: () => true,
    });
    expect(response.status).toBe(403);
  });

  it('should allow teacher accessing teacher endpoint', async () => {
    const response = await apiClient.get('/api/teacher/exams', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(response.status).toBe(200);
  });
});
```

### Test Validation

```typescript
describe('Validation', () => {
  it('should reject empty title', async () => {
    const response = await apiClient.post(
      '/api/teacher/exams',
      { title: '', duration: 60, questions: [] },
      { headers, validateStatus: () => true }
    );
    expect(response.status).toBe(400);
    expect(response.data.errors).toBeDefined();
  });

  it('should reject invalid duration', async () => {
    const response = await apiClient.post(
      '/api/teacher/exams',
      { title: 'Test', duration: 0, questions: [] },
      { headers, validateStatus: () => true }
    );
    expect(response.status).toBe(400);
  });

  it('should reject exam without questions', async () => {
    const response = await apiClient.post(
      '/api/teacher/exams',
      { title: 'Test', duration: 60, questions: [] },
      { headers, validateStatus: () => true }
    );
    expect(response.status).toBe(400);
  });
});
```

### Test Complete Flows

```typescript
describe('Complete Exam Flow', () => {
  it('should complete full exam lifecycle', async () => {
    // 1. Teacher creates exam
    const createResponse = await apiClient.post('/api/teacher/exams', examData, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const examId = createResponse.data.data.id;

    // 2. Student starts exam
    const startResponse = await apiClient.post(
      `/api/student/exams/${examId}/start`,
      {},
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    const sessionId = startResponse.data.data.id;

    // 3. Student submits answers
    const submitResponse = await apiClient.post(
      `/api/student/sessions/${sessionId}/submit`,
      { answers: [{ questionId: 'q1', answer: 0 }] },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(submitResponse.status).toBe(200);

    // 4. Teacher views results
    const resultsResponse = await apiClient.get(`/api/teacher/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(resultsResponse.status).toBe(200);
    expect(resultsResponse.data.data.status).toBe('COMPLETED');
  });
});
```

## Critical Rules

1. **E2E Only**: Never write unit or integration tests
2. **Clone Test DB**: Always clone from dev, never use dev DB
3. **Run on Host**: E2E tests run on host, connect to Docker services
4. **Sequential Tests**: Use `threads: false` to avoid DB conflicts
5. **Clean Data**: Use `beforeEach` to clean test data
6. **Close Connections**: Always `$disconnect()` in `afterAll`
7. **Factories**: Use factories for consistent test data
8. **Real Requests**: Use HTTP client, no mocking
9. **Verify in DB**: Check database state after operations
10. **Descriptive Names**: Use `should <behavior>` pattern

## Quick Decision Tree

**Need to test API endpoint?**
→ Create E2E test with real HTTP requests

**Need test data?**
→ Use factory functions in `helpers/factories.ts`

**Need to authenticate?**
→ Use `apiClient.login()` to get token

**Test failing intermittently?**
→ Check `threads: false` and clean data in `beforeEach`

**Need to verify database state?**
→ Query Prisma directly in test assertions

**Tests too slow?**
→ Reduce test data, use `describe.only()` for debugging

## Summary

**E2E testing approach:**

- Only E2E tests (no unit/integration)
- Clone dev database to test database
- Run tests on host (connect to Docker)
- Use Vitest with sequential execution
- Real HTTP requests, no mocking
- Factories for test data
- AAA pattern (Arrange-Act-Assert)
- Test CRUD, auth, validation, complete flows

**Every test validates real API behavior end-to-end.**
