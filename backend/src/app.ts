import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { validateSession } from './services/session.service';

const app = express();

app.use(helmet());
app.use(cors({
  origin: true, // Allow reflecting the request origin, or use specific list logic if preferred
  credentials: true,
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Session Validation Endpoint
app.get('/api/session/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await validateSession(code);
    res.json(result);
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false, reason: 'Internal Server Error' });
  }
});

export default app;
