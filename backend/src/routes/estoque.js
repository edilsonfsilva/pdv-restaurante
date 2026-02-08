const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/estoque - Listar produtos com estoque
router.get('/', async (req, res, next) => {
  try {
    const { baixo_estoque, busca } = req.query;

    let sql = `
      SELECT p.id, p.codigo, p.nome, p.preco, p.ativo,
        p.estoque_quantidade, p.estoque_minimo,
        c.nome as categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estoque_quantidade IS NOT NULL
    `;
    const params = [];

    if (baixo_estoque === 'true') {
      sql += ' AND p.estoque_quantidade <= p.estoque_minimo';
    }

    if (busca) {
      params.push(`%${busca}%`);
      sql += ` AND (p.nome ILIKE $${params.length} OR p.codigo ILIKE $${params.length})`;
    }

    sql += `
      ORDER BY
        CASE WHEN p.estoque_quantidade <= COALESCE(p.estoque_minimo, 0) THEN 0 ELSE 1 END,
        p.nome
    `;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/estoque/alertas - Produtos abaixo do mínimo
router.get('/alertas', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.id, p.codigo, p.nome, p.estoque_quantidade, p.estoque_minimo,
        c.nome as categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estoque_quantidade IS NOT NULL
        AND p.estoque_minimo IS NOT NULL
        AND p.estoque_quantidade <= p.estoque_minimo
        AND p.ativo = true
      ORDER BY (p.estoque_quantidade - p.estoque_minimo) ASC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// PUT /api/estoque/:produtoId - Ajustar estoque manualmente
router.put('/:produtoId', async (req, res, next) => {
  try {
    const { produtoId } = req.params;
    const { quantidade, estoque_minimo } = req.body;

    if (quantidade === undefined && estoque_minimo === undefined) {
      return res.status(400).json({ error: 'Informe quantidade ou estoque_minimo' });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (quantidade !== undefined) {
      if (quantidade < 0) {
        return res.status(400).json({ error: 'Quantidade não pode ser negativa' });
      }
      fields.push(`estoque_quantidade = $${idx++}`);
      values.push(quantidade);
    }

    if (estoque_minimo !== undefined) {
      if (estoque_minimo < 0) {
        return res.status(400).json({ error: 'Estoque mínimo não pode ser negativo' });
      }
      fields.push(`estoque_minimo = $${idx++}`);
      values.push(estoque_minimo);
    }

    values.push(produtoId);

    const result = await query(
      `UPDATE produtos SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/estoque/:produtoId/ativar - Ativar controle de estoque para um produto
router.post('/:produtoId/ativar', async (req, res, next) => {
  try {
    const { produtoId } = req.params;
    const { quantidade = 0, estoque_minimo = 5 } = req.body;

    const result = await query(
      `UPDATE produtos
       SET estoque_quantidade = $1, estoque_minimo = $2
       WHERE id = $3
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`,
      [quantidade, estoque_minimo, produtoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/estoque/:produtoId/desativar - Desativar controle de estoque
router.post('/:produtoId/desativar', async (req, res, next) => {
  try {
    const { produtoId } = req.params;

    const result = await query(
      `UPDATE produtos
       SET estoque_quantidade = NULL, estoque_minimo = NULL
       WHERE id = $1
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`,
      [produtoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
