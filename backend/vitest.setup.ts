import { config } from 'dotenv';

// Load .env file or manually set vars
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/secure_exam?schema=public';
process.env.NODE_ENV = 'test';
