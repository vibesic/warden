/**
 * E2E test: Sniffer evasion — student lies but client-side probe catches them.
 *
 * Validates the dual-detection model: even when a student responds "not
 * reachable" to the server's sniffer challenge, the client-side Service
 * Worker probe independently detects internet and reports a violation.
 *
 * The complementary sniffer scenarios (reachable=true → violation,
 * reachable=false → no violation, mismatched challengeId → ignored) are
 * already covered in:
 *   - socket.test.ts
 *   - studentHandlers.test.ts
 *   - security_advanced.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../helpers/setup';
import { connectClient, registerStudent } from '../helpers/socketClient';

// ── Prisma mock ─────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  student: { upsert: vi.fn() },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  violation: { create: vi.fn() },
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
}));

vi.mock('@src/utils/prisma', () => ({ prisma: prismaMock }));

// ── Constants ───────────────────────────────────────────────────────

const SESSION_CODE = '333333';

const activeSession = {
  id: 'sess-sniffer',
  code: SESSION_CODE,
  isActive: true,
  createdAt: new Date(),
  durationMinutes: 60,
  endedAt: null,
};

// ── Test suite ──────────────────────────────────────────────────────

describe('E2E: Sniffer Evasion — Liar Caught by Client Probe', () => {
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

    prismaMock.session.findUnique.mockResolvedValue(activeSession as never);
    prismaMock.session.findFirst.mockResolvedValue(activeSession as never);
    prismaMock.student.upsert.mockResolvedValue({
      id: 'stu-sn', studentId: 'sniffer-student', name: 'Sniffer Test',
    } as never);
    prismaMock.sessionStudent.upsert.mockResolvedValue({
      id: 'ss-sn', student: { studentId: 'sniffer-student', name: 'Sniffer Test' },
    } as never);
    prismaMock.violation.create.mockResolvedValue({
      id: 'v-1', type: 'INTERNET_ACCESS', reason: 'CLIENT_PROBE',
      details: '', sessionStudentId: 'ss-sn', timestamp: new Date(),
    } as never);
  });

  it('should catch student who lies to sniffer via client-side report_violation', async () => {
    const student = await connectClient(ctx.port, { reconnection: false });
    await registerStudent(student, {
      studentId: 'sniffer-student',
      name: 'Sniffer Test',
      sessionCode: SESSION_CODE,
    });

    await new Promise((r) => setTimeout(r, 100));

    // Server issues a sniffer challenge
    const sockets = await ctx.io.fetchSockets();
    const target = sockets.find((s) => s.data.studentId === 'sniffer-student');
    expect(target).toBeDefined();

    target!.data.pendingChallenge = {
      challengeId: 'lie-challenge',
      targetUrl: 'https://www.google.com',
      issuedAt: Date.now(),
    };

    // Student lies — says "not reachable"
    student.emit('sniffer:response', {
      challengeId: 'lie-challenge',
      reachable: false,
      statusCode: 0,
    });
    await new Promise((r) => setTimeout(r, 100));

    // No sniffer violation — the student "passed"
    expect(prismaMock.violation.create).not.toHaveBeenCalled();

    // Client-side Service Worker detected internet and reports it
    student.emit('report_violation', {
      type: 'INTERNET_ACCESS',
      reason: 'CLIENT_PROBE',
      details: 'Service Worker detected internet connectivity while tab was hidden',
    });
    await new Promise((r) => setTimeout(r, 200));

    // The client-side probe catches the cheater
    const calls = prismaMock.violation.create.mock.calls;
    expect(calls.length).toBe(1);
    const violationData = (calls[0][0] as { data: { type: string; reason: string } }).data;
    expect(violationData.type).toBe('INTERNET_ACCESS');
    expect(violationData.reason).toBe('CLIENT_PROBE');

    student.disconnect();
  });
});
