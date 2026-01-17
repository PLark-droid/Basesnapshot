/**
 * Express Server Entry Point
 *
 * @description Backend API server for LarkBaseSnapshot
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { snapshotRouter } from './routes/snapshot.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/snapshot', snapshotRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /api/health          - Health check');
  console.log('  GET  /api/auth/login      - Start OAuth login');
  console.log('  GET  /api/auth/callback   - OAuth callback');
  console.log('  GET  /api/auth/status     - Check auth status');
  console.log('  POST /api/auth/logout     - Logout');
  console.log('  POST /api/snapshot        - Create snapshot');
});

export default app;
