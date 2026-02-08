// Pedidos routes for Cloudflare Workers (D1)
import { json, getBody, getParams } from '../worker.js'
import { comparePassword } from './auth.js'
import { roleMiddleware } from '../middleware/auth.js'

// Helper to recalculate order total (replaces PostgreSQL function)
async function recalcularPedido(db, pedidoId) {
  const itens = await db.prepare(
    "SELECT COALESCE(SUM(subtotal), 0) as subtotal FROM itens_pedido WHERE pedido_id = ? AND status != 'cancelado'"
  ).bind(pedidoId).all()

  const subtotal = parseFloat(itens.results[0].subtotal) || 0
  const pedido = await db.prepare('SELECT taxa_servico, desconto FROM pedidos WHERE id = ?').bind(pedidoId).all()

  const taxa = parseFloat(pedido.results[0]?.taxa_servico) || 0
  const desconto = parseFloat(pedido.results[0]?.desconto) || 0
  const total = subtotal + taxa - desconto

  await db.prepare(
    'UPDATE pedidos SET subtotal = ?, total = ? WHERE id = ?'
  ).bind(subtotal, total, pedidoId).run()
}

export async function pedidosRoutes(request, env, path, method, user) {
  const url = new URL(request.url)

  // GET /api/pedidos/cozinha - KDS
  if (path === '/cozinha' && method === 'GET') {
    const result = await env.DB.prepare(`
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
        ROUND((julianday('now') - julianday(ip.created_at)) * 1440) as minutos_espera
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      INNER JOIN itens_pedido ip ON p.id = ip.pedido_id
      WHERE p.status IN ('aberto', 'producao')
        AND ip.status IN ('pendente', 'preparando')
      ORDER BY ip.created_at ASC
    `).all()

    // Group by order
    const pedidosMap = new Map()
    result.results.forEach(row => {
      if (!pedidosMap.has(row.pedido_id)) {
        pedidosMap.set(row.pedido_id, {
          id: row.pedido_id,
          mesa: row.mesa,
          tipo: row.tipo,
          hora: row.pedido_hora,
          itens: []
        })
      }
      pedidosMap.get(row.pedido_id).itens.push({
        id: row.item_id,
        produto: row.produto_nome,
        quantidade: row.quantidade,
        observacao: row.observacao,
        status: row.item_status,
        hora: row.item_hora,
        espera: Math.round(row.minutos_espera || 0)
      })
    })

    return json(Array.from(pedidosMap.values()))
  }

  // GET /api/pedidos
  if ((path === '' || path === '/') && method === 'GET') {
    const params = getParams(request.url)
    const { status, mesa_id, data_inicio, data_fim, page = '1', limit = '20' } = params
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let whereClauses = []
    let binds = []

    if (status) { binds.push(status); whereClauses.push('p.status = ?') }
    if (mesa_id) { binds.push(mesa_id); whereClauses.push('p.mesa_id = ?') }
    if (data_inicio) { binds.push(data_inicio); whereClauses.push('p.created_at >= ?') }
    if (data_fim) { binds.push(data_fim); whereClauses.push('p.created_at <= ?') }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM pedidos p ${whereStr}`
    ).bind(...binds).all()
    const total = countResult.results[0].total

    const dataBinds = [...binds, parseInt(limit), offset]
    const result = await env.DB.prepare(`
      SELECT p.*, m.numero as mesa_numero,
        (SELECT COUNT(*) FROM itens_pedido WHERE pedido_id = p.id) as qtd_itens
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      ${whereStr}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...dataBinds).all()

    return json({
      data: result.results,
      pagination: {
        page: parseInt(page), limit: parseInt(limit), total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    })
  }

  // GET /api/pedidos/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'GET') {
    const id = idMatch[1]

    const pedido = await env.DB.prepare(`
      SELECT p.*, m.numero as mesa_numero
      FROM pedidos p LEFT JOIN mesas m ON p.mesa_id = m.id
      WHERE p.id = ?
    `).bind(id).all()

    if (pedido.results.length === 0) return json({ error: 'Pedido não encontrado' }, 404)

    const itens = await env.DB.prepare(
      'SELECT * FROM itens_pedido WHERE pedido_id = ? ORDER BY created_at'
    ).bind(id).all()

    const pagamentos = await env.DB.prepare(
      'SELECT * FROM pagamentos WHERE pedido_id = ? ORDER BY created_at'
    ).bind(id).all()

    return json({ ...pedido.results[0], itens: itens.results, pagamentos: pagamentos.results })
  }

  // POST /api/pedidos - Criar novo
  if ((path === '' || path === '/') && method === 'POST') {
    const { mesa_id, tipo = 'mesa', cliente_nome, observacao } = await getBody(request)

    if (mesa_id) {
      const pedidoExistente = await env.DB.prepare(
        "SELECT id FROM pedidos WHERE mesa_id = ? AND status IN ('aberto', 'producao', 'pronto')"
      ).bind(mesa_id).all()

      if (pedidoExistente.results.length > 0) {
        return json({ error: 'Mesa já possui pedido aberto', pedido_id: pedidoExistente.results[0].id }, 400)
      }
    }

    const garcomId = user ? user.id : null

    const pedido = await env.DB.prepare(
      `INSERT INTO pedidos (mesa_id, tipo, cliente_nome, observacao, garcom_id)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`
    ).bind(mesa_id || null, tipo, cliente_nome || null, observacao || null, garcomId).all()

    if (mesa_id) {
      await env.DB.prepare('UPDATE mesas SET status = ? WHERE id = ?').bind('ocupada', mesa_id).run()
    }

    return json(pedido.results[0], 201)
  }

  // POST /api/pedidos/:id/itens - Adicionar item
  const itensMatch = path.match(/^\/(\d+)\/itens$/)
  if (itensMatch && method === 'POST') {
    const pedidoId = itensMatch[1]
    const { produto_id, quantidade = 1, observacao } = await getBody(request)

    if (!produto_id) return json({ error: 'Produto é obrigatório' }, 400)
    if (quantidade < 1) return json({ error: 'Quantidade deve ser pelo menos 1' }, 400)

    const produto = await env.DB.prepare('SELECT * FROM produtos WHERE id = ?').bind(produto_id).all()
    if (produto.results.length === 0) return json({ error: 'Produto não encontrado' }, 404)

    const p = produto.results[0]
    const subtotal = p.preco * quantidade

    // Check stock
    if (p.estoque_quantidade !== null && p.estoque_quantidade !== undefined) {
      if (p.estoque_quantidade < quantidade) {
        return json({ error: `Estoque insuficiente para "${p.nome}". Disponível: ${p.estoque_quantidade}` }, 400)
      }
      await env.DB.prepare(
        'UPDATE produtos SET estoque_quantidade = estoque_quantidade - ? WHERE id = ?'
      ).bind(quantidade, produto_id).run()
    }

    const item = await env.DB.prepare(
      `INSERT INTO itens_pedido (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, subtotal, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    ).bind(pedidoId, produto_id, p.nome, quantidade, p.preco, subtotal, observacao || null).all()

    await recalcularPedido(env.DB, pedidoId)

    await env.DB.prepare(
      "UPDATE pedidos SET status = 'producao' WHERE id = ? AND status = 'aberto'"
    ).bind(pedidoId).run()

    return json(item.results[0], 201)
  }

  // PUT /api/pedidos/:id/itens/:itemId/status - KDS status update
  const itemStatusMatch = path.match(/^\/(\d+)\/itens\/(\d+)\/status$/)
  if (itemStatusMatch && method === 'PUT') {
    const pedidoId = itemStatusMatch[1]
    const itemId = itemStatusMatch[2]
    const { status } = await getBody(request)

    if (!['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'].includes(status)) {
      return json({ error: 'Status inválido' }, 400)
    }

    // If cancelling, return stock
    if (status === 'cancelado') {
      const itemInfo = await env.DB.prepare(
        'SELECT produto_id, quantidade FROM itens_pedido WHERE id = ? AND pedido_id = ?'
      ).bind(itemId, pedidoId).all()

      if (itemInfo.results.length > 0 && itemInfo.results[0].produto_id) {
        await env.DB.prepare(
          'UPDATE produtos SET estoque_quantidade = estoque_quantidade + ? WHERE id = ? AND estoque_quantidade IS NOT NULL'
        ).bind(itemInfo.results[0].quantidade, itemInfo.results[0].produto_id).run()
      }
    }

    const itemResult = await env.DB.prepare(
      'UPDATE itens_pedido SET status = ? WHERE id = ? AND pedido_id = ? RETURNING *'
    ).bind(status, itemId, pedidoId).all()

    if (itemResult.results.length === 0) return json({ error: 'Item não encontrado' }, 404)

    // Check if all items are done
    const itensPendentes = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM itens_pedido WHERE pedido_id = ? AND status NOT IN ('pronto', 'entregue', 'cancelado')"
    ).bind(pedidoId).all()

    if (parseInt(itensPendentes.results[0].count) === 0) {
      await env.DB.prepare("UPDATE pedidos SET status = 'pronto' WHERE id = ?").bind(pedidoId).run()
    }

    return json(itemResult.results[0])
  }

  // DELETE /api/pedidos/:id/itens/:itemId
  const itemDeleteMatch = path.match(/^\/(\d+)\/itens\/(\d+)$/)
  if (itemDeleteMatch && method === 'DELETE') {
    const pedidoId = itemDeleteMatch[1]
    const itemId = itemDeleteMatch[2]

    const item = await env.DB.prepare(
      'DELETE FROM itens_pedido WHERE id = ? AND pedido_id = ? RETURNING *'
    ).bind(itemId, pedidoId).all()

    if (item.results.length === 0) return json({ error: 'Item não encontrado' }, 404)

    // Return stock
    if (item.results[0].produto_id) {
      await env.DB.prepare(
        'UPDATE produtos SET estoque_quantidade = estoque_quantidade + ? WHERE id = ? AND estoque_quantidade IS NOT NULL'
      ).bind(item.results[0].quantidade, item.results[0].produto_id).run()
    }

    await recalcularPedido(env.DB, pedidoId)

    return json({ message: 'Item removido', item: item.results[0] })
  }

  // PUT /api/pedidos/:id/fechar
  const fecharMatch = path.match(/^\/(\d+)\/fechar$/)
  if (fecharMatch && method === 'PUT') {
    const id = fecharMatch[1]

    const totalPago = await env.DB.prepare(
      'SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE pedido_id = ?'
    ).bind(id).all()

    const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all()
    if (pedido.results.length === 0) return json({ error: 'Pedido não encontrado' }, 404)

    if (parseFloat(totalPago.results[0].total) < parseFloat(pedido.results[0].total)) {
      return json({ error: 'Pagamento incompleto' }, 400)
    }

    const now = new Date().toISOString()
    await env.DB.prepare(
      "UPDATE pedidos SET status = 'pago', closed_at = ? WHERE id = ?"
    ).bind(now, id).run()

    if (pedido.results[0].mesa_id) {
      await env.DB.prepare('UPDATE mesas SET status = ? WHERE id = ?').bind('livre', pedido.results[0].mesa_id).run()
    }

    const updated = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all()
    return json(updated.results[0])
  }

  // PUT /api/pedidos/:id/cancelar (somente admin/gerente com senha)
  const cancelarMatch = path.match(/^\/(\d+)\/cancelar$/)
  if (cancelarMatch && method === 'PUT') {
    // Apenas admin e gerente podem cancelar
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Apenas supervisores podem cancelar pedidos' }, 403)
    }

    const id = cancelarMatch[1]
    const { motivo, senha } = await getBody(request)

    // Senha obrigatória para cancelamento
    if (!senha) {
      return json({ error: 'Senha de supervisor é obrigatória para cancelar pedidos' }, 400)
    }

    // Validar senha do supervisor logado
    const supervisor = await env.DB.prepare(
      'SELECT senha_hash FROM usuarios WHERE id = ? AND ativo = 1'
    ).bind(user.id).all()

    if (supervisor.results.length === 0) {
      return json({ error: 'Supervisor não encontrado' }, 404)
    }

    const senhaValida = await comparePassword(senha, supervisor.results[0].senha_hash)
    if (!senhaValida) {
      return json({ error: 'Senha de supervisor incorreta' }, 403)
    }

    const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all()
    if (pedido.results.length === 0) return json({ error: 'Pedido não encontrado' }, 404)
    if (pedido.results[0].status === 'pago') return json({ error: 'Não é possível cancelar pedido já pago' }, 400)

    // Return stock for all non-cancelled items
    const itens = await env.DB.prepare(
      "SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = ? AND status != 'cancelado'"
    ).bind(id).all()

    for (const item of itens.results) {
      if (item.produto_id) {
        await env.DB.prepare(
          'UPDATE produtos SET estoque_quantidade = estoque_quantidade + ? WHERE id = ? AND estoque_quantidade IS NOT NULL'
        ).bind(item.quantidade, item.produto_id).run()
      }
    }

    const now = new Date().toISOString()
    const obs = `CANCELADO por ${user.nome}: ${motivo || 'Sem motivo informado'}`
    const currentObs = pedido.results[0].observacao

    await env.DB.prepare(
      "UPDATE pedidos SET status = 'cancelado', observacao = ?, closed_at = ? WHERE id = ?"
    ).bind(currentObs ? currentObs + ' | ' + obs : obs, now, id).run()

    if (pedido.results[0].mesa_id) {
      await env.DB.prepare('UPDATE mesas SET status = ? WHERE id = ?').bind('livre', pedido.results[0].mesa_id).run()
    }

    const updated = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all()
    return json(updated.results[0])
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
