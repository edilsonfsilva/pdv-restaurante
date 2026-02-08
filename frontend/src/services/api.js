const API_URL = '/api'

async function request(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  }

  // Add auth token if available
  const token = localStorage.getItem('pdv_token')
  if (token) {
    config.headers = {
      ...config.headers,
      'Authorization': `Bearer ${token}`,
    }
  }

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body)
  }

  let response
  try {
    response = await fetch(`${API_URL}${endpoint}`, config)
  } catch (err) {
    throw new Error('Sem conexão com o servidor. Verifique se o backend está rodando.')
  }

  // Handle 401 - redirect to login
  if (response.status === 401) {
    localStorage.removeItem('pdv_token')
    window.location.href = '/login'
    return
  }

  // Handle 429 - rate limit
  if (response.status === 429) {
    throw new Error('Muitas requisições. Aguarde um momento.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// Auth
export const login = (email, senha) =>
  request('/auth/login', { method: 'POST', body: { email, senha } })

export const getMe = () => request('/auth/me')

export const registrarUsuario = (data) =>
  request('/auth/registro', { method: 'POST', body: data })

export const getUsuarios = () => request('/auth/usuarios')

export const atualizarUsuario = (id, data) =>
  request(`/auth/usuarios/${id}`, { method: 'PUT', body: data })

// Categorias
export const getCategorias = () => request('/categorias')

// Produtos
export const getProdutos = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/produtos${query ? `?${query}` : ''}`)
}

export const getCardapio = () => request('/produtos/cardapio')

// Mesas
export const getMesas = () => request('/mesas')
export const getMesa = (id) => request(`/mesas/${id}`)
export const updateMesaStatus = (id, status) =>
  request(`/mesas/${id}/status`, { method: 'PUT', body: { status } })

// Pedidos
export const getPedidos = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/pedidos${query ? `?${query}` : ''}`)
}

export const getPedido = (id) => request(`/pedidos/${id}`)

export const getPedidosCozinha = () => request('/pedidos/cozinha')

export const criarPedido = (data) =>
  request('/pedidos', { method: 'POST', body: data })

export const adicionarItem = (pedidoId, data) =>
  request(`/pedidos/${pedidoId}/itens`, { method: 'POST', body: data })

export const atualizarItemStatus = (pedidoId, itemId, status) =>
  request(`/pedidos/${pedidoId}/itens/${itemId}/status`, {
    method: 'PUT',
    body: { status }
  })

export const removerItem = (pedidoId, itemId) =>
  request(`/pedidos/${pedidoId}/itens/${itemId}`, { method: 'DELETE' })

export const fecharPedido = (id) =>
  request(`/pedidos/${id}/fechar`, { method: 'PUT' })

export const cancelarPedido = (id, { motivo, senha }) =>
  request(`/pedidos/${id}/cancelar`, { method: 'PUT', body: { motivo, senha } })

// Pagamentos
export const getPagamentos = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/pagamentos${query ? `?${query}` : ''}`)
}

export const getResumoPagamentos = (data) =>
  request(`/pagamentos/resumo${data ? `?data=${data}` : ''}`)

export const registrarPagamento = (data) =>
  request('/pagamentos', { method: 'POST', body: data })

export const estornarPagamento = (id) =>
  request(`/pagamentos/${id}`, { method: 'DELETE' })

// Relatorios
export const getRelatorioVendas = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/vendas${query ? `?${query}` : ''}`)
}

export const getRelatorioProdutos = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/produtos${query ? `?${query}` : ''}`)
}

export const getRelatorioCategorias = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/categorias${query ? `?${query}` : ''}`)
}

export const getRelatorioGarcons = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/garcons${query ? `?${query}` : ''}`)
}

export const getRelatorioHorarios = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/horarios${query ? `?${query}` : ''}`)
}

export const getRelatorioFormasPagamento = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/relatorios/formas-pagamento${query ? `?${query}` : ''}`)
}

// Estoque
export const getEstoque = (params = {}) => {
  const query = new URLSearchParams(params).toString()
  return request(`/estoque${query ? `?${query}` : ''}`)
}

export const getAlertasEstoque = () => request('/estoque/alertas')

export const updateEstoque = (produtoId, data) =>
  request(`/estoque/${produtoId}`, { method: 'PUT', body: data })

export const ativarEstoque = (produtoId, data) =>
  request(`/estoque/${produtoId}/ativar`, { method: 'POST', body: data })

export const desativarEstoque = (produtoId) =>
  request(`/estoque/${produtoId}/desativar`, { method: 'POST' })

// Produtos CRUD
export const criarProduto = (data) =>
  request('/produtos', { method: 'POST', body: data })

export const atualizarProduto = (id, data) =>
  request(`/produtos/${id}`, { method: 'PUT', body: data })

export const deletarProduto = (id) =>
  request(`/produtos/${id}`, { method: 'DELETE' })
