/**
 * Pagamentos route tests with mocked database.
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
  app.use('/api/pagamentos', authMiddleware, require('../src/routes/pagamentos'));

  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return { app, io };
}

function token(perfil = 'caixa') {
  return jwt.sign({ id: 1, perfil }, JWT_SECRET, { expiresIn: '1h' });
}

/** Prepend the auth middleware user-lookup mock */
function mockAuthUser(perfil = 'caixa') {
  query.mockResolvedValueOnce({
    rows: [{ id: 1, nome: 'Test', email: 'test@test.com', perfil }],
  });
}

describe('POST /api/pagamentos', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve retornar 400 sem campos obrigatorios', async () => {
    mockAuthUser();

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigat/i);
  });

  it('deve retornar 400 para valor negativo', async () => {
    mockAuthUser();

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'pix', valor: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maior que zero/i);
  });

  it('deve retornar 400 para forma invalida', async () => {
    mockAuthUser();

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'bitcoin', valor: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inv[aá]lid/i);
  });

  it('deve retornar 404 para pedido inexistente', async () => {
    mockAuthUser();
    query.mockResolvedValueOnce({ rows: [] }); // pedido not found

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 999, forma: 'pix', valor: 50 });

    expect(res.status).toBe(404);
  });

  it('deve rejeitar pagamento de pedido ja pago', async () => {
    mockAuthUser();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'pago', total: '100.00' }],
    });

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'pix', valor: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pago/i);
  });

  it('deve rejeitar pagamento de pedido cancelado', async () => {
    mockAuthUser();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, status: 'cancelado', total: '100.00' }],
    });

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'dinheiro', valor: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelado/i);
  });

  it('deve rejeitar overpayment (valor excede restante)', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'aberto', total: '100.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: '80.00' }] });

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'pix', valor: 30 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/excede/i);
    expect(res.body.valor_restante).toBeDefined();
  });

  it('deve registrar pagamento valido', async () => {
    const pagamento = { id: 1, pedido_id: 1, forma: 'pix', valor: '50.00', troco: '0' };

    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'aberto', total: '100.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [pagamento] });

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'pix', valor: 50 });

    expect(res.status).toBe(201);
    expect(res.body.pagamento).toBeDefined();
    expect(res.body.total_pago).toBe('50.00');
    expect(res.body.restante).toBe('50.00');
    expect(res.body.pagamento_completo).toBe(false);
  });

  it('deve marcar pagamento completo quando valor total atingido', async () => {
    const pagamento = { id: 2, pedido_id: 1, forma: 'dinheiro', valor: '50.00', troco: '0' };

    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'aberto', total: '100.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: '50.00' }] })
      .mockResolvedValueOnce({ rows: [pagamento] });

    const res = await request(app)
      .post('/api/pagamentos')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pedido_id: 1, forma: 'dinheiro', valor: 50 });

    expect(res.status).toBe(201);
    expect(res.body.pagamento_completo).toBe(true);
    expect(res.body.restante).toBe('0.00');
  });
});

describe('DELETE /api/pagamentos/:id (estorno)', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ app } = createApp());
  });

  it('deve retornar 404 para pagamento inexistente', async () => {
    mockAuthUser();
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete('/api/pagamentos/999')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(404);
  });

  it('deve rejeitar estorno de pedido pago/fechado', async () => {
    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, pedido_id: 1, valor: '50.00' }] })
      .mockResolvedValueOnce({ rows: [{ status: 'pago' }] });

    const res = await request(app)
      .delete('/api/pagamentos/1')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fechado/i);
  });

  it('deve estornar pagamento com sucesso', async () => {
    const pagamento = { id: 1, pedido_id: 1, forma: 'pix', valor: '50.00' };

    mockAuthUser();
    query
      .mockResolvedValueOnce({ rows: [pagamento] })
      .mockResolvedValueOnce({ rows: [{ status: 'aberto' }] })
      .mockResolvedValueOnce({ rows: [pagamento] });

    const res = await request(app)
      .delete('/api/pagamentos/1')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/estornado/i);
    expect(res.body.pagamento).toBeDefined();
  });
});
