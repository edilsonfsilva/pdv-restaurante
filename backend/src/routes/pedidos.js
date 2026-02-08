const express = require('express');
const router = express.Router();
const { query, transaction } = require('../db');
const { invalidateCache } = require('../redis');

// GET /api/pedidos - Listar pedidos (com filtros e paginação)
router.get('/', async (req, res, next) => {
  try {
    const { status, mesa_id, data_inicio, data_fim, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    const params = [];

    if (status) {
      params.push(status);
      whereClauses.push(`p.status = $${params.length}`);
    }

    if (mesa_id) {
      params.push(mesa_id);
      whereClauses.push(`p.mesa_id = $${params.length}`);
    }

    if (data_inicio) {
      params.push(data_inicio);
      whereClauses.push(`p.created_at >= $${params.length}`);
    }

    if (data_fim) {
      params.push(data_fim);
      whereClauses.push(`p.created_at <= $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Contagem total
    const countResult = await query(
      `SELECT COUNT(*) as total FROM pedidos p ${whereStr}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Dados paginados
    const dataParams = [...params, parseInt(limit), offset];
    const result = await query(`
      SELECT p.*, m.numero as mesa_numero,
        (SELECT COUNT(*) FROM itens_pedido WHERE pedido_id = p.id) as qtd_itens
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      ${whereStr}
      ORDER BY p.created_at DESC
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

// GET /api/pedidos/cozinha - Pedidos para KDS (em produção)
router.get('/cozinha', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        p.id as pedido_id,
        p.created_at as pedido_hora,
        m.numero as mesa,
        p.tipo,
        ip.id as item_id,
        ip.produto_nome,
        ip.quantidade,
        ip.observacao,
        ip.status as item_status,
        ip.created_at as item_hora,
        EXTRACT(EPOCH FROM (NOW() - ip.created_at))/60 as minutos_espera
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      INNER JOIN itens_pedido ip ON p.id = ip.pedido_id
      WHERE p.status IN ('aberto', 'producao')
        AND ip.status IN ('pendente', 'preparando')
      ORDER BY ip.created_at ASC
    `);

    // Agrupar por pedido
    const pedidosMap = new Map();
    result.rows.forEach(row => {
      if (!pedidosMap.has(row.pedido_id)) {
        pedidosMap.set(row.pedido_id, {
          id: row.pedido_id,
          mesa: row.mesa,
          tipo: row.tipo,
          hora: row.pedido_hora,
          itens: []
        });
      }
      pedidosMap.get(row.pedido_id).itens.push({
        id: row.item_id,
        produto: row.produto_nome,
        quantidade: row.quantidade,
        observacao: row.observacao,
        status: row.item_status,
        hora: row.item_hora,
        espera: Math.round(row.minutos_espera)
      });
    });

    res.json(Array.from(pedidosMap.values()));
  } catch (error) {
    next(error);
  }
});

// GET /api/pedidos/:id - Buscar pedido com itens
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const pedido = await query(`
      SELECT p.*, m.numero as mesa_numero
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      WHERE p.id = $1
    `, [id]);

    if (pedido.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const itens = await query(`
      SELECT * FROM itens_pedido
      WHERE pedido_id = $1
      ORDER BY created_at
    `, [id]);

    const pagamentos = await query(`
      SELECT * FROM pagamentos
      WHERE pedido_id = $1
      ORDER BY created_at
    `, [id]);

    res.json({
      ...pedido.rows[0],
      itens: itens.rows,
      pagamentos: pagamentos.rows
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/pedidos - Criar novo pedido
router.post('/', async (req, res, next) => {
  try {
    const { mesa_id, tipo = 'mesa', cliente_nome, observacao } = req.body;

    if (mesa_id) {
      const pedidoExistente = await query(
        `SELECT id FROM pedidos WHERE mesa_id = $1 AND status IN ('aberto', 'producao', 'pronto')`,
        [mesa_id]
      );

      if (pedidoExistente.rows.length > 0) {
        return res.status(400).json({
          error: 'Mesa já possui pedido aberto',
          pedido_id: pedidoExistente.rows[0].id
        });
      }
    }

    const garcomId = req.user ? req.user.id : null;

    const result = await transaction(async (client) => {
      const pedido = await client.query(
        `INSERT INTO pedidos (mesa_id, tipo, cliente_nome, observacao, garcom_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [mesa_id, tipo, cliente_nome, observacao, garcomId]
      );

      if (mesa_id) {
        await client.query(
          'UPDATE mesas SET status = $1 WHERE id = $2',
          ['ocupada', mesa_id]
        );
      }

      return pedido.rows[0];
    });

    await invalidateCache('cache:mesas');

    const io = req.app.get('io');
    io.emit('pedido-criado', result);
    io.emit('mesa-atualizada', { id: mesa_id, status: 'ocupada' });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/pedidos/:id/itens - Adicionar item ao pedido (com controle de estoque)
router.post('/:id/itens', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { produto_id, quantidade = 1, observacao } = req.body;

    if (!produto_id) {
      return res.status(400).json({ error: 'Produto é obrigatório' });
    }

    if (quantidade < 1) {
      return res.status(400).json({ error: 'Quantidade deve ser pelo menos 1' });
    }

    const produto = await query('SELECT * FROM produtos WHERE id = $1', [produto_id]);
    if (produto.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const p = produto.rows[0];
    const subtotal = p.preco * quantidade;

    const result = await transaction(async (client) => {
      // Verificar e decrementar estoque (se controlado)
      if (p.estoque_quantidade !== null && p.estoque_quantidade !== undefined) {
        const estoque = await client.query(
          'SELECT estoque_quantidade FROM produtos WHERE id = $1 FOR UPDATE',
          [produto_id]
        );

        if (estoque.rows[0].estoque_quantidade < quantidade) {
          throw {
            status: 400,
            message: `Estoque insuficiente para "${p.nome}". Disponível: ${estoque.rows[0].estoque_quantidade}`
          };
        }

        await client.query(
          'UPDATE produtos SET estoque_quantidade = estoque_quantidade - $1 WHERE id = $2',
          [quantidade, produto_id]
        );
      }

      const item = await client.query(
        `INSERT INTO itens_pedido
         (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, subtotal, observacao)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, produto_id, p.nome, quantidade, p.preco, subtotal, observacao]
      );

      await client.query('SELECT recalcular_pedido($1)', [id]);

      await client.query(
        `UPDATE pedidos SET status = 'producao' WHERE id = $1 AND status = 'aberto'`,
        [id]
      );

      const pedidoAtualizado = await client.query('SELECT * FROM pedidos WHERE id = $1', [id]);

      return { item: item.rows[0], pedido: pedidoAtualizado.rows[0] };
    });

    await invalidateCache('cache:cardapio');

    const io = req.app.get('io');
    io.to('cozinha').emit('novo-item', result.item);
    io.emit('pedido-atualizado', result.pedido);

    res.status(201).json(result.item);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// PUT /api/pedidos/:id/itens/:itemId/status - Atualizar status do item (KDS)
router.put('/:id/itens/:itemId/status', async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const { status } = req.body;

    if (!['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await transaction(async (client) => {
      // Se cancelando item, devolver estoque
      if (status === 'cancelado') {
        const itemInfo = await client.query(
          'SELECT produto_id, quantidade FROM itens_pedido WHERE id = $1 AND pedido_id = $2',
          [itemId, id]
        );

        if (itemInfo.rows.length > 0 && itemInfo.rows[0].produto_id) {
          await client.query(
            `UPDATE produtos SET estoque_quantidade = estoque_quantidade + $1
             WHERE id = $2 AND estoque_quantidade IS NOT NULL`,
            [itemInfo.rows[0].quantidade, itemInfo.rows[0].produto_id]
          );
        }
      }

      const itemResult = await client.query(
        `UPDATE itens_pedido SET status = $1 WHERE id = $2 AND pedido_id = $3 RETURNING *`,
        [status, itemId, id]
      );

      if (itemResult.rows.length === 0) {
        throw { status: 404, message: 'Item não encontrado' };
      }

      // Verificar se todos os itens estão prontos/entregues/cancelados
      const itensPendentes = await client.query(
        `SELECT COUNT(*) as count FROM itens_pedido
         WHERE pedido_id = $1 AND status NOT IN ('pronto', 'entregue', 'cancelado')`,
        [id]
      );

      let pedidoPronto = false;
      if (parseInt(itensPendentes.rows[0].count) === 0) {
        await client.query(`UPDATE pedidos SET status = 'pronto' WHERE id = $1`, [id]);
        pedidoPronto = true;
      }

      return { item: itemResult.rows[0], pedidoPronto };
    });

    const io = req.app.get('io');
    io.emit('item-atualizado', result.item);
    io.to('cozinha').emit('item-atualizado', result.item);

    if (result.pedidoPronto) {
      io.emit('pedido-atualizado', { id: parseInt(id), status: 'pronto' });
    }

    res.json(result.item);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// DELETE /api/pedidos/:id/itens/:itemId - Remover item (com devolução de estoque)
router.delete('/:id/itens/:itemId', async (req, res, next) => {
  try {
    const { id, itemId } = req.params;

    const result = await transaction(async (client) => {
      const item = await client.query(
        'DELETE FROM itens_pedido WHERE id = $1 AND pedido_id = $2 RETURNING *',
        [itemId, id]
      );

      if (item.rows.length === 0) {
        throw { status: 404, message: 'Item não encontrado' };
      }

      // Devolver estoque se controlado
      if (item.rows[0].produto_id) {
        await client.query(
          `UPDATE produtos SET estoque_quantidade = estoque_quantidade + $1
           WHERE id = $2 AND estoque_quantidade IS NOT NULL`,
          [item.rows[0].quantidade, item.rows[0].produto_id]
        );
      }

      await client.query('SELECT recalcular_pedido($1)', [id]);

      const pedido = await client.query('SELECT * FROM pedidos WHERE id = $1', [id]);

      return { item: item.rows[0], pedido: pedido.rows[0] };
    });

    const io = req.app.get('io');
    io.emit('pedido-atualizado', result.pedido);

    res.json({ message: 'Item removido', item: result.item });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// PUT /api/pedidos/:id/fechar - Fechar pedido (após pagamento)
router.put('/:id/fechar', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await transaction(async (client) => {
      const totalPago = await client.query(
        'SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE pedido_id = $1',
        [id]
      );

      const pedido = await client.query('SELECT * FROM pedidos WHERE id = $1', [id]);

      if (pedido.rows.length === 0) {
        throw { status: 404, message: 'Pedido não encontrado' };
      }

      if (parseFloat(totalPago.rows[0].total) < parseFloat(pedido.rows[0].total)) {
        throw { status: 400, message: 'Pagamento incompleto' };
      }

      const pedidoFechado = await client.query(
        `UPDATE pedidos SET status = 'pago', closed_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (pedido.rows[0].mesa_id) {
        await client.query(
          'UPDATE mesas SET status = $1 WHERE id = $2',
          ['livre', pedido.rows[0].mesa_id]
        );
      }

      return pedidoFechado.rows[0];
    });

    await invalidateCache('cache:mesas');
    await invalidateCache('cache:resumo*');

    const io = req.app.get('io');
    io.emit('pedido-fechado', result);
    io.emit('mesa-atualizada', { id: result.mesa_id, status: 'livre' });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// PUT /api/pedidos/:id/cancelar - Cancelar pedido (com devolução de estoque)
router.put('/:id/cancelar', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const result = await transaction(async (client) => {
      const pedido = await client.query('SELECT * FROM pedidos WHERE id = $1', [id]);

      if (pedido.rows.length === 0) {
        throw { status: 404, message: 'Pedido não encontrado' };
      }

      if (pedido.rows[0].status === 'pago') {
        throw { status: 400, message: 'Não é possível cancelar pedido já pago' };
      }

      // Devolver estoque de todos os itens não cancelados
      const itens = await client.query(
        `SELECT produto_id, quantidade FROM itens_pedido
         WHERE pedido_id = $1 AND status != 'cancelado'`,
        [id]
      );

      for (const item of itens.rows) {
        if (item.produto_id) {
          await client.query(
            `UPDATE produtos SET estoque_quantidade = estoque_quantidade + $1
             WHERE id = $2 AND estoque_quantidade IS NOT NULL`,
            [item.quantidade, item.produto_id]
          );
        }
      }

      const pedidoCancelado = await client.query(
        `UPDATE pedidos SET status = 'cancelado', observacao = COALESCE(observacao || ' | ', '') || $1, closed_at = NOW()
         WHERE id = $2 RETURNING *`,
        [`CANCELADO: ${motivo || 'Sem motivo informado'}`, id]
      );

      if (pedido.rows[0].mesa_id) {
        await client.query('UPDATE mesas SET status = $1 WHERE id = $2', ['livre', pedido.rows[0].mesa_id]);
      }

      return pedidoCancelado.rows[0];
    });

    await invalidateCache('cache:mesas');

    const io = req.app.get('io');
    io.emit('pedido-cancelado', result);
    io.emit('mesa-atualizada', { id: result.mesa_id, status: 'livre' });

    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
