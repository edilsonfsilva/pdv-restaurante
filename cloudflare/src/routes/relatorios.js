// Relatorios routes for Cloudflare Workers (D1 / SQLite)
import { json, getParams } from '../worker.js'

export async function relatoriosRoutes(request, env, path, method, user) {
  const params = getParams(request.url)

  // GET /api/relatorios/vendas
  if (path === '/vendas' && method === 'GET') {
    const { periodo = 'day', data_inicio, data_fim } = params

    // SQLite date truncation
    const truncMap = {
      day: '%Y-%m-%d', diario: '%Y-%m-%d',
      week: '%Y-%W', semanal: '%Y-%W',
      month: '%Y-%m', mensal: '%Y-%m'
    }
    const truncFormat = truncMap[periodo] || '%Y-%m-%d'

    let whereClause = "WHERE p.status = 'pago'"
    let binds = []

    if (data_inicio) {
      binds.push(data_inicio)
      whereClause += ' AND p.closed_at >= ?'
    }
    if (data_fim) {
      binds.push(data_fim + ' 23:59:59')
      whereClause += ' AND p.closed_at <= ?'
    }

    const result = await env.DB.prepare(`
      SELECT
        strftime('${truncFormat}', p.closed_at) as periodo,
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio,
        COALESCE(SUM(p.subtotal), 0) as subtotal,
        COALESCE(SUM(p.taxa_servico), 0) as taxa_servico,
        COALESCE(SUM(p.desconto), 0) as descontos
      FROM pedidos p
      ${whereClause}
      GROUP BY strftime('${truncFormat}', p.closed_at)
      ORDER BY periodo DESC
    `).bind(...binds).all()

    const totais = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio
      FROM pedidos p
      ${whereClause}
    `).bind(...binds).all()

    return json({
      periodos: result.results,
      totais: totais.results[0],
    })
  }

  // GET /api/relatorios/produtos
  if (path === '/produtos' && method === 'GET') {
    const { data_inicio, data_fim, limit = '20' } = params

    let whereClause = "WHERE p.status = 'pago' AND ip.status != 'cancelado'"
    let binds = []

    if (data_inicio) { binds.push(data_inicio); whereClause += ' AND p.closed_at >= ?' }
    if (data_fim) { binds.push(data_fim + ' 23:59:59'); whereClause += ' AND p.closed_at <= ?' }

    binds.push(parseInt(limit))

    const result = await env.DB.prepare(`
      SELECT
        ip.produto_nome,
        ip.produto_id,
        SUM(ip.quantidade) as total_vendido,
        COALESCE(SUM(ip.subtotal), 0) as receita,
        COUNT(DISTINCT ip.pedido_id) as num_pedidos,
        ROUND(AVG(ip.preco_unitario), 2) as preco_medio
      FROM itens_pedido ip
      INNER JOIN pedidos p ON ip.pedido_id = p.id
      ${whereClause}
      GROUP BY ip.produto_nome, ip.produto_id
      ORDER BY total_vendido DESC
      LIMIT ?
    `).bind(...binds).all()

    return json(result.results)
  }

  // GET /api/relatorios/categorias
  if (path === '/categorias' && method === 'GET') {
    const { data_inicio, data_fim } = params

    let whereClause = "WHERE p.status = 'pago' AND ip.status != 'cancelado'"
    let binds = []

    if (data_inicio) { binds.push(data_inicio); whereClause += ' AND p.closed_at >= ?' }
    if (data_fim) { binds.push(data_fim + ' 23:59:59'); whereClause += ' AND p.closed_at <= ?' }

    const result = await env.DB.prepare(`
      SELECT
        c.nome as categoria,
        c.icone,
        SUM(ip.quantidade) as itens_vendidos,
        COALESCE(SUM(ip.subtotal), 0) as receita,
        COUNT(DISTINCT ip.pedido_id) as num_pedidos
      FROM itens_pedido ip
      INNER JOIN produtos pr ON ip.produto_id = pr.id
      INNER JOIN categorias c ON pr.categoria_id = c.id
      INNER JOIN pedidos p ON ip.pedido_id = p.id
      ${whereClause}
      GROUP BY c.id, c.nome, c.icone
      ORDER BY receita DESC
    `).bind(...binds).all()

    return json(result.results)
  }

  // GET /api/relatorios/garcons
  if (path === '/garcons' && method === 'GET') {
    const { data_inicio, data_fim } = params

    let whereClause = "WHERE p.status = 'pago' AND p.garcom_id IS NOT NULL"
    let binds = []

    if (data_inicio) { binds.push(data_inicio); whereClause += ' AND p.closed_at >= ?' }
    if (data_fim) { binds.push(data_fim + ' 23:59:59'); whereClause += ' AND p.closed_at <= ?' }

    const result = await env.DB.prepare(`
      SELECT
        u.id as garcom_id,
        u.nome as garcom,
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio
      FROM pedidos p
      INNER JOIN usuarios u ON p.garcom_id = u.id
      ${whereClause}
      GROUP BY u.id, u.nome
      ORDER BY receita_total DESC
    `).bind(...binds).all()

    return json(result.results)
  }

  // GET /api/relatorios/horarios
  if (path === '/horarios' && method === 'GET') {
    const { data_inicio, data_fim } = params

    let whereClause = "WHERE p.status = 'pago'"
    let binds = []

    if (data_inicio) { binds.push(data_inicio); whereClause += ' AND p.closed_at >= ?' }
    if (data_fim) { binds.push(data_fim + ' 23:59:59'); whereClause += ' AND p.closed_at <= ?' }

    const result = await env.DB.prepare(`
      SELECT
        CAST(strftime('%H', p.created_at) AS INTEGER) as hora,
        COUNT(*) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita
      FROM pedidos p
      ${whereClause}
      GROUP BY strftime('%H', p.created_at)
      ORDER BY hora
    `).bind(...binds).all()

    return json(result.results)
  }

  // GET /api/relatorios/formas-pagamento
  if (path === '/formas-pagamento' && method === 'GET') {
    const { data_inicio, data_fim } = params

    let whereClause = 'WHERE 1=1'
    let binds = []

    if (data_inicio) { binds.push(data_inicio); whereClause += ' AND pg.created_at >= ?' }
    if (data_fim) { binds.push(data_fim + ' 23:59:59'); whereClause += ' AND pg.created_at <= ?' }

    const result = await env.DB.prepare(`
      SELECT
        pg.forma,
        COUNT(*) as quantidade,
        COALESCE(SUM(pg.valor), 0) as total
      FROM pagamentos pg
      ${whereClause}
      GROUP BY pg.forma
      ORDER BY total DESC
    `).bind(...binds).all()

    return json(result.results)
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
