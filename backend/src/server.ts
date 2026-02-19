import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import { initializeSocket } from './gateway/socket';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
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

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server running');
});
