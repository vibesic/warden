import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { initializeSocket } from './gateway/socket';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3333;

const httpServer = createServer(app);

const isDesktopMode = process.env.ELECTRON === 'true' || process.env.NODE_ENV === 'production';

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isDesktopMode) {
        callback(null, true);
        return;
      }
      const envOrigins = process.env.CORS_ORIGINS;
      const allowedOrigins = envOrigins
        ? envOrigins.split(',').map(o => o.trim())
        : ['http://localhost:5173', 'http://127.0.0.1:5173'];
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

initializeSocket(io);

const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(Number(PORT), HOST, () => {
  logger.info({ port: PORT, host: HOST }, 'Server running');
});
