import Client, { Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { generateTeacherToken } from '@src/services/auth.service';
import { setDisconnectGraceMs, clearAllPendingDisconnects } from '@src/gateway/studentHandlers';
import { clearDisconnectionCooldowns } from '@src/gateway/helpers';
import { createTestSocketServer, cleanupTestServer, type TestServerContext } from '../../helpers/setup';
import { mockStudentRegistration, type PrismaMock } from '../../helpers/prisma';
import { registerStudent } from '../../helpers/socketClient';

// Mock Prisma
// We must mock '../utils/prisma' BEFORE importing the module that uses it
// Since socket.ts imports it at top level.
const prismaMock = vi.hoisted(() => ({
  student: {
    upsert: vi.fn(),
  },
  sessionStudent: {
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  violation: {
    create: vi.fn().mockResolvedValue({ id: 'v-default', timestamp: new Date(), type: 'DISCONNECTION', details: '' }),
    findFirst: vi.fn(),
  },
  session: {
    findUnique: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findFirst: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }),
    findMany: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 's2', code: '654321', isActive: true, createdAt: new Date() }),
    update: vi.fn().mockResolvedValue({ id: 's1', code: '123456', isActive: false, createdAt: new Date(), endedAt: new Date() }),
    updateMany: vi.fn(),
    count: vi.fn()
  }
})) as unknown as PrismaMock;

vi.mock('@src/utils/prisma', () => ({
  prisma: prismaMock,
}));

describe('Socket Gateway', () => {

  let io: InstanceType<typeof import('socket.io').Server>;
  let clientSocket: ClientSocket;
  let serverCtx: TestServerContext;
  let port: number;

  beforeAll(async () => {
    setDisconnectGraceMs(100);
    serverCtx = await createTestSocketServer();
    io = serverCtx.io;
    port = serverCtx.port;
  });

  afterAll(() => {
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    cleanupTestServer(serverCtx);
  });

  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Setup new client for each test
    clientSocket = Client(`http://localhost:${port}`);
    return new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
  });

  afterEach(() => {
    clearAllPendingDisconnects();
    clearDisconnectionCooldowns();
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('should register a new student and emit registered event', async () => {
    const studentData = { studentId: 'test_student_1', name: 'Test Student', sessionCode: '123456' };

    mockStudentRegistration(prismaMock, 'test_student_1', 'Test Student', 'stu-1', 'ss-1');

    return new Promise<void>((resolve, reject) => {
      clientSocket.emit('register', studentData);

      clientSocket.on('registered', (data) => {
        try {
          expect(data).toMatchObject({ studentId: studentData.studentId });
          expect(prismaMock.student.upsert).toHaveBeenCalled();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should process heartbeat', async () => {
    const heartbeatData = { studentId: 'test_student_2' };
    const registerData = { studentId: 'test_student_2', name: 'Test', sessionCode: '123456' };

    mockStudentRegistration(prismaMock, 'test_student_2', 'Test', 'stu-2', 'ss-2');
    prismaMock.sessionStudent.update.mockResolvedValue({} as any);

    await registerStudent(clientSocket, registerData);

    clientSocket.emit('heartbeat', heartbeatData);

    // Wait for async processing
    await new Promise(r => setTimeout(r, 200));

    // The disconnect handler from previous tests might interfere if we don't look specifically
    // We expect at least one call with isOnline: true AND matching the UUID from upsert return
    const calls = prismaMock.sessionStudent.update.mock.calls;
    // Note: socket.data.sessionStudentId will be 'ss-2' from the sessionStudent upsert mock return above
    const heartbeatCall = calls.find(args => args[0].where.id === 'ss-2' && args[0].data.isOnline === true);
    expect(heartbeatCall).toBeDefined();
  });

  it('should report violation', async () => {
    const registerData = { studentId: 'test_student_3', name: 'Violator', sessionCode: '123456' };
    const violationData = {
      type: 'INTERNET_ACCESS',
      details: 'Google detected'
    };

    mockStudentRegistration(prismaMock, 'test_student_3', 'Violator', 'stu-3', 'ss-3');
    prismaMock.violation.create.mockResolvedValue({ timestamp: new Date() } as any);

    await registerStudent(clientSocket, registerData);

    return new Promise<void>((resolve) => {
      clientSocket.emit('report_violation', violationData);

      setTimeout(() => {
        // Find the call for this specific session student
        const calls = prismaMock.violation.create.mock.calls;
        const callArgs = calls.find(c => c[0].data.sessionStudentId === 'ss-3');

        expect(callArgs).toBeDefined();
        expect(callArgs![0].data).toMatchObject({
          sessionStudentId: 'ss-3',
          type: violationData.type,
          details: violationData.details,
        });
        resolve();
      }, 50);
    });
  });

  it('should ignore invalid register data', async () => {
    const invalidData = { studentId: '' }; // Missing name
    prismaMock.student.upsert.mockResolvedValue({} as any);

    return new Promise<void>((resolve) => {
      clientSocket.emit('register', invalidData);

      setTimeout(() => {
        expect(prismaMock.student.upsert).not.toHaveBeenCalled();
        resolve();
      }, 50);
    });
  });



  it('should return dashboard overview', async () => {
    // Mock prisma.session.findMany
    const historyMock = [
      { id: 'h1', code: '111111', createdAt: new Date(), endedAt: null, isActive: false, _count: { sessionStudents: 5 } }
    ];
    prismaMock.session.findMany.mockResolvedValue(historyMock);

    // Create teacher client with valid token
    const token = generateTeacherToken();
    const teacherSocket = Client(`http://localhost:${port}`, {
      auth: { token },
    });
    await new Promise<void>((resolve) => teacherSocket.on('connect', resolve));

    await new Promise<void>((resolve, reject) => {
      teacherSocket.on('dashboard:overview', (data: any) => {
        try {
          expect(data.history).toHaveLength(1);
          expect(data.history[0].code).toBe('111111');
          expect(data.history[0].studentCount).toBe(5);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      teacherSocket.emit('dashboard:join_overview');
    });

    teacherSocket.close();
  });

  it('should silently ignore dashboard:join_overview on unauthenticated sockets (#16 connection-level auth)', async () => {
    // Without the teacher token, teacher handlers are not registered at all
    const unauthSocket = Client(`http://localhost:${port}`);
    await new Promise<void>((resolve) => unauthSocket.on('connect', resolve));

    const errorSpy = vi.fn();
    const overviewSpy = vi.fn();
    unauthSocket.on('dashboard:error', errorSpy);
    unauthSocket.on('dashboard:overview', overviewSpy);

    unauthSocket.emit('dashboard:join_overview');

    await new Promise(r => setTimeout(r, 200));

    // No handler means no response at all
    expect(errorSpy).not.toHaveBeenCalled();
    expect(overviewSpy).not.toHaveBeenCalled();

    unauthSocket.close();
  });

  it('should create new session when teacher requests', async () => {
    // Override the mock to return null so createSession loop terminates (no collision)
    prismaMock.session.findUnique.mockResolvedValueOnce(null);

    // Create teacher client with auth
    const token = generateTeacherToken();
    const teacherSocket = Client(`http://localhost:${port}`, {
      auth: { token },
    });
    await new Promise<void>((resolve) => teacherSocket.on('connect', resolve));

    await new Promise<void>((resolve) => {
      teacherSocket.on('dashboard:session_created', (data) => {
        expect(data).toHaveProperty('code');
        resolve();
      });
      teacherSocket.emit('teacher:create_session', { durationMinutes: 60 });
    });

    teacherSocket.close();
  });

  it('should silently ignore teacher:create_session on unauthenticated sockets (#16)', async () => {
    const unauthSocket = Client(`http://localhost:${port}`);
    await new Promise<void>((resolve) => unauthSocket.on('connect', resolve));

    const errorSpy = vi.fn();
    const sessionCreatedSpy = vi.fn();
    unauthSocket.on('dashboard:error', errorSpy);
    unauthSocket.on('dashboard:session_created', sessionCreatedSpy);

    unauthSocket.emit('teacher:create_session');

    await new Promise(r => setTimeout(r, 200));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(sessionCreatedSpy).not.toHaveBeenCalled();

    unauthSocket.close();
  });

  it('should end session when teacher requests', async () => {
    const token = generateTeacherToken();
    const teacherSocket = Client(`http://localhost:${port}`, {
      auth: { token },
    });
    await new Promise<void>((resolve) => teacherSocket.on('connect', resolve));

    await new Promise<void>((resolve) => {
      teacherSocket.on('dashboard:session_ended', () => {
        resolve();
      });
      teacherSocket.emit('teacher:end_session');
    });

    teacherSocket.close();
  });

  it('should silently ignore teacher:end_session on unauthenticated sockets (#16)', async () => {
    const unauthSocket = Client(`http://localhost:${port}`);
    await new Promise<void>((resolve) => unauthSocket.on('connect', resolve));

    const errorSpy = vi.fn();
    const sessionEndedSpy = vi.fn();
    unauthSocket.on('dashboard:error', errorSpy);
    unauthSocket.on('dashboard:session_ended', sessionEndedSpy);

    unauthSocket.emit('teacher:end_session');

    await new Promise(r => setTimeout(r, 200));

    expect(errorSpy).not.toHaveBeenCalled();
    expect(sessionEndedSpy).not.toHaveBeenCalled();

    unauthSocket.close();
  });

  it('should return registration error if session invalid', async () => {
    // Mock validation failure - force return null for this specific call
    // The current mock implementation returns valid session by default (see top of file)
    const sessionMock = prismaMock.session.findUnique;
    sessionMock.mockResolvedValueOnce(null);

    return new Promise<void>((resolve) => {
      clientSocket.once('registration_error', (msg) => {
        expect(msg).toBe('Invalid session code');
        resolve();
      });
      clientSocket.emit('register', { studentId: 'invalid', name: 'Invalid', sessionCode: '999999' });
    });
  });

  it('should process sniffer:response and create violation when reachable is true', async () => {
    const registerData = { studentId: 'sniffer_student', name: 'Sniffer Test', sessionCode: '123456' };
    mockStudentRegistration(prismaMock, 'sniffer_student', 'Sniffer Test', 'stu-sniffer', 'ss-sniffer');
    prismaMock.violation.create.mockResolvedValue({ timestamp: new Date(), type: 'INTERNET_ACCESS' } as any);

    // Register the student
    await registerStudent(clientSocket, registerData);

    // Manually set the pending challenge on the server socket
    // We do this by emitting a sniffer:response that matches what we'll set
    const sockets = await io.fetchSockets();
    const targetSocket = sockets.find(s => s.data.sessionStudentId === 'ss-sniffer');
    expect(targetSocket).toBeDefined();

    const challengeId = 'test-challenge-123';
    targetSocket!.data.pendingChallenge = {
      challengeId,
      targetUrl: 'https://www.google.com',
      issuedAt: Date.now(),
    };

    // Student responds that the target is reachable (violation)
    clientSocket.emit('sniffer:response', { challengeId, reachable: true });

    await new Promise(r => setTimeout(r, 100));

    expect(prismaMock.violation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionStudentId: 'ss-sniffer',
        type: 'INTERNET_ACCESS',
      })
    });
  });

  it('should NOT create violation when sniffer:response reachable is false', async () => {
    const registerData = { studentId: 'sniffer_safe', name: 'Safe Student', sessionCode: '123456' };
    mockStudentRegistration(prismaMock, 'sniffer_safe', 'Safe Student', 'stu-safe', 'ss-safe');

    await registerStudent(clientSocket, registerData);

    const sockets = await io.fetchSockets();
    const targetSocket = sockets.find(s => s.data.sessionStudentId === 'ss-safe');
    expect(targetSocket).toBeDefined();

    const challengeId = 'test-challenge-safe';
    targetSocket!.data.pendingChallenge = {
      challengeId,
      targetUrl: 'https://www.google.com',
      issuedAt: Date.now(),
    };

    clientSocket.emit('sniffer:response', { challengeId, reachable: false });

    await new Promise(r => setTimeout(r, 100));

    // Should not create an INTERNET_ACCESS violation (disconnect violations are expected)
    const internetViolationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: any[]) => args[0]?.data?.type === 'INTERNET_ACCESS'
    );
    expect(internetViolationCalls).toHaveLength(0);
  });

  it('should create DISCONNECTION violation when student disconnects', async () => {
    const registerData = { studentId: 'disconnect_student', name: 'Disconnect Test', sessionCode: '123456' };
    mockStudentRegistration(prismaMock, 'disconnect_student', 'Disconnect Test', 'stu-disconnect', 'ss-disconnect');
    prismaMock.sessionStudent.update.mockResolvedValue({} as any);
    prismaMock.violation.create.mockResolvedValue({
      timestamp: new Date(),
      type: 'DISCONNECTION',
      details: 'Student disconnected from server (closed tab or lost connection)',
      sessionStudentId: 'ss-disconnect',
    } as any);

    // Register the student first
    await registerStudent(clientSocket, registerData);

    // Disconnect the student (simulates closing tab)
    clientSocket.disconnect();

    // Wait for async processing of the disconnect event
    await new Promise(r => setTimeout(r, 300));

    // Verify session student marked offline
    const offlineCalls = prismaMock.sessionStudent.update.mock.calls.filter(
      (args: any[]) => args[0]?.where?.id === 'ss-disconnect' && args[0]?.data?.isOnline === false
    );
    expect(offlineCalls.length).toBeGreaterThanOrEqual(1);

    // Verify DISCONNECTION violation was created
    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: any[]) => args[0]?.data?.sessionStudentId === 'ss-disconnect' && args[0]?.data?.type === 'DISCONNECTION'
    );
    expect(violationCalls.length).toBe(1);
    expect(violationCalls[0][0].data.details).toContain('disconnected');
  });

  it('should NOT create DISCONNECTION violation when student reconnects within grace period', async () => {
    const registerData = { studentId: 'refresh_student', name: 'Refresh Test', sessionCode: '123456' };
    mockStudentRegistration(prismaMock, 'refresh_student', 'Refresh Test', 'stu-refresh', 'ss-refresh');
    prismaMock.sessionStudent.update.mockResolvedValue({} as any);

    // Register the student
    await new Promise<void>(resolve => {
      clientSocket.emit('register', registerData);
      clientSocket.once('registered', () => resolve());
    });

    // Disconnect (simulates page refresh — old socket closes)
    clientSocket.disconnect();

    // Wait just a bit for the disconnect handler
    await new Promise(r => setTimeout(r, 30));

    // Clear mocks so we only see post-reconnect calls
    prismaMock.violation.create.mockClear();

    // Reconnect quickly (simulates page reload — new socket connects)
    const reconnectedSocket = Client(`http://localhost:${port}`);
    await new Promise<void>(r => reconnectedSocket.on('connect', r));

    mockStudentRegistration(prismaMock, 'refresh_student', 'Refresh Test', 'stu-refresh', 'ss-refresh');

    await registerStudent(reconnectedSocket, registerData);

    // Wait beyond the grace period to confirm no violation fires
    await new Promise(r => setTimeout(r, 200));

    // No DISCONNECTION violation should have been created
    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: any[]) => args[0]?.data?.type === 'DISCONNECTION'
    );
    expect(violationCalls).toHaveLength(0);

    reconnectedSocket.disconnect();
  });

  it('should NOT create violation when student reconnects during async grace processing (#18 race fix)', async () => {
    // First findFirst call (in disconnect handler) resolves immediately
    // Second findFirst call (in timer callback) takes 500ms to simulate slow DB
    prismaMock.session.findFirst
      .mockResolvedValueOnce({ id: 's1', code: '123456', isActive: true, createdAt: new Date() })
      .mockImplementationOnce(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({ id: 's1', code: '123456', isActive: true, createdAt: new Date() }), 500)
        )
      );

    const registerData = { studentId: 'race_student', name: 'Race Test', sessionCode: '123456' };
    mockStudentRegistration(prismaMock, 'race_student', 'Race Test', 'stu-race', 'ss-race');
    prismaMock.sessionStudent.update.mockResolvedValue({} as any);

    // Register student
    await registerStudent(clientSocket, registerData);

    // Disconnect - starts grace timer (100ms)
    clientSocket.disconnect();

    // Wait 150ms — timer has fired (100ms), started async DB call (500ms delay)
    await new Promise(r => setTimeout(r, 150));

    // Clear violation mock to only track post-reconnect violations
    prismaMock.violation.create.mockClear();

    // Reconnect while timer callback is in the middle of async work
    const reconnectSocket = Client(`http://localhost:${port}`);
    await new Promise<void>(r => reconnectSocket.on('connect', r));

    mockStudentRegistration(prismaMock, 'race_student', 'Race Test', 'stu-race', 'ss-race');

    await registerStudent(reconnectSocket, registerData);

    // Wait for the slow DB call to resolve and the timer callback to complete
    await new Promise(r => setTimeout(r, 600));

    // No DISCONNECTION violation should have been created — cancelled flag prevented it
    const violationCalls = prismaMock.violation.create.mock.calls.filter(
      (args: any[]) => args[0]?.data?.type === 'DISCONNECTION'
    );
    expect(violationCalls).toHaveLength(0);

    reconnectSocket.disconnect();
  });
});
