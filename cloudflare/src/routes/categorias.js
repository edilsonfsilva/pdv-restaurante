// Categorias routes for Cloudflare Workers (D1)
import { json, getBody } from '../worker.js'
import { roleMiddleware } from '../middleware/auth.js'

export async function categoriasRoutes(request, env, path, method, user) {
  // GET /api/categorias
  if (path === '' && method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT * FROM categorias WHERE ativo = 1 ORDER BY ordem, nome'
    ).all()
    return json(result.results)
  }

  // GET /api/categorias/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT * FROM categorias WHERE id = ?'
    ).bind(idMatch[1]).all()

    if (result.results.length === 0) {
      return json({ error: 'Categoria não encontrada' }, 404)
    }
    return json(result.results[0])
  }

  // POST /api/categorias
  if (path === '' && method === 'POST') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const { nome, icone, ordem } = await getBody(request)
    if (!nome) return json({ error: 'Nome é obrigatório' }, 400)

    const result = await env.DB.prepare(
      'INSERT INTO categorias (nome, icone, ordem) VALUES (?, ?, ?) RETURNING *'
    ).bind(nome, icone || null, ordem || 0).all()

    return json(result.results[0], 201)
  }

  // PUT /api/categorias/:id
  if (idMatch && method === 'PUT') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]
    const { nome, icone, ordem, ativo } = await getBody(request)

    const result = await env.DB.prepare(
      `UPDATE categorias
       SET nome = COALESCE(?, nome),
           icone = COALESCE(?, icone),
           ordem = COALESCE(?, ordem),
           ativo = COALESCE(?, ativo)
       WHERE id = ?
       RETURNING *`
    ).bind(nome || null, icone || null, ordem !== undefined ? ordem : null, ativo !== undefined ? (ativo ? 1 : 0) : null, id).all()

    if (result.results.length === 0) {
      return json({ error: 'Categoria não encontrada' }, 404)
    }
    return json(result.results[0])
  }

  // DELETE /api/categorias/:id
  if (idMatch && method === 'DELETE') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const result = await env.DB.prepare(
      'UPDATE categorias SET ativo = 0 WHERE id = ? RETURNING *'
    ).bind(idMatch[1]).all()

    if (result.results.length === 0) {
      return json({ error: 'Categoria não encontrada' }, 404)
    }
    return json({ message: 'Categoria desativada', categoria: result.results[0] })
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
