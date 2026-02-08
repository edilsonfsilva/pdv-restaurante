const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { roleMiddleware } = require('../middleware/auth');
const { getCache, setCache, invalidateCache } = require('../redis');

// GET /api/categorias - Listar todas
router.get('/', async (req, res, next) => {
  try {
    const cached = await getCache('cache:categorias');
    if (cached) return res.json(cached);

    const result = await query(
      'SELECT * FROM categorias WHERE ativo = true ORDER BY ordem, nome'
    );

    await setCache('cache:categorias', result.rows, 300);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/categorias/:id - Buscar por ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM categorias WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/categorias - Criar nova (admin/gerente)
router.post('/', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { nome, icone, ordem } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      'INSERT INTO categorias (nome, icone, ordem) VALUES ($1, $2, $3) RETURNING *',
      [nome, icone, ordem || 0]
    );

    await invalidateCache('cache:categorias*');
    await invalidateCache('cache:cardapio');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/categorias/:id - Atualizar (admin/gerente)
router.put('/:id', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, icone, ordem, ativo } = req.body;

    const result = await query(
      `UPDATE categorias
       SET nome = COALESCE($1, nome),
           icone = COALESCE($2, icone),
           ordem = COALESCE($3, ordem),
           ativo = COALESCE($4, ativo)
       WHERE id = $5
       RETURNING *`,
      [nome, icone, ordem, ativo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    await invalidateCache('cache:categorias*');
    await invalidateCache('cache:cardapio');

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/categorias/:id - Desativar (admin/gerente)
router.delete('/:id', roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'UPDATE categorias SET ativo = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    await invalidateCache('cache:categorias*');
    await invalidateCache('cache:cardapio');

    res.json({ message: 'Categoria desativada', categoria: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
