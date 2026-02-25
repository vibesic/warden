/**
 * Shared test server setup and teardown utilities.
 *
 * Extracts the repeated Socket.io server bootstrap pattern
 * used across 10 integration/e2e test files.
 *
 * Usage:
 *   const ctx = await createTestSocketServer();
 *   // ... tests ...
 *   cleanupTestServer(ctx);
 */
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { AddressInfo } from 'net';
import { initializeSocket } from '@src/gateway/socket';

export interface TestServerContext {
  httpServer: HttpServer;
  io: Server;
  cleanup: { clearIntervals: () => void };
  port: number;
}

/**
 * Create and start a Socket.io test server on a random available port.
 */
export const createTestSocketServer = async (): Promise<TestServerContext> => {
  const httpServer = createServer();
  const io = new Server(httpServer);
  const cleanup = initializeSocket(io);

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, () => {
      resolve((httpServer.address() as AddressInfo).port);
    });
  });

  return { httpServer, io, cleanup, port };
};

/**
 * Create a Socket.io server WITHOUT binding to a port.
 * Used by tests that rely on fake timers (backgroundJobs, heartbeat).
 */
export const createTestSocketServerNoListen = (): Omit<TestServerContext, 'port'> => {
  const httpServer = createServer();
  const io = new Server(httpServer);
  const cleanup = initializeSocket(io);

  return { httpServer, io, cleanup };
};

/**
 * Tear down a test server context.
 */
export const cleanupTestServer = (ctx: Pick<TestServerContext, 'cleanup' | 'io' | 'httpServer'>): void => {
  ctx.cleanup.clearIntervals();
  ctx.io.close();
  ctx.httpServer.close();
};
