const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { roleMiddleware } = require('../middleware/auth');
const { getCache, setCache, invalidateCache } = require('../redis');

// GET /api/mesas - Listar todas com status do pedido (com cache)
router.get('/', async (req, res, next) => {
  try {
    const cached = await getCache('cache:mesas');
    if (cached) return res.json(cached);

    const result = await query(`
      SELECT
        m.*,
        p.id as pedido_id,
        p.total as pedido_total,
        p.created_at as pedido_inicio,
        (SELECT COUNT(*) FROM itens_pedido WHERE pedido_id = p.id) as qtd_itens
      FROM mesas m
      LEFT JOIN pedidos p ON m.id = p.mesa_id AND p.status IN ('aberto', 'producao', 'pronto')
      ORDER BY
        CASE WHEN m.numero = 'BAL' THEN 1 ELSE 0 END,
        LENGTH(m.numero),
        m.numero
    `);

    await setCache('cache:mesas', result.rows, 30);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/mesas/:id - Buscar por ID com pedido ativo
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const mesa = await query('SELECT * FROM mesas WHERE id = $1', [id]);

    if (mesa.rows.length === 0) {
      return res.status(404).json({ error: 'Mesa não encontrada' });
    }

    const pedido = await query(`
      SELECT p.*,
        json_agg(
          json_build_object(
            'id', ip.id,
            'produto_nome', ip.produto_nome,
            'quantidade', ip.quantidade,
            'preco_unitario', ip.preco_unitario,
            'subtotal', ip.subtotal,
            'observacao', ip.observacao,
            'status', ip.status
          ) ORDER BY ip.created_at
        ) FILTER (WHERE ip.id IS NOT NULL) as itens
      FROM pedidos p
      LEFT JOIN itens_pedido ip ON p.id = ip.pedido_id
      WHERE p.mesa_id = $1 AND p.status IN ('aberto', 'producao', 'pronto')
      GROUP BY p.id
      LIMIT 1
    `, [id]);

    res.json({
      ...mesa.rows[0],
      pedido: pedido.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/mesas/:id/status - Atualizar status da mesa
router.put('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['livre', 'ocupada', 'reservada'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await query(
      'UPDATE mesas SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mesa não encontrada' });
    }

    await invalidateCache('cache:mesas');

    const io = req.app.get('io');
    io.emit('mesa-atualizada', result.rows[0]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/mesas - Criar nova mesa (admin/gerente)
router.post('/', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { numero, capacidade, localizacao } = req.body;

    if (!numero) {
      return res.status(400).json({ error: 'Número da mesa é obrigatório' });
    }

    const result = await query(
      `INSERT INTO mesas (numero, capacidade, localizacao)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [numero, capacidade || 4, localizacao || 'salao']
    );

    await invalidateCache('cache:mesas');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Já existe uma mesa com esse número' });
    }
    next(error);
  }
});

// DELETE /api/mesas/:id - Remover mesa (admin/gerente)
router.delete('/:id', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const pedidoAtivo = await query(
      `SELECT id FROM pedidos WHERE mesa_id = $1 AND status IN ('aberto', 'producao', 'pronto')`,
      [id]
    );

    if (pedidoAtivo.rows.length > 0) {
      return res.status(400).json({ error: 'Não é possível remover mesa com pedido ativo' });
    }

    const result = await query('DELETE FROM mesas WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mesa não encontrada' });
    }

    await invalidateCache('cache:mesas');

    res.json({ message: 'Mesa removida', mesa: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
