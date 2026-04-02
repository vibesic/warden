import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import { Server } from 'socket.io';
import { app } from './app';
import { corsOriginCallback } from './utils/config';
import { initializeSocket } from './gateway/socket';
import { logger } from './utils/logger';
import { prisma } from './utils/prisma';

const BASE_PORT = Number(process.env.PORT) || 3333;
const MAX_PORT_ATTEMPTS = 10;

const httpServer = createServer(app);

// Socket.io attaches many listeners; raise the limit to avoid spurious warnings
httpServer.setMaxListeners(25);

let clearIntervals: (() => void) | undefined;

// Graceful shutdown logic
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  process.stdout.write(`Received ${signal}. Shutting down gracefully...\n`);

  if (clearIntervals) clearIntervals();
  logger.info('Background socket intervals swept.');

  httpServer.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Prisma disconnected.');
    process.exit(0);
  });

  // Force shutdown after 10s if connections hang
  setTimeout(() => {
    process.stderr.write('Force shutting down after 10s timeout\n');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catch any uncaught errors and write to stderr for diagnostics.
process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack ?? ''}\n`);
  if (clearIntervals) clearIntervals();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`UNHANDLED REJECTION: ${msg}\n`);
  if (clearIntervals) clearIntervals();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(1);
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginCallback,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Use generous timeouts for LAN/WiFi environments where packet loss
  // and congestion can delay ping-pong frames.  The defaults (25 s / 20 s)
  // are too aggressive for busy classroom networks and cause Socket.io to
  // declare students disconnected during transient WiFi hiccups.
  pingInterval: 25_000,
  pingTimeout: 60_000,
  maxHttpBufferSize: 1e5, // 100 KB limit for Socket payloads to prevent memory exhaustion
  transports: ['websocket'], // bypass long-polling to save HTTP connections for 100+ students
});

const initResult = initializeSocket(io);
clearIntervals = initResult.clearIntervals;

const HOST = process.env.HOST || '0.0.0.0';

/**
 * Probes whether a port/host combination is bindable by briefly opening
 * and closing a disposable net.Server.  This avoids corrupting the real
 * httpServer's internal state when a port is unavailable.
 */
const probePort = (port: number, host: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const tester = createNetServer();
    tester.once('error', () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, host, () => {
      tester.close(() => resolve(true));
    });
  });
};

/**
 * Finds a working port/host combination by probing with disposable sockets.
 * For each port, tries the configured HOST first (usually 0.0.0.0 for
 * network access), then falls back to 127.0.0.1 if that host gets EACCES.
 */
const findWorkingBinding = async (): Promise<{ port: number; host: string }> => {
  const hosts = HOST === '127.0.0.1' ? ['127.0.0.1'] : [HOST, '127.0.0.1'];

  for (let port = BASE_PORT; port < BASE_PORT + MAX_PORT_ATTEMPTS; port++) {
    for (const host of hosts) {
      const ok = await probePort(port, host);
      if (ok) {
        return { port, host };
      }
    }
  }

  throw new Error(
    `No available port/host found (tried ports ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1} on hosts: ${hosts.join(', ')})`
  );
};

/**
 * Start the server on a verified available port/host combination.
 * httpServer.listen() is called exactly once to prevent EventEmitter
 * listener accumulation and server-state corruption from repeated calls.
 */
const startServer = async (): Promise<void> => {
  try {
    const { port, host } = await findWorkingBinding();

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      const msg = `Server error on ${host}:${port}: ${err.message}`;
      logger.error({ err, port, host }, msg);
      process.stderr.write(`FATAL: ${msg}\n`);
      process.exit(1);
    });

    httpServer.listen(port, host, () => {
      logger.info({ port, host }, 'Server running');
      process.stdout.write(`Server running on ${host}:${port}\n`);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, `Server failed to start: ${msg}`);
    process.stderr.write(`FATAL: Server failed to start: ${msg}\n`);
    process.exit(1);
  }
};

startServer();
