/**
 * Pedidos route tests with mocked database.
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

const { query, transaction } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'pdv-restaurante-jwt-secret-dev';

function createApp() {
  const app = express();
  app.use(express.json());

  const io = { emit: jest.fn(), to: jest.fn(function () { return this; }) };
  app.set('io', io);

  const { authMiddleware } = require('../src/middleware/auth');
  app.use('/api/pedidos', authMiddleware, require('../src/routes/pedidos'));

  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return { app, io };
}

function token(perfil = 'garcom') {
  return jwt.sign({ id: 1, perfil }, JWT_SECRET, { expiresIn: '1h' });
}

/** Prepend the auth middleware user-lookup mock */
function mockAuthUser(perfil = 'garcom') {
  query.mockResolvedValueOnce({
    rows: [{ id: 1, nome: 'Test', email: 'test@test.com', perfil }],
  });
}

describe('GET /api/pedidos', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve retornar 401 sem token', async () => {
    const res = await request(app).get('/api/pedidos');
    expect(res.status).toBe(401);
  });

  it('deve retornar lista paginada', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, status: 'aberto', mesa_numero: '1', qtd_itens: '3' },
          { id: 2, status: 'producao', mesa_numero: '2', qtd_itens: '1' },
        ],
      });

    const res = await request(app)
      .get('/api/pedidos?page=1&limit=20')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.page).toBe(1);
  });

  it('deve filtrar por status', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'aberto' }] });

    const res = await request(app)
      .get('/api/pedidos?status=aberto')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // calls[0] = auth lookup, calls[1] = count query
    const countCall = query.mock.calls[1];
    expect(countCall[0]).toContain('p.status');
    expect(countCall[1]).toContain('aberto');
  });
});

describe('POST /api/pedidos', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve criar pedido com transacao', async () => {
    const pedidoCriado = { id: 10, mesa_id: 1, tipo: 'mesa', status: 'aberto', total: 0 };

    mockAuthUser();
    // Mock: no existing order for mesa
    query.mockResolvedValueOnce({ rows: [] });

    transaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [pedidoCriado] }) // INSERT pedido
          .mockResolvedValueOnce({ rows: [] }), // UPDATE mesa
      };
      return cb(client);
    });

    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ mesa_id: 1, tipo: 'mesa' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(transaction).toHaveBeenCalled();
  });

  it('deve rejeitar mesa com pedido aberto', async () => {
    mockAuthUser();
    query.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // existing pedido

    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ mesa_id: 1, tipo: 'mesa' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mesa.*aberto/i);
  });
});

describe('PUT /api/pedidos/:id/cancelar', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve cancelar pedido e devolver estoque', async () => {
    const pedidoCancelado = { id: 1, status: 'cancelado', mesa_id: 2 };

    mockAuthUser();

    transaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, status: 'aberto', mesa_id: 2 }] })
          .mockResolvedValueOnce({ rows: [{ produto_id: 10, quantidade: 3 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [pedidoCancelado] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      return cb(client);
    });

    const res = await request(app)
      .put('/api/pedidos/1/cancelar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ motivo: 'Cliente desistiu' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
  });

  it('deve rejeitar cancelamento de pedido pago', async () => {
    mockAuthUser();

    transaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pago' }] }),
      };
      return cb(client);
    });

    const res = await request(app)
      .put('/api/pedidos/1/cancelar')
      .set('Authorization', `Bearer ${token()}`)
      .send({ motivo: 'Teste' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pago/i);
  });
});

describe('PUT /api/pedidos/:id/fechar', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve rejeitar fechamento com pagamento incompleto', async () => {
    mockAuthUser();

    transaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ total: '50.00' }] })
          .mockResolvedValueOnce({ rows: [{ id: 1, total: '100.00', mesa_id: 1 }] }),
      };
      return cb(client);
    });

    const res = await request(app)
      .put('/api/pedidos/1/fechar')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incompleto/i);
  });

  it('deve fechar pedido com pagamento completo', async () => {
    const pedidoFechado = { id: 1, status: 'pago', mesa_id: 2, closed_at: new Date() };

    mockAuthUser();

    transaction.mockImplementation(async (cb) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ total: '100.00' }] })
          .mockResolvedValueOnce({ rows: [{ id: 1, total: '100.00', mesa_id: 2 }] })
          .mockResolvedValueOnce({ rows: [pedidoFechado] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      return cb(client);
    });

    const res = await request(app)
      .put('/api/pedidos/1/fechar')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pago');
  });
});
