/**
 * Test setup - helpers for backend integration tests.
 *
 * Because the full app.js boots Socket.IO, Redis, seedAdmin, and rate-limiters
 * we build a lightweight Express app that wires up only the routers under test
 * with manually-mocked dependencies (db, redis, auth).
 */

const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-jwt-secret';

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Create a valid JWT for a given user payload */
function makeToken(payload = { id: 1, perfil: 'admin' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/** Build a minimal Express app that mimics the real app minus infra */
function buildApp({ withAuth = false } = {}) {
  const app = express();
  app.use(express.json());

  // Fake Socket.IO emitter (noop)
  const io = {
    emit: jest.fn(),
    to: jest.fn(() => io),
  };
  app.set('io', io);

  if (withAuth) {
    // Lightweight auth middleware using the same JWT_SECRET
    app.use((req, _res, next) => {
      const header = req.headers.authorization;
      if (!header) return next(); // let route handle 401 itself if needed
      const token = header.split(' ')[1];
      try {
        req.user = jwt.verify(token, JWT_SECRET);
      } catch { /* ignore */ }
      next();
    });
  }

  return { app, io };
}

module.exports = {
  JWT_SECRET,
  makeToken,
  buildApp,
};
