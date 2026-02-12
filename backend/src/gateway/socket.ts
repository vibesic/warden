import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { createSession, endSession, getActiveSession, getSessionHistory, validateSession, getSessionByCode } from '../services/session.service';

// Validation Schemas
const RegisterSchema = z.object({
  studentId: z.string().min(1),
  name: z.string().min(1),
  sessionCode: z.string().length(6)
});

const HeartbeatSchema = z.object({
  // studentId is optional in payload since we use socket.data, 
  // but client might still send it. We'll ignore payload studentId for auth.
  studentId: z.string().optional(),
});

const ViolationSchema = z.object({
  type: z.string(),
  details: z.string().optional(),
});

export const initializeSocket = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // --- Student Events ---

    socket.on('register', async (data: unknown) => {
      try {
        const result = RegisterSchema.safeParse(data);
        if (!result.success) {
          console.error('Invalid register data:', result.error);
          socket.emit('registration_error', 'Invalid data format');
          return;
        }
        const { studentId, name, sessionCode } = result.data;

        // 1. Validate Session
        const sessionCheck = await validateSession(sessionCode);
        if (!sessionCheck.valid || !sessionCheck.session) {
          socket.emit('registration_error', sessionCheck.reason);
          return;
        }

        const sessionId = sessionCheck.session.id;

        // 2. Create or update student
        // Use composite unique ID for upsert: studentId + sessionId
        const student = await prisma.student.upsert({
          where: {
            studentId_sessionId: {
              studentId,
              sessionId
            }
          },
          update: {
            isOnline: true,
            lastHeartbeat: new Date(),
            ipAddress: socket.handshake.address
          },
          create: {
            studentId,
            sessionId,
            name,
            isOnline: true,
            lastHeartbeat: new Date(),
            ipAddress: socket.handshake.address
          },
        });

        // Store IDs in socket for disconnect handling
        socket.data.studentUuid = student.id;
        socket.data.studentId = studentId; // Text ID
        socket.data.sessionCode = sessionCode;

        // Join Session Room
        socket.join(`session:${sessionCode}`);

        console.log(`Student registered: ${name} (${studentId}) in session ${sessionCode}`);

        // Notify dashboard (in that session room only)
        io.to(`session:${sessionCode}`).emit('dashboard:update', {
          type: 'STUDENT_JOINED',
          studentId,
          name,
          isOnline: true
        });

        // Acknowledge registration to client
        socket.emit('registered', { studentId });

      } catch (error) {
        console.error('Registration error:', error);
        socket.emit('registration_error', 'Internal server error');
      }
    });

    socket.on('heartbeat', async () => {
      // We trust socket.data more than payload
      try {
        const studentUuid = socket.data.studentUuid;
        if (!studentUuid) return;

        await prisma.student.update({
          where: { id: studentUuid },
          data: {
            lastHeartbeat: new Date(),
            isOnline: true
          },
        });
      } catch (error) {
        // Handle error (e.g. student not found)
      }
    });

    socket.on('report_violation', async (data: unknown) => {
      try {
        const studentUuid = socket.data.studentUuid;
        const sessionCode = socket.data.sessionCode;
        const studentTxId = socket.data.studentId;

        if (!studentUuid || !sessionCode) {
          console.warn(`Violation reported but socket not fully registered. Uuid: ${studentUuid}, Session: ${sessionCode}, TxId: ${studentTxId}`);
          return;
        }

        const result = ViolationSchema.safeParse(data);
        if (!result.success) {
          console.warn('Invalid violation data:', result.error);
          return;
        }
        const { type, details } = result.data;

        console.warn(`VIOLATION DETECTED: ${studentTxId} - ${type}`);

        const violation = await prisma.violation.create({
          data: {
            studentId: studentUuid, // UUID relation
            type,
            details,
          },
        });

        io.to(`session:${sessionCode}`).emit('dashboard:alert', {
          studentId: studentTxId, // Dashboard uses Text ID for mapping
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString()
          }
        });
      } catch (error) {
        console.error('Violation report error:', error);
      }
    });

    // --- Teacher/Dashboard Events ---

    socket.on('dashboard:join_overview', async () => {
      try {
        const history = await getSessionHistory();
        const active = await getActiveSession();
        socket.emit('dashboard:overview', {
          history: history.map(h => ({
            ...h,
            createdAt: h.createdAt.toISOString(),
            endedAt: h.endedAt?.toISOString(),
            studentCount: h._count.students
          })),
          activeSession: active ? { ...active, createdAt: active.createdAt.toISOString() } : null
        });
      } catch (e) { console.error(e); }
    });

    socket.on('dashboard:join_session', async (data: { sessionCode: string }) => {
      try {
        if (!data || !data.sessionCode) return;
        const { sessionCode } = data;

        const session = await getSessionByCode(sessionCode);
        if (!session) {
          socket.emit('dashboard:error', { message: 'Session not found' });
          return;
        }

        socket.join(`session:${sessionCode}`);

        // Fetch students for this session
        const students = await prisma.student.findMany({
          where: { sessionId: session.id },
          include: {
            violations: {
              orderBy: { timestamp: 'desc' }
            }
          }
        });

        socket.emit('dashboard:session_state', {
          session: {
            ...session,
            createdAt: session.createdAt.toISOString(),
            endedAt: session.endedAt?.toISOString()
          },
          students: students.map((s) => ({
            studentId: s.studentId, // Text ID
            name: s.name,
            isOnline: s.isOnline,
            joinedAt: s.createdAt.toISOString(),
            lastSeenAt: s.lastHeartbeat?.toISOString(),
            violations: s.violations.map((v) => ({
              type: v.type,
              details: v.details,
              timestamp: v.timestamp.toISOString()
            }))
          }))
        });

      } catch (e) {
        console.error('Error joining session dashboard:', e);
      }
    });

    socket.on('teacher:create_session', async () => {
      try {
        const session = await createSession();
        io.emit('dashboard:session_created', {
          ...session,
          createdAt: session.createdAt.toISOString()
        });
      } catch (error) {
        console.error('Error creating session:', error);
      }
    });

    socket.on('teacher:end_session', async () => {
      try {
        const active = await getActiveSession();
        if (!active) return;

        const session = await endSession();
        if (session) {
          io.to(`session:${session.code}`).emit('session:ended', {
            message: 'The exam session has been ended by the teacher.'
          });
          io.emit('dashboard:session_ended', {
            ...session,
            createdAt: session.createdAt.toISOString(),
            endedAt: session.endedAt?.toISOString()
          });
        }
      } catch (error) {
        console.error('Error ending session:', error);
      }
    });

    // --- Disconnect ---

    socket.on('disconnect', async () => {
      const studentUuid = socket.data.studentUuid;
      const sessionCode = socket.data.sessionCode;
      const studentTxId = socket.data.studentId;

      if (studentUuid && sessionCode) {
        console.log(`Socket disconnected: ${studentTxId}`);
        await prisma.student.update({
          where: { id: studentUuid },
          data: { isOnline: false }
        });

        io.to(`session:${sessionCode}`).emit('dashboard:update', {
          type: 'STUDENT_LEFT',
          studentId: studentTxId
        });
      }
    });
  });

  // Background check for dead heartbeats
  setInterval(async () => {
    const timeoutThreshold = new Date(Date.now() - 45 * 1000);

    // Find students who are "online" but haven't sent heartbeat
    const deadSessions = await prisma.student.findMany({
      where: {
        isOnline: true,
        lastHeartbeat: {
          lt: timeoutThreshold,
        },
      },
      include: { session: true }
    });

    for (const student of deadSessions) {
      console.log(`Heartbeat missed: ${student.studentId}`);

      // 1. Mark offline
      await prisma.student.update({
        where: { id: student.id },
        data: { isOnline: false },
      });

      // 2. Create violation
      const violation = await prisma.violation.create({
        data: {
          studentId: student.id, // UUID
          type: 'DISCONNECTION',
          details: 'Heartbeat timeout > 45s',
        },
      });

      // 3. Notify dashboard
      if (student.session) {
        io.to(`session:${student.session.code}`).emit('dashboard:update', {
          type: 'STUDENT_LEFT',
          studentId: student.studentId
        });

        io.to(`session:${student.session.code}`).emit('dashboard:alert', {
          studentId: student.studentId,
          violation: {
            ...violation,
            timestamp: violation.timestamp.toISOString()
          }
        });
      }
    }
  }, 30000); // 30s check
};
