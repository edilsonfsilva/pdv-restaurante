// Mesas routes for Cloudflare Workers (D1)
import { json, getBody } from '../worker.js'
import { roleMiddleware } from '../middleware/auth.js'

export async function mesasRoutes(request, env, path, method, user) {
  const url = new URL(request.url)

  // GET /api/mesas
  if ((path === '' || path === '/') && method === 'GET') {
    const areaId = url.searchParams.get('area_id')

    let sql = `
      SELECT
        m.*,
        a.nome as area_nome,
        p.id as pedido_id,
        p.total as pedido_total,
        p.created_at as pedido_inicio,
        (SELECT COUNT(*) FROM itens_pedido WHERE pedido_id = p.id) as qtd_itens
      FROM mesas m
      LEFT JOIN areas a ON m.area_id = a.id
      LEFT JOIN pedidos p ON m.id = p.mesa_id AND p.status IN ('aberto', 'producao', 'pronto')
    `

    const binds = []
    if (areaId) {
      sql += ' WHERE m.area_id = ?'
      binds.push(areaId)
    }

    sql += `
      ORDER BY
        CASE WHEN m.numero = 'BAL' THEN 1 ELSE 0 END,
        LENGTH(m.numero),
        m.numero
    `

    const result = await env.DB.prepare(sql).bind(...binds).all()
    return json(result.results)
  }

  // PUT /api/mesas/:id/status
  const statusMatch = path.match(/^\/(\d+)\/status$/)
  if (statusMatch && method === 'PUT') {
    const id = statusMatch[1]
    const { status } = await getBody(request)

    if (!['livre', 'ocupada', 'reservada'].includes(status)) {
      return json({ error: 'Status inválido' }, 400)
    }

    const result = await env.DB.prepare(
      'UPDATE mesas SET status = ? WHERE id = ? RETURNING *'
    ).bind(status, id).all()

    if (result.results.length === 0) {
      return json({ error: 'Mesa não encontrada' }, 404)
    }

    return json(result.results[0])
  }

  // GET /api/mesas/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'GET') {
    const id = idMatch[1]
    const mesa = await env.DB.prepare(`
      SELECT m.*, a.nome as area_nome
      FROM mesas m
      LEFT JOIN areas a ON m.area_id = a.id
      WHERE m.id = ?
    `).bind(id).all()

    if (mesa.results.length === 0) {
      return json({ error: 'Mesa não encontrada' }, 404)
    }

    // Get active order with items
    const pedido = await env.DB.prepare(`
      SELECT p.*
      FROM pedidos p
      WHERE p.mesa_id = ? AND p.status IN ('aberto', 'producao', 'pronto')
      LIMIT 1
    `).bind(id).all()

    let pedidoData = null
    if (pedido.results.length > 0) {
      const itens = await env.DB.prepare(`
        SELECT id, produto_nome, quantidade, preco_unitario, subtotal, observacao, status
        FROM itens_pedido
        WHERE pedido_id = ?
        ORDER BY created_at
      `).bind(pedido.results[0].id).all()

      pedidoData = { ...pedido.results[0], itens: itens.results }
    }

    return json({ ...mesa.results[0], pedido: pedidoData })
  }

  // POST /api/mesas
  if ((path === '' || path === '/') && method === 'POST') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const { numero, capacidade, localizacao, area_id } = await getBody(request)
    if (!numero) return json({ error: 'Número da mesa é obrigatório' }, 400)

    try {
      const result = await env.DB.prepare(
        'INSERT INTO mesas (numero, capacidade, localizacao, area_id) VALUES (?, ?, ?, ?) RETURNING *'
      ).bind(numero, capacidade || 4, localizacao || 'salao', area_id || null).all()

      return json(result.results[0], 201)
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return json({ error: 'Já existe uma mesa com esse número' }, 400)
      }
      throw err
    }
  }

  // PUT /api/mesas/:id — Edit mesa (numero, capacidade, area_id)
  if (idMatch && method === 'PUT') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]
    const body = await getBody(request)

    const mesa = await env.DB.prepare('SELECT * FROM mesas WHERE id = ?').bind(id).all()
    if (mesa.results.length === 0) {
      return json({ error: 'Mesa não encontrada' }, 404)
    }

    const current = mesa.results[0]
    const numero = body.numero !== undefined ? body.numero : current.numero
    const capacidade = body.capacidade !== undefined ? body.capacidade : current.capacidade
    const localizacao = body.localizacao !== undefined ? body.localizacao : current.localizacao
    // area_id can be explicitly set to null
    const area_id = body.hasOwnProperty('area_id') ? body.area_id : current.area_id

    try {
      const result = await env.DB.prepare(
        'UPDATE mesas SET numero = ?, capacidade = ?, localizacao = ?, area_id = ? WHERE id = ? RETURNING *'
      ).bind(numero, capacidade, localizacao, area_id, id).all()

      return json(result.results[0])
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return json({ error: 'Já existe uma mesa com esse número' }, 400)
      }
      throw err
    }
  }

  // DELETE /api/mesas/:id
  if (idMatch && method === 'DELETE') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]

    const pedidoAtivo = await env.DB.prepare(
      "SELECT id FROM pedidos WHERE mesa_id = ? AND status IN ('aberto', 'producao', 'pronto')"
    ).bind(id).all()

    if (pedidoAtivo.results.length > 0) {
      return json({ error: 'Não é possível remover mesa com pedido ativo' }, 400)
    }

    const result = await env.DB.prepare(
      'DELETE FROM mesas WHERE id = ? RETURNING *'
    ).bind(id).all()

    if (result.results.length === 0) {
      return json({ error: 'Mesa não encontrada' }, 404)
    }

    return json({ message: 'Mesa removida', mesa: result.results[0] })
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
