import { config } from 'dotenv';

// Load .env file or manually set vars
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./data/test.db';
process.env.NODE_ENV = 'test';
