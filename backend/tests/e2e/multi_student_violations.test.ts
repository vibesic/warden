/**
 * E2E test: Multi-student violation scenarios.
 *
 * Tests complex real-world scenarios involving multiple students:
 *
 *   1. Two students cheat simultaneously — teacher sees both alerts
 *   2. Student disconnects during sniffer challenge — orphan challenge ignored
 *   3. Session ends mid-violation — no ghost violations after end
 *   4. Teacher joins late — sees full violation history
 *
 * Grace period / rapid-reconnect scenarios are covered in wifi_flap.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../helpers/setup';
import { connectClient, connectTeacher, connectTeacherToSession, registerStudent } from '../helpers/socketClient';
import { mockStudentRegistration, applyDefaultMocks, type PrismaMock } from '../helpers/prisma';

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
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

// ── Constants ───────────────────────────────────────────────────────
const SESSION_CODE = '222222';
const activeSession = {
  id: 'sess-multi',
  code: SESSION_CODE,
  isActive: true,
  createdAt: new Date(),
  durationMinutes: 60,
  endedAt: null,
};

// ── Helpers ─────────────────────────────────────────────────────────
let violationCounter = 0;

const mockViolationCreate = (): void => {
  prismaMock.violation.create.mockImplementation(((args: { data: { type: string; reason?: string; details?: string; sessionStudentId: string } }) => {
    violationCounter += 1;
    return Promise.resolve({
      id: `v-multi-${violationCounter}`,
      type: args.data.type,
      reason: args.data.reason ?? null,
      details: args.data.details ?? null,
      sessionStudentId: args.data.sessionStudentId,
      timestamp: new Date(),
    });
  }) as never);
};

const connectAndRegister = async (
  port: number,
  studentId: string,
  name: string,
  ssId: string,
): Promise<ReturnType<typeof import('socket.io-client').default>> => {
  const socket = await connectClient(port, { reconnection: false });
  mockStudentRegistration(prismaMock, studentId, name, `stu-${ssId}`, ssId);
  await registerStudent(socket, { studentId, name, sessionCode: SESSION_CODE });
  return socket;
};

// ── Test suite ──────────────────────────────────────────────────────

describe('E2E: Multi-Student Violation Scenarios', () => {
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
    // Allow stale disconnect events from previous tests to process
    // and their grace timers (100 ms) to fire before clearing.
    await new Promise((r) => setTimeout(r, 250));
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    vi.clearAllMocks();
    violationCounter = 0;
    applyDefaultMocks(prismaMock, { id: 'sess-multi', code: SESSION_CODE, durationMinutes: 60 });
    mockViolationCreate();
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 1: Two students report violations simultaneously
  //             Teacher receives both alerts with correct student IDs.
  // ─────────────────────────────────────────────────────────────────
  it('should deliver violations from multiple students to teacher correctly', async () => {
    const teacherAlerts: Array<{ studentId: string; violation: { type: string } }> = [];

    const teacher = await connectTeacherToSession(ctx.port, SESSION_CODE);
    teacher.on('dashboard:alert', (data: { studentId: string; violation: { type: string } }) => {
      teacherAlerts.push(data);
    });

    const alice = await connectAndRegister(ctx.port, 'alice-01', 'Alice', 'ss-alice');
    const bob = await connectAndRegister(ctx.port, 'bob-01', 'Bob', 'ss-bob');

    // Both report internet access at (nearly) the same time
    alice.emit('report_violation', {
      type: 'INTERNET_ACCESS',
      reason: 'CLIENT_PROBE',
      details: 'Alice detected internet',
    });
    bob.emit('report_violation', {
      type: 'INTERNET_ACCESS',
      reason: 'CLIENT_PROBE',
      details: 'Bob detected internet',
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(teacherAlerts.length).toBe(2);
    const studentIds = teacherAlerts.map((a) => a.studentId).sort();
    expect(studentIds).toEqual(['alice-01', 'bob-01']);

    alice.disconnect();
    bob.disconnect();
    teacher.disconnect();
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 2: Student disconnects while sniffer challenge is pending
  //             → DISCONNECTION fires, but sniffer timeout should NOT fire
  //               because the pending challenge is on the OLD socket.
  // ─────────────────────────────────────────────────────────────────
  it('should not fire sniffer timeout for disconnected student pending challenge', async () => {
    const student = await connectAndRegister(ctx.port, 'sniffer-dc', 'Sniffer DC', 'ss-sniffer');

    // Simulate server setting a pending challenge on the socket
    const sockets = await ctx.io.fetchSockets();
    const targetSocket = sockets.find((s) => s.data.studentId === 'sniffer-dc');
    expect(targetSocket).toBeDefined();

    targetSocket!.data.pendingChallenge = {
      challengeId: 'challenge-123',
      targetUrl: 'https://www.google.com',
      issuedAt: Date.now(),
    };

    // Student disconnects before responding
    student.disconnect();
    await new Promise((r) => setTimeout(r, 250));

    // DISCONNECTION violation should exist
    const disconnectCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(disconnectCalls.length).toBe(1);

    // SNIFFER_TIMEOUT should NOT exist — student's socket is gone,
    // the pending challenge is orphaned with the dead socket.
    const snifferCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'SNIFFER_TIMEOUT',
    );
    expect(snifferCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 3: Session ends while student is disconnected
  //             → No ghost violations should fire after session end.
  // ─────────────────────────────────────────────────────────────────
  it('should NOT create violations after session becomes inactive', async () => {
    const student = await connectAndRegister(ctx.port, 'post-end', 'Post End', 'ss-postend');

    // Student disconnects
    student.disconnect();

    // Session ends during the grace period (before violation fires)
    prismaMock.session.findUnique.mockResolvedValue({
      ...activeSession,
      isActive: false,
      endedAt: new Date(),
    } as never);
    prismaMock.session.findFirst.mockResolvedValue({
      ...activeSession,
      isActive: false,
      endedAt: new Date(),
    } as never);

    // Wait past grace period
    await new Promise((r) => setTimeout(r, 250));

    // No violations should have been created
    const disconnectCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) => (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(disconnectCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 4: Teacher joins session AFTER violations occurred.
  //             Should see violation history via dashboard:session_state.
  // ─────────────────────────────────────────────────────────────────
  it('should include violation history when teacher joins session late', async () => {
    // Pre-populate session students with existing violations
    prismaMock.sessionStudent.findMany.mockResolvedValue([
      {
        id: 'ss-late',
        studentId: 'stu-late',
        sessionId: 'sess-multi',
        isOnline: false,
        createdAt: new Date(),
        lastHeartbeat: new Date(Date.now() - 600_000),
        student: { studentId: 'late-student', name: 'Late Join Test' },
        violations: [
          { id: 'v-1', type: 'DISCONNECTION', reason: 'TAB_CLOSED', details: 'Student closed tab', timestamp: new Date(Date.now() - 300_000) },
          { id: 'v-2', type: 'INTERNET_ACCESS', reason: 'CLIENT_PROBE', details: 'SW detected internet', timestamp: new Date(Date.now() - 200_000) },
        ],
      },
    ] as never);

    // Teacher connects AFTER violations happened
    const teacher = await connectTeacher(ctx.port);

    const sessionState = await new Promise<{
      students: Array<{
        studentId: string;
        violations: Array<{ type: string; reason: string }>;
      }>;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out')), 3000);
      teacher.on('dashboard:session_state', (data: { students: Array<{ studentId: string; violations: Array<{ type: string; reason: string }> }> }) => {
        clearTimeout(timeout);
        resolve(data);
      });
      teacher.emit('dashboard:join_session', { sessionCode: SESSION_CODE });
    });

    expect(sessionState.students).toHaveLength(1);
    expect(sessionState.students[0].violations).toHaveLength(2);

    const violationTypes = sessionState.students[0].violations.map((v) => v.type);
    expect(violationTypes).toContain('DISCONNECTION');
    expect(violationTypes).toContain('INTERNET_ACCESS');

    teacher.disconnect();
  });
});
