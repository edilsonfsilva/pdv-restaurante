/**
 * Auth route tests.
 *
 * These tests mock the database layer so they run without a real PostgreSQL.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const express = require('express');
const jwt = require('jsonwebtoken');

// We need to mock the db module BEFORE requiring the router
jest.mock('../src/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: { query: jest.fn() },
}));

jest.mock('../src/redis', () => ({
  redis: {},
  redisConnected: () => false,
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(null),
  invalidateCache: jest.fn().mockResolvedValue(null),
}));

const { query } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'pdv-restaurante-jwt-secret-dev';

// Build app with auth routes
function createApp() {
  const app = express();
  app.use(express.json());

  // Fake io
  const io = { emit: jest.fn(), to: jest.fn(function () { return this; }) };
  app.set('io', io);

  // Mount auth routes (public)
  const authRoutes = require('../src/routes/auth');
  app.use('/api/auth', authRoutes);

  // Error handler
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
}

/** Prepend the auth middleware user-lookup mock */
function mockAuthUser(perfil = 'admin', id = 1) {
  query.mockResolvedValueOnce({
    rows: [{ id, nome: 'Test', email: 'test@test.com', perfil }],
  });
}

describe('POST /api/auth/login', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  it('deve retornar 400 se email ou senha faltam', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar 401 para email inexistente', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@test.com', senha: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inv[aá]lid/i);
  });

  it('deve retornar 401 para senha incorreta', async () => {
    const hash = await bcrypt.hash('correta', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Test', email: 'test@test.com', senha_hash: hash, perfil: 'admin', ativo: true }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', senha: 'errada' });

    expect(res.status).toBe(401);
  });

  it('deve retornar 401 para usuario desativado', async () => {
    const hash = await bcrypt.hash('admin123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Test', email: 'test@test.com', senha_hash: hash, perfil: 'admin', ativo: false }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', senha: 'admin123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/desativado/i);
  });

  it('deve retornar token e usuario para login valido', async () => {
    const hash = await bcrypt.hash('admin123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Admin', email: 'admin@test.com', senha_hash: hash, perfil: 'admin', ativo: true }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', senha: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.email).toBe('admin@test.com');
    expect(res.body.usuario.perfil).toBe('admin');

    // Token should be valid
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.id).toBe(1);
    expect(decoded.perfil).toBe('admin');
  });
});

describe('POST /api/auth/registro', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  function adminToken() {
    return jwt.sign({ id: 1, perfil: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  }

  function garcomToken() {
    return jwt.sign({ id: 2, perfil: 'garcom' }, JWT_SECRET, { expiresIn: '1h' });
  }

  it('deve rejeitar sem token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ nome: 'Novo', email: 'novo@test.com', senha: '123456' });

    expect(res.status).toBe(401);
  });

  it('deve rejeitar perfil nao-admin (403)', async () => {
    // Auth middleware lookup for garcom user
    mockAuthUser('garcom', 2);

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${garcomToken()}`)
      .send({ nome: 'Novo', email: 'novo@test.com', senha: '123456' });

    expect(res.status).toBe(403);
  });

  it('deve criar usuario como admin', async () => {
    // Auth middleware lookup for admin user
    mockAuthUser('admin');
    // Route handler: check existing email + insert
    query
      .mockResolvedValueOnce({ rows: [] }) // check existing
      .mockResolvedValueOnce({
        rows: [{ id: 5, nome: 'Novo', email: 'novo@test.com', perfil: 'garcom', ativo: true, created_at: new Date() }],
      });

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ nome: 'Novo', email: 'novo@test.com', senha: '123456', perfil: 'garcom' });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Novo');
    expect(res.body.perfil).toBe('garcom');
  });

  it('deve retornar 409 para email duplicado', async () => {
    mockAuthUser('admin');
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // email exists

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ nome: 'Dup', email: 'existe@test.com', senha: '123456' });

    expect(res.status).toBe(409);
  });

  it('deve retornar 400 para perfil invalido', async () => {
    mockAuthUser('admin');

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ nome: 'X', email: 'x@test.com', senha: '123', perfil: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inv[aá]lid/i);
  });
});

describe('GET /api/auth/me', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  it('deve retornar 401 sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('deve retornar usuario autenticado', async () => {
    const token = jwt.sign({ id: 1, perfil: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

    // First query: authMiddleware user lookup
    mockAuthUser('admin');
    // Second query: /me route handler
    query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'Admin', email: 'admin@test.com', perfil: 'admin', created_at: new Date() }],
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@test.com');
  });

  it('deve retornar 401 para token expirado', async () => {
    const token = jwt.sign({ id: 1, perfil: 'admin' }, JWT_SECRET, { expiresIn: '-1s' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
