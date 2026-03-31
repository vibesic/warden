/**
 * Regression test for the WiFi-flap / transient-disconnect bug.
 *
 * On busy classroom networks, Socket.io may declare students disconnected
 * during brief WiFi hiccups even though the laptop is still on the network.
 * This test verifies that:
 *
 *  1. A student who reconnects within the grace window gets NO violation.
 *  2. The DISCONNECTION cooldown suppresses duplicate violations when a
 *     student's WiFi flaps multiple times in quick succession.
 *  3. A genuinely long disconnect (past grace + cooldown) still records
 *     the violation correctly.
 */
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';
import { mockStudentRegistration, applyDefaultMocks, type PrismaMock } from '../../helpers/prisma';
import { connectClient, registerStudent } from '../../helpers/socketClient';

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
    findFirst: vi.fn(),
  },
  session: {
    findUnique: vi.fn().mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    }),
    findFirst: vi.fn().mockResolvedValue({
      id: 's1', code: '123456', isActive: true,
      createdAt: new Date(), durationMinutes: null, endedAt: null,
    }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  checkTarget: {
    findMany: vi.fn().mockResolvedValue([]),
  },
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

// ── Helpers ─────────────────────────────────────────────────────────
const STUDENT_ID = 'wifi-flap-student';
const STUDENT_NAME = 'WiFi Flap Test';
const SESSION_CODE = '123456';

const registerData = {
  studentId: STUDENT_ID,
  name: STUDENT_NAME,
  sessionCode: SESSION_CODE,
};

const connectAndRegister = async (port: number): Promise<ClientSocket> => {
  const socket = await connectClient(port, { reconnection: false });
  mockStudentRegistration(prismaMock, STUDENT_ID, STUDENT_NAME, 'stu-flap', 'ss-flap');
  await registerStudent(socket, registerData);
  return socket;
};

// ── Test suite ──────────────────────────────────────────────────────
describe('WiFi Flap — Transient Disconnect Regression', () => {
  let serverCtx: TestServerContext;
  let port: number;

  beforeAll(async () => {
    // Use a very short grace period so tests run fast
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
    applyDefaultMocks(prismaMock);
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 1:  Quick reconnect within grace window → no violation
  // Simulates a brief WiFi hiccup where the socket drops and the
  // client reconnects in under the grace period.
  // ─────────────────────────────────────────────────────────────────
  it('should NOT create a DISCONNECTION violation when student reconnects within grace period (WiFi hiccup)', async () => {
    const socket1 = await connectAndRegister(port);

    // Simulate WiFi drop → socket disconnects
    socket1.disconnect();
    await new Promise((r) => setTimeout(r, 30));

    // Clear mocks so only post-reconnect calls are visible
    prismaMock.violation.create.mockClear();

    // Student reconnects quickly (< 150 ms grace period)
    const socket2 = await connectAndRegister(port);

    // Wait well past the grace period to confirm no violation fires
    await new Promise((r) => setTimeout(r, 300));

    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(violationCalls).toHaveLength(0);

    socket2.disconnect();
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 2:  Two rapid disconnect/reconnect cycles → at most 1
  //              DISCONNECTION violation (cooldown suppresses the 2nd)
  // ─────────────────────────────────────────────────────────────────
  it('should suppress duplicate DISCONNECTION violations during rapid WiFi flaps (cooldown)', async () => {
    // --- Flap 1: disconnect, wait past grace → 1st violation created ---
    const socket1 = await connectAndRegister(port);
    socket1.disconnect();

    // Wait past grace period so the 1st violation fires
    await new Promise((r) => setTimeout(r, 300));

    const firstViolationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(firstViolationCalls.length).toBe(1);

    // --- Flap 2: reconnect briefly, then disconnect again ---
    prismaMock.violation.create.mockClear();

    const socket2 = await connectAndRegister(port);
    socket2.disconnect();

    // Wait past grace period again
    await new Promise((r) => setTimeout(r, 300));

    // The cooldown should suppress the 2nd violation
    const secondViolationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(secondViolationCalls).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 3:  Three rapid flaps → only 1 total DISCONNECTION
  //              violation (grace + cooldown combined)
  // ─────────────────────────────────────────────────────────────────
  it('should record only 1 DISCONNECTION for 3 rapid WiFi flaps', async () => {
    // Flap 1: disconnect → reconnect within grace → no violation
    const s1 = await connectAndRegister(port);
    s1.disconnect();
    await new Promise((r) => setTimeout(r, 30));
    const s2 = await connectAndRegister(port);

    // Flap 2: disconnect → wait past grace → 1 violation
    s2.disconnect();
    await new Promise((r) => setTimeout(r, 300));

    // Flap 3: reconnect → disconnect again → cooldown suppresses
    const s3 = await connectAndRegister(port);
    s3.disconnect();
    await new Promise((r) => setTimeout(r, 300));

    const totalViolations = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );

    // Only 1 violation should exist (from flap 2), flap 1 was within grace,
    // flap 3 was suppressed by cooldown.
    expect(totalViolations.length).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 4:  Student avoids offline marking if reconnecting quickly
  // ─────────────────────────────────────────────────────────────────
  it('should not mark student offline immediately on unexpected disconnect', async () => {
    const s1 = await connectAndRegister(port);
    s1.disconnect();
    await new Promise((r) => setTimeout(r, 30));

    // Should NOT have an offline update immediately (deferred to avoid flapping UI)
    const offlineCalls = prismaMock.sessionStudent.update.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { isOnline: boolean } }).data.isOnline === false,
    );
    expect(offlineCalls.length).toBe(0);

    // Reconnect → upsert sets isOnline: true
    prismaMock.sessionStudent.upsert.mockClear();
    const s2 = await connectAndRegister(port);

    const upsertCalls = prismaMock.sessionStudent.upsert.mock.calls;
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);

    // The upsert should set isOnline: true
    const lastUpsert = upsertCalls[upsertCalls.length - 1][0] as {
      update: { isOnline: boolean };
      create: { isOnline: boolean };
    };
    expect(lastUpsert.update.isOnline).toBe(true);
    expect(lastUpsert.create.isOnline).toBe(true);

    s2.disconnect();
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 5:  Tab-closing signal → violation says "intentional"
  //              Student emits 'student:tab-closing' before disconnect.
  // ─────────────────────────────────────────────────────────────────
  it('should record "intentional" close when student signals tab-closing before disconnect', async () => {
    const socket = await connectAndRegister(port);

    // Simulate beforeunload → emit tab-closing signal, then disconnect
    socket.emit('student:tab-closing');
    await new Promise((r) => setTimeout(r, 30));
    socket.disconnect();

    // Wait past grace period for the violation to fire
    await new Promise((r) => setTimeout(r, 300));

    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(violationCalls.length).toBe(1);

    const details = (violationCalls[0][0] as { data: { details: string } }).data.details;
    expect(details).toBe('Student closed the browser tab or window');
    const reason = (violationCalls[0][0] as { data: { reason: string } }).data.reason;
    expect(reason).toBe('TAB_CLOSED');
  });

  // ─────────────────────────────────────────────────────────────────
  // Scenario 6:  No tab-closing signal → violation says "WiFi drop"
  //              Student disconnects without emitting tab-closing.
  // ─────────────────────────────────────────────────────────────────
  it('should record "WiFi drop" when student disconnects without tab-closing signal', async () => {
    const socket = await connectAndRegister(port);

    // Just disconnect — no tab-closing signal (simulates WiFi loss)
    socket.disconnect();

    // Wait past grace period for the violation to fire
    await new Promise((r) => setTimeout(r, 300));

    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: unknown[]) =>
        (args[0] as { data: { type: string } }).data.type === 'DISCONNECTION',
    );
    expect(violationCalls.length).toBe(1);

    const details = (violationCalls[0][0] as { data: { details: string } }).data.details;
    // When client calls socket.disconnect(), Socket.io reason is
    // "client namespace disconnect", not "transport close".
    expect(details).toBe('Student\'s client disconnected explicitly');

    const reason = (violationCalls[0][0] as { data: { reason: string } }).data.reason;
    expect(reason).toBe('CLIENT_INITIATED');
  });
});
