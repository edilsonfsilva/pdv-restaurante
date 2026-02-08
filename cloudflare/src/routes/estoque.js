// Estoque routes for Cloudflare Workers (D1)
import { json, getBody, getParams } from '../worker.js'

export async function estoqueRoutes(request, env, path, method, user) {
  // GET /api/estoque/alertas - Produtos abaixo do mínimo
  if (path === '/alertas' && method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT p.id, p.codigo, p.nome, p.estoque_quantidade, p.estoque_minimo,
        c.nome as categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estoque_quantidade IS NOT NULL
        AND p.estoque_minimo IS NOT NULL
        AND p.estoque_quantidade <= p.estoque_minimo
        AND p.ativo = 1
      ORDER BY (p.estoque_quantidade - p.estoque_minimo) ASC
    `).all()

    return json(result.results)
  }

  // GET /api/estoque - Listar produtos com estoque
  if ((path === '' || path === '/') && method === 'GET') {
    const params = getParams(request.url)
    const { baixo_estoque, busca } = params

    let whereClauses = ['p.estoque_quantidade IS NOT NULL']
    let binds = []

    if (baixo_estoque === 'true') {
      whereClauses.push('p.estoque_quantidade <= p.estoque_minimo')
    }

    if (busca) {
      binds.push(`%${busca}%`, `%${busca}%`)
      whereClauses.push('(p.nome LIKE ? OR p.codigo LIKE ?)')
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const result = await env.DB.prepare(`
      SELECT p.id, p.codigo, p.nome, p.preco, p.ativo,
        p.estoque_quantidade, p.estoque_minimo,
        c.nome as categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      ${whereStr}
      ORDER BY
        CASE WHEN p.estoque_quantidade <= COALESCE(p.estoque_minimo, 0) THEN 0 ELSE 1 END,
        p.nome
    `).bind(...binds).all()

    return json(result.results)
  }

  // PUT /api/estoque/:produtoId - Ajustar estoque manualmente
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'PUT') {
    const produtoId = idMatch[1]
    const body = await getBody(request)
    const { quantidade, estoque_quantidade, estoque_minimo } = body

    // Support both 'quantidade' and 'estoque_quantidade' field names
    const qty = estoque_quantidade !== undefined ? estoque_quantidade : quantidade

    if (qty === undefined && estoque_minimo === undefined) {
      return json({ error: 'Informe quantidade ou estoque_minimo' }, 400)
    }

    const fields = []
    const values = []

    if (qty !== undefined) {
      if (qty < 0) return json({ error: 'Quantidade não pode ser negativa' }, 400)
      fields.push('estoque_quantidade = ?')
      values.push(qty)
    }

    if (estoque_minimo !== undefined) {
      if (estoque_minimo < 0) return json({ error: 'Estoque mínimo não pode ser negativo' }, 400)
      fields.push('estoque_minimo = ?')
      values.push(estoque_minimo)
    }

    values.push(produtoId)

    const result = await env.DB.prepare(
      `UPDATE produtos SET ${fields.join(', ')}
       WHERE id = ?
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`
    ).bind(...values).all()

    if (result.results.length === 0) return json({ error: 'Produto não encontrado' }, 404)

    return json(result.results[0])
  }

  // POST /api/estoque/:produtoId/ativar - Ativar controle de estoque
  const ativarMatch = path.match(/^\/(\d+)\/ativar$/)
  if (ativarMatch && method === 'POST') {
    const produtoId = ativarMatch[1]
    const { quantidade = 0, estoque_minimo = 5 } = await getBody(request)

    const result = await env.DB.prepare(
      `UPDATE produtos
       SET estoque_quantidade = ?, estoque_minimo = ?
       WHERE id = ?
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`
    ).bind(quantidade, estoque_minimo, produtoId).all()

    if (result.results.length === 0) return json({ error: 'Produto não encontrado' }, 404)

    return json(result.results[0])
  }

  // POST /api/estoque/:produtoId/desativar - Desativar controle de estoque
  const desativarMatch = path.match(/^\/(\d+)\/desativar$/)
  if (desativarMatch && method === 'POST') {
    const produtoId = desativarMatch[1]

    const result = await env.DB.prepare(
      `UPDATE produtos
       SET estoque_quantidade = NULL, estoque_minimo = NULL
       WHERE id = ?
       RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`
    ).bind(produtoId).all()

    if (result.results.length === 0) return json({ error: 'Produto não encontrado' }, 404)

    return json(result.results[0])
  }

  // PUT /api/estoque/:produtoId/controle - Toggle controle de estoque
  const controleMatch = path.match(/^\/(\d+)\/controle$/)
  if (controleMatch && method === 'PUT') {
    const produtoId = controleMatch[1]
    const { controle_estoque } = await getBody(request)

    let result
    if (controle_estoque) {
      result = await env.DB.prepare(
        `UPDATE produtos
         SET estoque_quantidade = COALESCE(estoque_quantidade, 0), estoque_minimo = COALESCE(estoque_minimo, 5)
         WHERE id = ?
         RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`
      ).bind(produtoId).all()
    } else {
      result = await env.DB.prepare(
        `UPDATE produtos
         SET estoque_quantidade = NULL, estoque_minimo = NULL
         WHERE id = ?
         RETURNING id, nome, codigo, estoque_quantidade, estoque_minimo`
      ).bind(produtoId).all()
    }

    if (result.results.length === 0) return json({ error: 'Produto não encontrado' }, 404)

    return json(result.results[0])
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
