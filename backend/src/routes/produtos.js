const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { roleMiddleware } = require('../middleware/auth');
const { getCache, setCache, invalidateCache } = require('../redis');

// GET /api/produtos - Listar todos (com filtros e paginação)
router.get('/', async (req, res, next) => {
  try {
    const { categoria_id, ativo, busca, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    const params = [];

    if (categoria_id) {
      params.push(categoria_id);
      whereClauses.push(`p.categoria_id = $${params.length}`);
    }

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      whereClauses.push(`p.ativo = $${params.length}`);
    } else {
      whereClauses.push('p.ativo = true');
    }

    if (busca) {
      params.push(`%${busca}%`);
      whereClauses.push(`(p.nome ILIKE $${params.length} OR p.codigo ILIKE $${params.length})`);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Contagem total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM produtos p ${whereStr}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Dados paginados
    const dataParams = [...params, parseInt(limit), offset];
    const result = await query(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ${whereStr}
       ORDER BY c.ordem, p.nome
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

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

// GET /api/produtos/cardapio - Cardápio agrupado por categoria (com cache)
router.get('/cardapio', async (req, res, next) => {
  try {
    const cached = await getCache('cache:cardapio');
    if (cached) return res.json(cached);

    const categorias = await query(
      'SELECT * FROM categorias WHERE ativo = true ORDER BY ordem, nome'
    );

    const produtos = await query(`
      SELECT * FROM produtos
      WHERE ativo = true
      ORDER BY nome
    `);

    const cardapio = categorias.rows.map(cat => ({
      ...cat,
      produtos: produtos.rows.filter(p => p.categoria_id === cat.id)
    }));

    await setCache('cache:cardapio', cardapio, 300);

    res.json(cardapio);
  } catch (error) {
    next(error);
  }
});

// GET /api/produtos/:id - Buscar por ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/produtos - Criar novo (admin/gerente)
router.post('/', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { categoria_id, codigo, nome, descricao, preco, tempo_preparo } = req.body;

    if (!nome || !preco) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    if (parseFloat(preco) <= 0) {
      return res.status(400).json({ error: 'Preço deve ser maior que zero' });
    }

    const result = await query(
      `INSERT INTO produtos (categoria_id, codigo, nome, descricao, preco, tempo_preparo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [categoria_id, codigo, nome, descricao, preco, tempo_preparo || 15]
    );

    await invalidateCache('cache:cardapio');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/produtos/:id - Atualizar (admin/gerente)
router.put('/:id', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { categoria_id, codigo, nome, descricao, preco, tempo_preparo, ativo } = req.body;

    const result = await query(
      `UPDATE produtos
       SET categoria_id = COALESCE($1, categoria_id),
           codigo = COALESCE($2, codigo),
           nome = COALESCE($3, nome),
           descricao = COALESCE($4, descricao),
           preco = COALESCE($5, preco),
           tempo_preparo = COALESCE($6, tempo_preparo),
           ativo = COALESCE($7, ativo)
       WHERE id = $8
       RETURNING *`,
      [categoria_id, codigo, nome, descricao, preco, tempo_preparo, ativo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    await invalidateCache('cache:cardapio');

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/produtos/:id - Desativar (admin/gerente)
router.delete('/:id', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE produtos SET ativo = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    await invalidateCache('cache:cardapio');

    res.json({ message: 'Produto desativado', produto: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
