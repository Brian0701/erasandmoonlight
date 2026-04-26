// server.js — Eras & Moonlight Backend
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const authRoutes   = require('./src/routes/auth');
const orderRoutes  = require('./src/routes/orders');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3001;

// ── CORS ─────────────────────────────────────────────────────
// Allows the HTML file to call the API from any origin
// (file://, localhost, local IP, etc.)
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin:  corsOrigin === '*' ? true : corsOrigin.split(',').map(s => s.trim()),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: corsOrigin !== '*',
}));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // serves HTML from the same folder
// ── Request logger (dev) ──────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString('en-PH')}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/auth',   authRoutes);
app.use('/orders', orderRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    service:   'Eras & Moonlight API',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Eras & Moonlight — API Server        ║');
  console.log(`║   Running on http://localhost:${PORT}      ║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints:');
  console.log('  POST  /auth/register');
  console.log('  POST  /auth/login');
  console.log('  GET   /auth/me');
  console.log('  POST  /orders');
  console.log('  GET   /orders/my');
  console.log('  GET   /orders/:ref');
  console.log('  GET   /orders          (admin)');
  console.log('  PATCH /orders/:ref/status  (admin)');
  console.log('  GET   /health');
  console.log('');
});

module.exports = app;