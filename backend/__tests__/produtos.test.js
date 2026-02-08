/**
 * Produtos route tests with mocked database.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

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

function createApp() {
  const app = express();
  app.use(express.json());

  const io = { emit: jest.fn(), to: jest.fn(function () { return this; }) };
  app.set('io', io);

  const { authMiddleware } = require('../src/middleware/auth');
  app.use('/api/produtos', authMiddleware, require('../src/routes/produtos'));

  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return { app, io };
}

function token(perfil = 'admin') {
  return jwt.sign({ id: 1, perfil }, JWT_SECRET, { expiresIn: '1h' });
}

/** Prepend the auth middleware user-lookup mock */
function mockAuthUser(perfil = 'admin') {
  query.mockResolvedValueOnce({
    rows: [{ id: 1, nome: 'Test', email: 'test@test.com', perfil }],
  });
}

describe('GET /api/produtos', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve retornar lista paginada de produtos', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, nome: 'X-Burger', preco: '25.00', categoria_nome: 'Lanches' },
          { id: 2, nome: 'Coca-Cola', preco: '8.00', categoria_nome: 'Bebidas' },
          { id: 3, nome: 'Batata Frita', preco: '15.00', categoria_nome: 'Porcoes' },
        ],
      });

    const res = await request(app)
      .get('/api/produtos')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('deve filtrar por busca', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: 'X-Burger' }] });

    const res = await request(app)
      .get('/api/produtos?busca=burger')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // calls[0] = auth, calls[1] = count
    const countCall = query.mock.calls[1];
    expect(countCall[0]).toMatch(/ILIKE/i);
  });
});

describe('POST /api/produtos', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve retornar 400 sem nome ou preco', async () => {
    mockAuthUser('admin');

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ nome: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigat/i);
  });

  it('deve retornar 400 para preco negativo', async () => {
    mockAuthUser('admin');

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ nome: 'Test', preco: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maior que zero/i);
  });

  it('deve rejeitar garcom criando produto (403)', async () => {
    mockAuthUser('garcom');

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token('garcom')}`)
      .send({ nome: 'Test', preco: 10 });

    expect(res.status).toBe(403);
  });

  it('deve criar produto como admin', async () => {
    mockAuthUser('admin');
    const produto = { id: 5, nome: 'Suco', preco: '12.00', categoria_id: 2, tempo_preparo: 15 };
    query.mockResolvedValueOnce({ rows: [produto] });

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ nome: 'Suco', preco: 12, categoria_id: 2 });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Suco');
  });

  it('deve criar produto como gerente', async () => {
    mockAuthUser('gerente');
    const produto = { id: 6, nome: 'Agua', preco: '5.00' };
    query.mockResolvedValueOnce({ rows: [produto] });

    const res = await request(app)
      .post('/api/produtos')
      .set('Authorization', `Bearer ${token('gerente')}`)
      .send({ nome: 'Agua', preco: 5 });

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/produtos/:id', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve atualizar produto como admin', async () => {
    mockAuthUser('admin');
    const updated = { id: 1, nome: 'X-Salada', preco: '30.00' };
    query.mockResolvedValueOnce({ rows: [updated] });

    const res = await request(app)
      .put('/api/produtos/1')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ nome: 'X-Salada', preco: 30 });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('X-Salada');
  });

  it('deve retornar 404 se produto nao existe', async () => {
    mockAuthUser('admin');
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/produtos/999')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ nome: 'Nada' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/produtos/:id (desativar)', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve desativar produto (soft delete)', async () => {
    mockAuthUser('admin');
    query.mockResolvedValueOnce({
      rows: [{ id: 1, nome: 'X-Burger', ativo: false }],
    });

    const res = await request(app)
      .delete('/api/produtos/1')
      .set('Authorization', `Bearer ${token('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/desativado/i);

    // calls[0] = auth lookup, calls[1] = UPDATE query
    const sqlUsed = query.mock.calls[1][0];
    expect(sqlUsed).toMatch(/UPDATE/i);
    expect(sqlUsed).toMatch(/ativo\s*=\s*false/i);
  });

  it('deve rejeitar garcom desativando produto', async () => {
    mockAuthUser('garcom');

    const res = await request(app)
      .delete('/api/produtos/1')
      .set('Authorization', `Bearer ${token('garcom')}`);

    expect(res.status).toBe(403);
  });
});
