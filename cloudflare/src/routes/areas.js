// Areas routes for Cloudflare Workers (D1)
import { json, getBody } from '../worker.js'
import { roleMiddleware } from '../middleware/auth.js'

export async function areasRoutes(request, env, path, method, user) {
  // GET /api/areas
  if ((path === '' || path === '/') && method === 'GET') {
    const result = await env.DB.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM mesas WHERE area_id = a.id) as total_mesas
      FROM areas a
      WHERE a.ativo = 1
      ORDER BY a.nome
    `).all()

    return json(result.results)
  }

  // GET /api/areas/:id
  const idMatch = path.match(/^\/(\d+)$/)
  if (idMatch && method === 'GET') {
    const id = idMatch[1]
    const area = await env.DB.prepare('SELECT * FROM areas WHERE id = ?').bind(id).all()

    if (area.results.length === 0) {
      return json({ error: 'Área não encontrada' }, 404)
    }

    const mesas = await env.DB.prepare(
      'SELECT * FROM mesas WHERE area_id = ? ORDER BY LENGTH(numero), numero'
    ).bind(id).all()

    return json({ ...area.results[0], mesas: mesas.results })
  }

  // POST /api/areas
  if ((path === '' || path === '/') && method === 'POST') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const { nome, descricao } = await getBody(request)
    if (!nome) return json({ error: 'Nome da área é obrigatório' }, 400)

    try {
      const result = await env.DB.prepare(
        'INSERT INTO areas (nome, descricao) VALUES (?, ?) RETURNING *'
      ).bind(nome, descricao || null).all()

      return json(result.results[0], 201)
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return json({ error: 'Já existe uma área com esse nome' }, 400)
      }
      throw err
    }
  }

  // PUT /api/areas/:id
  if (idMatch && method === 'PUT') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]
    const body = await getBody(request)

    const area = await env.DB.prepare('SELECT * FROM areas WHERE id = ?').bind(id).all()
    if (area.results.length === 0) {
      return json({ error: 'Área não encontrada' }, 404)
    }

    const current = area.results[0]
    const nome = body.nome !== undefined ? body.nome : current.nome
    const descricao = body.descricao !== undefined ? body.descricao : current.descricao
    const ativo = body.ativo !== undefined ? body.ativo : current.ativo

    try {
      const result = await env.DB.prepare(
        "UPDATE areas SET nome = ?, descricao = ?, ativo = ?, updated_at = datetime('now') WHERE id = ? RETURNING *"
      ).bind(nome, descricao, ativo, id).all()

      return json(result.results[0])
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return json({ error: 'Já existe uma área com esse nome' }, 400)
      }
      throw err
    }
  }

  // DELETE /api/areas/:id
  if (idMatch && method === 'DELETE') {
    if (!roleMiddleware(user, 'admin', 'gerente')) {
      return json({ error: 'Acesso negado' }, 403)
    }

    const id = idMatch[1]

    // Check if area has mesas
    const mesas = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM mesas WHERE area_id = ?'
    ).bind(id).all()

    if (mesas.results[0].count > 0) {
      return json({ error: 'Não é possível remover área que possui mesas. Remova ou mova as mesas primeiro.' }, 400)
    }

    const result = await env.DB.prepare(
      'DELETE FROM areas WHERE id = ? RETURNING *'
    ).bind(id).all()

    if (result.results.length === 0) {
      return json({ error: 'Área não encontrada' }, 404)
    }

    return json({ message: 'Área removida', area: result.results[0] })
  }

  return json({ error: 'Rota não encontrada' }, 404)
}
