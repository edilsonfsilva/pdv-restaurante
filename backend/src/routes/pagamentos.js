const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { getCache, setCache, invalidateCache } = require('../redis');

// GET /api/pagamentos - Listar pagamentos (com filtros e paginação)
router.get('/', async (req, res, next) => {
  try {
    const { pedido_id, forma, data_inicio, data_fim, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    const params = [];

    if (pedido_id) {
      params.push(pedido_id);
      whereClauses.push(`pg.pedido_id = $${params.length}`);
    }

    if (forma) {
      params.push(forma);
      whereClauses.push(`pg.forma = $${params.length}`);
    }

    if (data_inicio) {
      params.push(data_inicio);
      whereClauses.push(`pg.created_at >= $${params.length}`);
    }

    if (data_fim) {
      params.push(data_fim);
      whereClauses.push(`pg.created_at <= $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countResult = await query(
      `SELECT COUNT(*) as total FROM pagamentos pg ${whereStr}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    const dataParams = [...params, parseInt(limit), offset];
    const result = await query(`
      SELECT pg.*, p.mesa_id, m.numero as mesa_numero
      FROM pagamentos pg
      INNER JOIN pedidos p ON pg.pedido_id = p.id
      LEFT JOIN mesas m ON p.mesa_id = m.id
      ${whereStr}
      ORDER BY pg.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pagamentos/resumo - Resumo do dia (com cache)
router.get('/resumo', async (req, res, next) => {
  try {
    const { data } = req.query;
    const dataFiltro = data || new Date().toISOString().split('T')[0];

    const cacheKey = `cache:resumo:${dataFiltro}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const result = await query(`
      SELECT
        forma,
        COUNT(*) as quantidade,
        SUM(valor) as total
      FROM pagamentos
      WHERE DATE(created_at) = $1
      GROUP BY forma
      ORDER BY total DESC
    `, [dataFiltro]);

    const totalGeral = await query(`
      SELECT
        COUNT(DISTINCT pedido_id) as pedidos,
        SUM(valor) as total
      FROM pagamentos
      WHERE DATE(created_at) = $1
    `, [dataFiltro]);

    const response = {
      data: dataFiltro,
      por_forma: result.rows,
      total_pedidos: parseInt(totalGeral.rows[0].pedidos) || 0,
      total_geral: parseFloat(totalGeral.rows[0].total) || 0
    };

    await setCache(cacheKey, response, 60);

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/pagamentos - Registrar pagamento
router.post('/', async (req, res, next) => {
  try {
    const { pedido_id, forma, valor, troco = 0, observacao } = req.body;

    if (!pedido_id || !forma || !valor) {
      return res.status(400).json({ error: 'Pedido, forma e valor são obrigatórios' });
    }

    if (parseFloat(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero' });
    }

    if (!['dinheiro', 'pix', 'credito', 'debito', 'voucher'].includes(forma)) {
      return res.status(400).json({ error: 'Forma de pagamento inválida' });
    }

    const pedido = await query('SELECT * FROM pedidos WHERE id = $1', [pedido_id]);

    if (pedido.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    if (pedido.rows[0].status === 'pago') {
      return res.status(400).json({ error: 'Pedido já está pago' });
    }

    if (pedido.rows[0].status === 'cancelado') {
      return res.status(400).json({ error: 'Não é possível pagar pedido cancelado' });
    }

    const totalPago = await query(
      'SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE pedido_id = $1',
      [pedido_id]
    );

    const valorRestante = parseFloat(pedido.rows[0].total) - parseFloat(totalPago.rows[0].total);

    if (parseFloat(valor) > valorRestante + 0.01) {
      return res.status(400).json({
        error: 'Valor excede o restante',
        valor_restante: valorRestante.toFixed(2)
      });
    }

    const result = await query(
      `INSERT INTO pagamentos (pedido_id, forma, valor, troco, observacao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [pedido_id, forma, valor, troco, observacao]
    );

    const novoTotalPago = parseFloat(totalPago.rows[0].total) + parseFloat(valor);
    const pagamentoCompleto = novoTotalPago >= parseFloat(pedido.rows[0].total);

    await invalidateCache('cache:resumo*');

    const io = req.app.get('io');
    io.emit('pagamento-registrado', {
      ...result.rows[0],
      pedido_total: pedido.rows[0].total,
      total_pago: novoTotalPago.toFixed(2),
      restante: Math.max(0, parseFloat(pedido.rows[0].total) - novoTotalPago).toFixed(2),
      pagamento_completo: pagamentoCompleto
    });

    res.status(201).json({
      pagamento: result.rows[0],
      pedido_total: pedido.rows[0].total,
      total_pago: novoTotalPago.toFixed(2),
      restante: Math.max(0, parseFloat(pedido.rows[0].total) - novoTotalPago).toFixed(2),
      pagamento_completo: pagamentoCompleto
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/pagamentos/:id - Estornar pagamento
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const pagamento = await query('SELECT * FROM pagamentos WHERE id = $1', [id]);

    if (pagamento.rows.length === 0) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }

    const pedido = await query('SELECT status FROM pedidos WHERE id = $1', [pagamento.rows[0].pedido_id]);

    if (pedido.rows[0].status === 'pago') {
      return res.status(400).json({ error: 'Não é possível estornar pagamento de pedido já fechado' });
    }

    const result = await query('DELETE FROM pagamentos WHERE id = $1 RETURNING *', [id]);

    await invalidateCache('cache:resumo*');

    const io = req.app.get('io');
    io.emit('pagamento-estornado', result.rows[0]);

    res.json({ message: 'Pagamento estornado', pagamento: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
