/**
 * E2E test: "Close tab → switch WiFi → browse internet → return → upload"
 *
 * Simulates the most common student cheating vector where the student:
 *   1. Closes the exam tab (signals tab-closing)
 *   2. Goes offline (socket disconnects, heartbeat stops)
 *   3. Re-appears after a long absence
 *   4. Reports a violation (SW probe detected internet during gap)
 *   5. Re-registers and uploads work
 *
 * Verifies the system correctly:
 *   - Records TAB_CLOSED violation
 *   - Notifies the teacher dashboard of each violation
 *   - Accepts the student's re-registration
 *   - Tracks the full violation history
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../helpers/setup';
import { connectClient, connectTeacherToSession, registerStudent as sharedRegisterStudent } from '../helpers/socketClient';
import { mockStudentRegistration, applyDefaultMocks, getMockedViolationsByReason, getMockedViolationsByType, type PrismaMock } from '../helpers/prisma';

// ── Prisma mock ─────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  violation: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  session: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (cb) => cb(prismaMock)),
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

// ── Helpers ─────────────────────────────────────────────────────────

const SESSION_CODE = '111111';
const STUDENT_ID = 'attack-student-01';
const STUDENT_NAME = 'Cheating Student';

let violationCounter = 0;
const mockViolationCreate = (): void => {
  prismaMock.violation.create.mockImplementation(((args: { data: { type: string; reason?: string; details?: string } }) => {
    violationCounter += 1;
    return Promise.resolve({
      id: `v-atk-${violationCounter}`,
      type: args.data.type,
      reason: args.data.reason ?? null,
      details: args.data.details ?? null,
      sessionStudentId: 'ss-atk',
      timestamp: new Date(),
    });
  }) as never);
};

const connectStudent = (port: number): ReturnType<typeof connectClient> => {
  return connectClient(port, { reconnection: false });
};

const registerStudent = async (socket: Awaited<ReturnType<typeof connectClient>>): Promise<void> => {
  mockStudentRegistration(prismaMock, STUDENT_ID, STUDENT_NAME, 'stu-atk', 'ss-atk');
  await sharedRegisterStudent(socket, {
    studentId: STUDENT_ID,
    name: STUDENT_NAME,
    sessionCode: SESSION_CODE,
  });
};

// ── Test suite ──────────────────────────────────────────────────────

describe('E2E: Tab Close → Internet → Return Attack', () => {
  let ctx: TestServerContext;

  beforeAll(async () => {
    setDisconnectGraceMs(100);
    ctx = await createTestSocketServer();
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    cleanupTestServer(ctx);
  });

  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 250));
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    vi.clearAllMocks();
    violationCounter = 0;
    applyDefaultMocks(prismaMock, { id: 'sess-atk', code: SESSION_CODE, durationMinutes: 60 });
    mockViolationCreate();
  });

  it('should detect full attack: tab-close → offline → return → internet violation → re-register', async () => {
    const teacherAlerts: Array<{ studentId: string; violation: { type: string; reason?: string; details?: string } }> = [];

    // ── Step 1: Teacher joins dashboard ──────────────────────────
    const teacherSocket = await connectTeacherToSession(ctx.port, SESSION_CODE);

    teacherSocket.on('dashboard:alert', (data: { studentId: string; violation: { type: string; reason?: string } }) => {
      teacherAlerts.push(data);
    });

    // ── Step 2: Student registers and is connected ──────────
    const studentSocket1 = await connectStudent(ctx.port);
    await registerStudent(studentSocket1);

    // ── Step 3: Student signals tab-closing then disconnects ────
    studentSocket1.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 30));
    studentSocket1.disconnect();

    // Wait past grace period → TAB_CLOSED violation fires
    await new Promise((r) => setTimeout(r, 350));

    // Verify TAB_CLOSED violation was created
    const tabClosedCalls = getMockedViolationsByReason(prismaMock, 'TAB_CLOSED');
    expect(tabClosedCalls.length).toBe(1);

    // Verify teacher received the alert
    const tabCloseAlert = teacherAlerts.find((a) => a.violation.reason === 'TAB_CLOSED');
    expect(tabCloseAlert).toBeDefined();
    expect(tabCloseAlert?.studentId).toBe(STUDENT_ID);

    // ── Step 4: Student returns (new socket) and re-registers ───
    const studentSocket2 = await connectStudent(ctx.port);
    await registerStudent(studentSocket2);

    // ── Step 5: Client reports SW probe detected internet ────────
    prismaMock.violation.create.mockClear();

    studentSocket2.emit('report_violation', {
      type: 'INTERNET_ACCESS',
      reason: 'CLIENT_PROBE',
      details: 'Service Worker detected internet access during disconnect gap',
    });

    await new Promise((r) => setTimeout(r, 150));

    // Verify INTERNET_ACCESS violation was created
    const internetCalls = getMockedViolationsByType(prismaMock, 'INTERNET_ACCESS');
    expect(internetCalls.length).toBe(1);
    expect((internetCalls[0][0] as { data: { reason: string } }).data.reason).toBe('CLIENT_PROBE');

    // Verify teacher received the internet access alert
    const internetAlert = teacherAlerts.find((a) => a.violation.type === 'INTERNET_ACCESS');
    expect(internetAlert).toBeDefined();

    // ── Step 6: Verify full violation history on teacher side ────
    expect(teacherAlerts.length).toBeGreaterThanOrEqual(2);
    const types = teacherAlerts.map((a) => a.violation.type);
    expect(types).toContain('DISCONNECTION');
    expect(types).toContain('INTERNET_ACCESS');

    // Cleanup
    studentSocket2.disconnect();
    teacherSocket.disconnect();
  });

  it('should detect return without internet evidence (suspicious absence only)', async () => {
    const teacherAlerts: Array<{ studentId: string; violation: { type: string; reason?: string } }> = [];

    const teacherSocket = await connectTeacherToSession(ctx.port, SESSION_CODE);
    teacherSocket.on('dashboard:alert', (data: { studentId: string; violation: { type: string; reason?: string } }) => {
      teacherAlerts.push(data);
    });

    // Student registers, then closes tab and disappears
    const socket1 = await connectStudent(ctx.port);
    await registerStudent(socket1);

    socket1.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 30));
    socket1.disconnect();
    await new Promise((r) => setTimeout(r, 250));

    // Student returns but SW found NO internet → only TAB_CLOSED violation
    const socket2 = await connectStudent(ctx.port);
    await registerStudent(socket2);

    // Client reports prolonged absence from the continuity clock
    socket2.emit('report_violation', {
      type: 'DISCONNECTION',
      reason: 'PROLONGED_ABSENCE',
      details: 'App was inactive for 600s',
    });

    await new Promise((r) => setTimeout(r, 150));

    // Teacher should see TAB_CLOSED (PROLONGED_ABSENCE is suppressed
    // by the 5-min DISCONNECTION cooldown that TAB_CLOSED activated)
    const reasons = teacherAlerts.map((a) => a.violation.reason);
    expect(reasons).toContain('TAB_CLOSED');

    socket2.disconnect();
    teacherSocket.disconnect();
  });

  it('should allow student to re-register and continue working after violation', async () => {
    // Student registers
    const socket1 = await connectStudent(ctx.port);
    await registerStudent(socket1);

    // Student closes tab
    socket1.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 30));
    socket1.disconnect();
    await new Promise((r) => setTimeout(r, 250));

    // Student returns and successfully re-registers
    const socket2 = await connectStudent(ctx.port);

    const registered = await new Promise<boolean>((resolve) => {
      mockStudentRegistration(prismaMock, STUDENT_ID, STUDENT_NAME, 'stu-atk', 'ss-atk');
      socket2.emit('register', {
        studentId: STUDENT_ID,
        name: STUDENT_NAME,
        sessionCode: SESSION_CODE,
      });
      socket2.once('registered', () => resolve(true));
      socket2.once('registration_error', () => resolve(false));
    });

    expect(registered).toBe(true);

    // Student can still send heartbeats (session continues)
    socket2.emit('heartbeat', { studentId: STUDENT_ID });
    await new Promise((r) => setTimeout(r, 50));
    expect(prismaMock.sessionStudent.update).toHaveBeenCalled();

    socket2.disconnect();
  });
});
