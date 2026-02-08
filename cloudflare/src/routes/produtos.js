// Produtos routes for Cloudflare Workers (D1)
import { json, getBody, getParams } from '../worker.js'
import { roleMiddleware } from '../middleware/auth.js'

export async function produtosRoutes(request, env, path, method, user) {
  const url = new URL(request.url)

  // GET /api/produtos/cardapio - must be before /:id
  if (path === '/cardapio' && method === 'GET') {
    const categorias = await env.DB.prepare(
      'SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem, nome'
    ).all()

    const produtos = await env.DB.prepare(
      'SELECT * FROM produtos WHERE ativo = 1 ORDER BY nome'
    ).all()

    const cardapio = categorias.results.map(cat => ({
      ...cat,
      produtos: produtos.results.filter(p => p.categoria_id === cat.id)
    }))

    return json(cardapio)
  }

  // GET /api/produtos
  if (path === '' && method === 'GET') {
    const params = getParams(request.url)
    const { categoria_id, ativo, busca, page = '1', limit = '50' } = params
    const offset = (parseInt(page) - 1) * parseInt(limit)

    let whereClauses = []
    let binds = []

    if (categoria_id) {
      binds.push(parseInt(categoria_id))
      whereClauses.push('p.categoria_id = ?')
    }

    if (ativo !== undefined) {
      binds.push(ativo === 'true' ? 1 : 0)
      whereClauses.push('p.ativo = ?')
    } else {
      whereClauses.push('p.ativo = 1')
    }

    if (busca) {
      binds.push(`%${busca}%`, `%${busca}%`)
      whereClauses.push('(p.nome LIKE ? OR p.codigo LIKE ?)')
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM produtos p ${whereStr}`
    ).bind(...binds).all()
    const total = countResult.results[0].total

    const dataBinds = [...binds, parseInt(limit), offset]
    const result = await env.DB.prepare(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ${whereStr}
       ORDER BY c.ordem, p.nome
       LIMIT ? OFFSET ?`
    ).bind(...dataBinds).all()

    return json({
      data: result.results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    })
  }

  // GET /api/produtos/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'GET') {
    const result = await env.DB.prepare(
      `SELECT p.*, c.nome as categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = ?`
    ).bind(idMatch[1]).all()

    if (result.results.length === 0) {
      return json({ error: 'Produto não encontrado' }, 404)
    }
    return json(result.results[0])
  }

  // POST /api/produtos
  if (path === '' && method === 'POST') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const { categoria_id, codigo, nome, descricao, preco, tempo_preparo } = await getBody(request)

    if (!nome || !preco) {
      return json({ error: 'Nome e preço são obrigatórios' }, 400)
    }

    if (parseFloat(preco) <= 0) {
      return json({ error: 'Preço deve ser maior que zero' }, 400)
    }

    const result = await env.DB.prepare(
      `INSERT INTO produtos (categoria_id, codigo, nome, descricao, preco, tempo_preparo)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`
    ).bind(categoria_id || null, codigo || null, nome, descricao || null, preco, tempo_preparo || 15).all()

    return json(result.results[0], 201)
  }

  // PUT /api/produtos/:id
  if (idMatch && method === 'PUT') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]
    const { categoria_id, codigo, nome, descricao, preco, tempo_preparo, ativo } = await getBody(request)

    const result = await env.DB.prepare(
      `UPDATE produtos
       SET categoria_id = COALESCE(?, categoria_id),
           codigo = COALESCE(?, codigo),
           nome = COALESCE(?, nome),
           descricao = COALESCE(?, descricao),
           preco = COALESCE(?, preco),
           tempo_preparo = COALESCE(?, tempo_preparo),
           ativo = COALESCE(?, ativo)
       WHERE id = ?
       RETURNING *`
    ).bind(
      categoria_id || null, codigo || null, nome || null,
      descricao || null, preco || null, tempo_preparo || null,
      ativo !== undefined ? (ativo ? 1 : 0) : null, id
    ).all()

    if (result.results.length === 0) {
      return json({ error: 'Produto não encontrado' }, 404)
    }
    return json(result.results[0])
  }

  // DELETE /api/produtos/:id
  if (idMatch && method === 'DELETE') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const result = await env.DB.prepare(
      'UPDATE produtos SET ativo = 0 WHERE id = ? RETURNING *'
    ).bind(idMatch[1]).all()

    if (result.results.length === 0) {
      return json({ error: 'Produto não encontrado' }, 404)
    }
    return json({ message: 'Produto desativado', produto: result.results[0] })
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
