import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pool from './db';
import { authMiddleware } from './middleware/auth';
import documentRoutes from './routes/documents';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
  console.log('Database ready');

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

export default app;
