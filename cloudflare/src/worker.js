// PDV Restaurante - Cloudflare Worker (Backend API + Frontend SPA)
import { authRoutes } from './routes/auth.js'
import { categoriasRoutes } from './routes/categorias.js'
import { produtosRoutes } from './routes/produtos.js'
import { mesasRoutes } from './routes/mesas.js'
import { pedidosRoutes } from './routes/pedidos.js'
import { pagamentosRoutes } from './routes/pagamentos.js'
import { relatoriosRoutes } from './routes/relatorios.js'
import { authMiddleware, roleMiddleware } from './middleware/auth.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      const response = await handleAPI(request, env, url)
      // Add CORS headers
      const headers = new Headers(response.headers)
      for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v)
      return new Response(response.body, { status: response.status, headers })
    }

    // Serve frontend static assets (SPA)
    return env.ASSETS.fetch(request)
  },
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

async function handleAPI(request, env, url) {
  const path = url.pathname.replace('/api', '')
  const method = request.method

  try {
    // Health check
    if (path === '/health' && method === 'GET') {
      return json({ status: 'ok', timestamp: new Date().toISOString(), database: 'D1' })
    }

    // Auth routes (public)
    if (path.startsWith('/auth/')) {
      return authRoutes(request, env, path.replace('/auth', ''), method)
    }

    // Protected routes - require auth
    const user = await authMiddleware(request, env)
    if (!user) return json({ error: 'Token não fornecido ou inválido' }, 401)

    // Categorias
    if (path.startsWith('/categorias')) {
      return categoriasRoutes(request, env, path.replace('/categorias', ''), method, user)
    }

    // Produtos
    if (path.startsWith('/produtos')) {
      return produtosRoutes(request, env, path.replace('/produtos', ''), method, user)
    }

    // Mesas
    if (path.startsWith('/mesas')) {
      return mesasRoutes(request, env, path.replace('/mesas', ''), method, user)
    }

    // Pedidos
    if (path.startsWith('/pedidos')) {
      return pedidosRoutes(request, env, path.replace('/pedidos', ''), method, user)
    }

    // Pagamentos
    if (path.startsWith('/pagamentos')) {
      return pagamentosRoutes(request, env, path.replace('/pagamentos', ''), method, user)
    }

    // Relatorios (admin/gerente only)
    if (path.startsWith('/relatorios')) {
      if (!roleMiddleware(user, 'admin', 'gerente')) {
        return json({ error: 'Acesso negado' }, 403)
      }
      return relatoriosRoutes(request, env, path.replace('/relatorios', ''), method, user)
    }

    return json({ error: 'Rota não encontrada' }, 404)
  } catch (err) {
    console.error('API Error:', err)
    return json({ error: err.message || 'Erro interno' }, 500)
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function getBody(request) {
  return request.json().catch(() => ({}))
}

export function getParams(url) {
  return Object.fromEntries(new URL(url).searchParams)
}
