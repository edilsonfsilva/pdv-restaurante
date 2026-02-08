// Pagamentos routes for Cloudflare Workers (D1)
import { json, getBody, getParams } from '../worker.js'

export async function pagamentosRoutes(request, env, path, method, user) {
  const url = new URL(request.url)

  // GET /api/pagamentos/resumo - must be before /:id
  if (path === '/resumo' && method === 'GET') {
    const params = getParams(request.url)
    const dataFiltro = params.data || new Date().toISOString().split('T')[0]

    const result = await env.DB.prepare(`
      SELECT
        forma,
        COUNT(*) as quantidade,
        COALESCE(SUM(valor), 0) as total
      FROM pagamentos
      WHERE DATE(created_at) = ?
      GROUP BY forma
      ORDER BY total DESC
    `).bind(dataFiltro).all()

    const totalGeral = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT pedido_id) as pedidos,
        COALESCE(SUM(valor), 0) as total
      FROM pagamentos
      WHERE DATE(created_at) = ?
    `).bind(dataFiltro).all()

    return json({
      data: dataFiltro,
      por_forma: result.results,
      total_pedidos: parseInt(totalGeral.results[0].pedidos) || 0,
      total_geral: parseFloat(totalGeral.results[0].total) || 0
    })
  }

  // GET /api/pagamentos
  if ((path === '' || path === '/') && method === 'GET') {
    const params = getParams(request.url)
    const { pedido_id, forma, data_inicio, data_fim, page = '1', limit = '50' } = params
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let whereClauses = []
    let binds = []

    if (pedido_id) { binds.push(pedido_id); whereClauses.push('pg.pedido_id = ?') }
    if (forma) { binds.push(forma); whereClauses.push('pg.forma = ?') }
    if (data_inicio) { binds.push(data_inicio); whereClauses.push('pg.created_at >= ?') }
    if (data_fim) { binds.push(data_fim); whereClauses.push('pg.created_at <= ?') }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM pagamentos pg ${whereStr}`
    ).bind(...binds).all()
    const total = countResult.results[0].total

    const dataBinds = [...binds, parseInt(limit), offset]
    const result = await env.DB.prepare(`
      SELECT pg.*, p.mesa_id, m.numero as mesa_numero
      FROM pagamentos pg
      INNER JOIN pedidos p ON pg.pedido_id = p.id
      LEFT JOIN mesas m ON p.mesa_id = m.id
      ${whereStr}
      ORDER BY pg.created_at DESC
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

  // POST /api/pagamentos
  if ((path === '' || path === '/') && method === 'POST') {
    const { pedido_id, forma, valor, troco = 0, observacao } = await getBody(request)

    if (!pedido_id || !forma || !valor) {
      return json({ error: 'Pedido, forma e valor são obrigatórios' }, 400)
    }

    if (parseFloat(valor) <= 0) {
      return json({ error: 'Valor deve ser maior que zero' }, 400)
    }

    if (!['dinheiro', 'pix', 'credito', 'debito', 'voucher'].includes(forma)) {
      return json({ error: 'Forma de pagamento inválida' }, 400)
    }

    const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(pedido_id).all()
    if (pedido.results.length === 0) return json({ error: 'Pedido não encontrado' }, 404)
    if (pedido.results[0].status === 'pago') return json({ error: 'Pedido já está pago' }, 400)
    if (pedido.results[0].status === 'cancelado') return json({ error: 'Não é possível pagar pedido cancelado' }, 400)

    const totalPago = await env.DB.prepare(
      'SELECT COALESCE(SUM(valor), 0) as total FROM pagamentos WHERE pedido_id = ?'
    ).bind(pedido_id).all()

    const valorRestante = parseFloat(pedido.results[0].total) - parseFloat(totalPago.results[0].total)

    if (parseFloat(valor) > valorRestante + 0.01) {
      return json({ error: 'Valor excede o restante', valor_restante: valorRestante.toFixed(2) }, 400)
    }

    const result = await env.DB.prepare(
      `INSERT INTO pagamentos (pedido_id, forma, valor, troco, observacao)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`
    ).bind(pedido_id, forma, valor, troco, observacao || null).all()

    const novoTotalPago = parseFloat(totalPago.results[0].total) + parseFloat(valor)
    const pagamentoCompleto = novoTotalPago >= parseFloat(pedido.results[0].total)

    return json({
      pagamento: result.results[0],
      pedido_total: pedido.results[0].total,
      total_pago: novoTotalPago.toFixed(2),
      restante: Math.max(0, parseFloat(pedido.results[0].total) - novoTotalPago).toFixed(2),
      pagamento_completo: pagamentoCompleto
    }, 201)
  }

  // DELETE /api/pagamentos/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'DELETE') {
    const id = idMatch[1]

    const pagamento = await env.DB.prepare('SELECT * FROM pagamentos WHERE id = ?').bind(id).all()
    if (pagamento.results.length === 0) return json({ error: 'Pagamento não encontrado' }, 404)

    const pedido = await env.DB.prepare('SELECT status FROM pedidos WHERE id = ?').bind(pagamento.results[0].pedido_id).all()
    if (pedido.results[0].status === 'pago') {
      return json({ error: 'Não é possível estornar pagamento de pedido já fechado' }, 400)
    }

    const result = await env.DB.prepare('DELETE FROM pagamentos WHERE id = ? RETURNING *').bind(id).all()

    return json({ message: 'Pagamento estornado', pagamento: result.results[0] })
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
