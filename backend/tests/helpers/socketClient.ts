/**
 * Socket client helpers for integration tests.
 *
 * Provides convenience wrappers around socket.io-client that handle
 * connection, authentication, and cleanup.
 */
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { generateTeacherToken } from '@src/services/auth.service';

/**
 * Connect a raw socket client (no auth) and wait for connection.
 */
export const connectClient = async (
  port: number,
  options: Partial<Parameters<typeof Client>[1]> = {},
): Promise<ClientSocket> => {
  const socket = Client(`http://localhost:${port}`, options);
  await new Promise<void>((resolve) => {
    socket.on('connect', () => resolve());
  });
  return socket;
};

/**
 * Connect a teacher socket with a valid auth token.
 */
export const connectTeacher = async (port: number): Promise<ClientSocket> => {
  const token = generateTeacherToken();
  const socket = Client(`http://localhost:${port}`, {
    auth: { token },
  });
  await new Promise<void>((resolve) => {
    socket.on('connect', () => resolve());
  });
  return socket;
};

/**
 * Register a student on an existing socket and wait for the registered event.
 */
export const registerStudent = (
  socket: ClientSocket,
  data: { studentId: string; name: string; sessionCode: string },
): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Registration timeout')),
      5000,
    );
    socket.emit('register', data);
    socket.once('registered', (payload: Record<string, unknown>) => {
      clearTimeout(timeout);
      resolve(payload);
    });
    socket.once('registration_error', (reason: string) => {
      clearTimeout(timeout);
      reject(new Error(`Registration failed: ${reason}`));
    });
  });
};

/**
 * Connect a teacher socket, join a session, and wait for the room join.
 */
export const connectTeacherToSession = async (
  port: number,
  sessionCode: string,
): Promise<ClientSocket> => {
  const socket = await connectTeacher(port);
  socket.emit('dashboard:join_session', { sessionCode });
  await new Promise((r) => setTimeout(r, 100));
  return socket;
};

/**
 * Disconnect a socket safely (no-op if already disconnected).
 */
export const safeDisconnect = (socket: ClientSocket): void => {
  if (socket.connected) {
    socket.disconnect();
  }
};
