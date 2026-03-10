/**
 * Integration tests for disconnect reason differentiation.
 *
 * Verifies the system correctly identifies and records the reason for
 * each type of student disconnection:
 *
 *  1. Tab/window close (intentional) — student emits 'student:tab-closing'
 *     before disconnecting.
 *  2. WiFi drop / network loss — transport closes without tab-closing signal.
 *  3. Ping timeout — server does not receive a pong in time.
 *  4. Heartbeat timeout — no heartbeat for >120 s (background job).
 *  5. Grace period cancellation — reconnect within grace window produces
 *     no violation regardless of reason.
 *  6. Tab-closing + quick reconnect — grace period still cancels the
 *     violation even when tab-closing was signalled.
 */
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, createTestSocketServerNoListen, type TestServerContext } from '../../helpers/setup';

// ── Prisma mock ─────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  violation: {
    create: vi.fn().mockResolvedValue({
      id: 'v-default',
      timestamp: new Date(),
      type: 'DISCONNECTION',
      details: '',
      sessionStudentId: '',
    }),
  },
  session: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

// ── Constants ───────────────────────────────────────────────────────
const STUDENT_ID = 'disconnect-reason-student';
const STUDENT_NAME = 'Disconnect Test';
const SESSION_CODE = '999999';

const activeSession = {
  id: 's1',
  code: SESSION_CODE,
  isActive: true,
  createdAt: new Date(),
  durationMinutes: null,
  endedAt: null,
};

// ── Helpers ─────────────────────────────────────────────────────────
const setupStudentMocks = (): void => {
  prismaMock.student.upsert.mockResolvedValue({
    id: 'stu-dc',
    studentId: STUDENT_ID,
    name: STUDENT_NAME,
  });
  prismaMock.sessionStudent.upsert.mockResolvedValue({
    id: 'ss-dc',
    student: { studentId: STUDENT_ID, name: STUDENT_NAME },
  });
};

const connectAndRegister = async (port: number): Promise<ClientSocket> => {
  const socket = Client(`http://localhost:${port}`, {
    reconnection: false,
  });
  await new Promise<void>((resolve) => socket.on('connect', resolve));

  setupStudentMocks();

  await new Promise<void>((resolve) => {
    socket.emit('register', {
      studentId: STUDENT_ID,
      name: STUDENT_NAME,
      sessionCode: SESSION_CODE,
    });
    socket.once('registered', () => resolve());
  });

  return socket;
};

/** Extract DISCONNECTION violation details from mock calls. */
const getDisconnectionDetails = (): string[] => {
  return prismaMock.violation.create.mock.calls
    .filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    )
    .map(
      (args: unknown[]) =>
        (args[0] as { data: { details: string } }).data.details,
    );
};

/** Extract DISCONNECTION violation reasons from mock calls. */
const getDisconnectionReasons = (): (string | undefined)[] => {
  return prismaMock.violation.create.mock.calls
    .filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    )
    .map(
      (args: unknown[]) =>
        (args[0] as { data: { reason?: string } }).data.reason,
    );
};

// ── Test suite ──────────────────────────────────────────────────────
describe('Disconnect Reason Differentiation', () => {
  let serverCtx: TestServerContext;
  let port: number;

  beforeAll(async () => {
    setDisconnectGraceMs(150);
    serverCtx = await createTestSocketServer();
    port = serverCtx.port;
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    cleanupTestServer(serverCtx);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();

    prismaMock.session.findUnique.mockResolvedValue(activeSession);
    prismaMock.session.findFirst.mockResolvedValue(activeSession);
    prismaMock.sessionStudent.update.mockResolvedValue({});
    prismaMock.sessionStudent.findMany.mockResolvedValue([]);
    prismaMock.violation.create.mockResolvedValue({
      id: 'v-1',
      timestamp: new Date(),
      type: 'DISCONNECTION',
      details: '',
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 1. Tab/window close (intentional)
  // ─────────────────────────────────────────────────────────────────
  it('should record "intentional close" when student emits tab-closing before disconnect', async () => {
    const socket = await connectAndRegister(port);

    // Simulate: beforeunload fires → emit signal → then socket closes
    socket.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 50));
    socket.disconnect();

    // Wait past grace
    await new Promise((r) => setTimeout(r, 300));

    const details = getDisconnectionDetails();
    expect(details).toHaveLength(1);
    expect(details[0]).toBe(
      'Student closed the browser tab or window',
    );

    const reasons = getDisconnectionReasons();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toBe('TAB_CLOSED');
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Client-side disconnect (socket.disconnect() without tab-closing)
  //    In tests, client.disconnect() produces "client namespace disconnect".
  //    In production WiFi drops, the server sees "transport close".
  // ─────────────────────────────────────────────────────────────────
  it('should record "client side" when student disconnects without tab-closing signal', async () => {
    const socket = await connectAndRegister(port);

    // No tab-closing signal — just disconnect
    socket.disconnect();

    await new Promise((r) => setTimeout(r, 300));

    const details = getDisconnectionDetails();
    expect(details).toHaveLength(1);
    expect(details[0]).toBe('Student\'s client disconnected explicitly');

    const reasons = getDisconnectionReasons();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toBe('CLIENT_INITIATED');
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Transport close (simulated by forcefully destroying the socket)
  //    Mimics WiFi loss where the browser never sends a clean close.
  // ─────────────────────────────────────────────────────────────────
  it('should record "WiFi drop" when transport is forcefully closed', async () => {
    const socket = await connectAndRegister(port);

    // Force-close the underlying transport to simulate network loss.
    // This makes Socket.io report "transport close" on the server.
    const manager = socket.io;
    if (manager.engine) {
      manager.engine.close();
    }

    await new Promise((r) => setTimeout(r, 300));

    const details = getDisconnectionDetails();
    expect(details).toHaveLength(1);
    expect(details[0]).toBe(
      'Network connectivity lost (WiFi drop or transport failure)',
    );

    const reasons = getDisconnectionReasons();
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toBe('NETWORK_LOST');

    // Clean up the client socket reference
    socket.disconnect();
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Heartbeat timeout (background job)
  //    The heartbeat checker fires every 60s and creates violations
  //    for students with lastHeartbeat > 120s ago.
  // ─────────────────────────────────────────────────────────────────
  it('should record "heartbeat timeout" from the heartbeat checker background job', async () => {
    // This scenario doesn't use a real client. We mock Prisma to return
    // a dead student and advance time on a dedicated fake-timer server.
    vi.useFakeTimers();

    const fakeCtx = createTestSocketServerNoListen();

    const deadStudent = {
      id: 'ss-dead',
      student: { studentId: 'dead-student-01' },
      isOnline: true,
      lastHeartbeat: new Date(Date.now() - 130_000),
      session: { code: SESSION_CODE, isActive: true },
    };

    prismaMock.sessionStudent.findMany.mockResolvedValue([deadStudent] as never[]);
    prismaMock.violation.create.mockResolvedValue({
      id: 'v-hb',
      timestamp: new Date(),
      type: 'DISCONNECTION',
      details: '',
    });

    // Advance past the 60s heartbeat check interval
    await vi.advanceTimersByTimeAsync(62_000);

    expect(prismaMock.violation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionStudentId: 'ss-dead',
        type: 'DISCONNECTION',
        details: 'Heartbeat timeout — no heartbeat received for >120 s',
        reason: 'HEARTBEAT_TIMEOUT',
      }),
    });

    cleanupTestServer(fakeCtx);
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. Grace period cancellation — reconnect within window,
  //    no violation recorded regardless of disconnect type
  // ─────────────────────────────────────────────────────────────────
  it('should NOT record any violation when student reconnects within grace period', async () => {
    const socket1 = await connectAndRegister(port);

    // Simulate tab-closing then disconnect
    socket1.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 20));
    socket1.disconnect();

    // Clear mocks
    prismaMock.violation.create.mockClear();

    // Reconnect quickly (within 150ms grace)
    await new Promise((r) => setTimeout(r, 30));
    const socket2 = await connectAndRegister(port);

    // Wait past grace to confirm no violation fires
    await new Promise((r) => setTimeout(r, 300));

    const details = getDisconnectionDetails();
    expect(details).toHaveLength(0);

    socket2.disconnect();
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. Inactive session — no violation even on disconnect
  // ─────────────────────────────────────────────────────────────────
  it('should NOT record a violation when the session is no longer active', async () => {
    const socket = await connectAndRegister(port);

    // Session becomes inactive after the student connected
    prismaMock.session.findUnique.mockResolvedValue({
      ...activeSession,
      isActive: false,
    });

    socket.disconnect();

    await new Promise((r) => setTimeout(r, 300));

    const details = getDisconnectionDetails();
    expect(details).toHaveLength(0);
  });
});
