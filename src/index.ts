import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pool from './db';
import logger from './logger';
import { authMiddleware } from './middleware/auth';
import documentRoutes from './routes/documents';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Request logging — logs every incoming request
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Health check (no auth needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// All /documents routes require authentication
app.use('/documents', authMiddleware, documentRoutes);

async function start() {
  // Read and run the SQL init script
  const sqlPath = path.join(__dirname, '..', 'sql', 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  await pool.query(sql);
  logger.info('Database initialized');

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: (err as Error).message });
  process.exit(1);
});

export default app;
