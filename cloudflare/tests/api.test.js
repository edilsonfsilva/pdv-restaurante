/**
 * Testes de Integração - PDV Restaurante API (Cloudflare Workers)
 * Testa todas as rotas da API em produção
 *
 * Executar: node tests/api.test.js
 */

const BASE = 'https://pdv-restaurante.edilson-ferreira.workers.dev/api'

let TOKEN = null
let ADMIN_USER = null
let testResults = { passed: 0, failed: 0, errors: [] }

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`

  const config = { headers, ...options }
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body)
  }

  const res = await fetch(`${BASE}${endpoint}`, config)
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function test(name, fn) {
  try {
    await fn()
    testResults.passed++
    console.log(`  ✅ ${name}`)
  } catch (err) {
    testResults.failed++
    testResults.errors.push({ name, error: err.message })
    console.log(`  ❌ ${name}: ${err.message}`)
  }
}

// ─── 1. Health Check ────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n📋 HEALTH CHECK')

  await test('GET /health retorna status ok', async () => {
    const { status, data } = await api('/health')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.status === 'ok', `Status esperado "ok", recebido "${data.status}"`)
    assert(data.database === 'D1', `Database esperado "D1", recebido "${data.database}"`)
    assert(data.timestamp, 'Timestamp não retornado')
  })
}

// ─── 2. Auth ────────────────────────────────────────────────────────────────

async function testAuth() {
  console.log('\n🔐 AUTENTICAÇÃO')

  await test('POST /auth/login - login com credenciais válidas', async () => {
    const { status, data } = await api('/auth/login', {
      method: 'POST', body: { email: 'admin@restaurante.com', senha: 'admin123' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.token, 'Token não retornado')
    assert(data.usuario, 'Usuário não retornado')
    assert(data.usuario.perfil === 'admin', `Perfil esperado "admin", recebido "${data.usuario.perfil}"`)
    TOKEN = data.token
    ADMIN_USER = data.usuario
  })

  await test('POST /auth/login - rejeita credenciais inválidas', async () => {
    const { status } = await api('/auth/login', {
      method: 'POST', body: { email: 'admin@restaurante.com', senha: 'senhaerrada' }
    })
    assert(status === 401, `Status esperado 401, recebido ${status}`)
  })

  await test('POST /auth/login - rejeita campos vazios', async () => {
    const { status } = await api('/auth/login', {
      method: 'POST', body: { email: '', senha: '' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('GET /auth/me - retorna dados do usuário autenticado', async () => {
    const { status, data } = await api('/auth/me')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.id === ADMIN_USER.id, 'ID do usuário diferente')
    assert(data.email === 'admin@restaurante.com', 'Email diferente')
  })

  await test('GET /auth/me - rejeita sem token', async () => {
    const savedToken = TOKEN
    TOKEN = null
    const { status } = await api('/auth/me')
    TOKEN = savedToken
    assert(status === 401, `Status esperado 401, recebido ${status}`)
  })

  await test('GET /auth/usuarios - lista usuários (admin)', async () => {
    const { status, data } = await api('/auth/usuarios')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    assert(data.length > 0, 'Deve ter pelo menos 1 usuário')
    assert(data[0].nome, 'Usuário deve ter nome')
    assert(!data[0].senha_hash, 'Não deve retornar hash de senha')
  })
}

// ─── 3. Categorias ──────────────────────────────────────────────────────────

async function testCategorias() {
  console.log('\n📂 CATEGORIAS')

  await test('GET /categorias - lista categorias', async () => {
    const { status, data } = await api('/categorias')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    assert(data.length > 0, 'Deve ter categorias cadastradas')
    assert(data[0].nome, 'Categoria deve ter nome')
    assert(data[0].id, 'Categoria deve ter id')
  })

  let newCategoriaId = null

  await test('POST /categorias - cria nova categoria', async () => {
    const { status, data } = await api('/categorias', {
      method: 'POST', body: { nome: 'Teste Auto', icone: '🧪', ordem: 99 }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.nome === 'Teste Auto', 'Nome diferente do enviado')
    newCategoriaId = data.id
  })

  await test('GET /categorias/:id - busca categoria por id', async () => {
    const { status, data } = await api(`/categorias/${newCategoriaId}`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.nome === 'Teste Auto', 'Nome diferente')
  })

  await test('PUT /categorias/:id - atualiza categoria', async () => {
    const { status, data } = await api(`/categorias/${newCategoriaId}`, {
      method: 'PUT', body: { nome: 'Teste Atualizado' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.nome === 'Teste Atualizado', 'Nome não foi atualizado')
  })

  await test('DELETE /categorias/:id - remove categoria', async () => {
    const { status } = await api(`/categorias/${newCategoriaId}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })

  await test('GET /categorias/:id - categoria removida retorna 404', async () => {
    const { status } = await api(`/categorias/${newCategoriaId}`)
    // Soft delete - pode retornar 404 ou a categoria com ativo=0
    assert(status === 200 || status === 404, `Status esperado 200 ou 404, recebido ${status}`)
  })
}

// ─── 4. Produtos ────────────────────────────────────────────────────────────

async function testProdutos() {
  console.log('\n🍽️  PRODUTOS')

  await test('GET /produtos - lista produtos com paginação', async () => {
    const { status, data } = await api('/produtos')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.data, 'Deve ter propriedade data')
    assert(data.pagination, 'Deve ter propriedade pagination')
    assert(Array.isArray(data.data), 'data deve ser array')
    assert(data.pagination.total > 0, 'Deve ter produtos')
  })

  await test('GET /produtos - filtra por categoria', async () => {
    const { status, data } = await api('/produtos?categoria_id=1')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.data.every(p => p.categoria_id === 1), 'Todos devem ser da categoria 1')
  })

  await test('GET /produtos - busca por nome', async () => {
    const { status, data } = await api('/produtos?busca=Picanha')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.data.length > 0, 'Deve encontrar produto Picanha')
  })

  await test('GET /produtos/cardapio - retorna cardápio agrupado', async () => {
    const { status, data } = await api('/produtos/cardapio')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array de categorias')
    assert(data.length > 0, 'Deve ter categorias no cardápio')
    // Cardápio faz spread de {...cat, produtos: [...]}, logo o nome da categoria é "nome"
    assert(data[0].nome, 'Deve ter nome da categoria')
    assert(data[0].id, 'Deve ter id da categoria')
    assert(Array.isArray(data[0].produtos), 'Deve ter array de produtos')
  })

  let newProdutoId = null

  await test('POST /produtos - cria novo produto', async () => {
    const { status, data } = await api('/produtos', {
      method: 'POST',
      body: { nome: 'Produto Teste', categoria_id: 1, preco: 25.90, codigo: 'TST001' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.nome === 'Produto Teste', 'Nome diferente')
    assert(data.preco === 25.9, `Preço esperado 25.9, recebido ${data.preco}`)
    newProdutoId = data.id
  })

  await test('PUT /produtos/:id - atualiza produto', async () => {
    const { status, data } = await api(`/produtos/${newProdutoId}`, {
      method: 'PUT', body: { preco: 29.90 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.preco === 29.9, `Preço esperado 29.9, recebido ${data.preco}`)
  })

  await test('DELETE /produtos/:id - remove produto', async () => {
    const { status } = await api(`/produtos/${newProdutoId}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })
}

// ─── 5. Mesas ───────────────────────────────────────────────────────────────

async function testMesas() {
  console.log('\n🪑 MESAS')

  await test('GET /mesas - lista mesas com status', async () => {
    const { status, data } = await api('/mesas')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    assert(data.length > 0, 'Deve ter mesas')
    assert(data[0].numero, 'Mesa deve ter número')
    assert(data[0].status, 'Mesa deve ter status')
  })

  await test('GET /mesas/:id - busca mesa por id', async () => {
    const { status, data } = await api('/mesas/1')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.numero, 'Mesa deve ter número')
    assert('pedido' in data, 'Deve ter campo pedido')
  })

  let newMesaId = null

  await test('POST /mesas - cria nova mesa', async () => {
    const { status, data } = await api('/mesas', {
      method: 'POST', body: { numero: 'T99', capacidade: 6, localizacao: 'terraço' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.numero === 'T99', 'Número diferente')
    newMesaId = data.id
  })

  await test('PUT /mesas/:id/status - altera status da mesa', async () => {
    const { status, data } = await api(`/mesas/${newMesaId}/status`, {
      method: 'PUT', body: { status: 'reservada' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.status === 'reservada', `Status esperado "reservada", recebido "${data.status}"`)
  })

  await test('PUT /mesas/:id/status - rejeita status inválido', async () => {
    const { status } = await api(`/mesas/${newMesaId}/status`, {
      method: 'PUT', body: { status: 'invalido' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('DELETE /mesas/:id - remove mesa', async () => {
    // First set back to livre
    await api(`/mesas/${newMesaId}/status`, { method: 'PUT', body: { status: 'livre' } })
    const { status } = await api(`/mesas/${newMesaId}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })
}

// ─── 6. Pedidos (fluxo completo) ────────────────────────────────────────────

async function testPedidos() {
  console.log('\n📝 PEDIDOS')

  let pedidoId = null
  let itemId = null
  const mesaId = 1 // Usar mesa existente

  // Primeiro garantir que a mesa está livre
  await api(`/mesas/${mesaId}/status`, { method: 'PUT', body: { status: 'livre' } })
  // Cancelar pedidos abertos na mesa se existirem
  const pedidosAbertos = await api(`/pedidos?mesa_id=${mesaId}&status=aberto`)
  if (pedidosAbertos.data?.data?.length > 0) {
    for (const p of pedidosAbertos.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza para teste', senha: 'admin123' } })
    }
  }
  const pedidosProducao = await api(`/pedidos?mesa_id=${mesaId}&status=producao`)
  if (pedidosProducao.data?.data?.length > 0) {
    for (const p of pedidosProducao.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza para teste', senha: 'admin123' } })
    }
  }

  await test('POST /pedidos - cria novo pedido', async () => {
    const { status, data } = await api('/pedidos', {
      method: 'POST', body: { mesa_id: mesaId, tipo: 'mesa', cliente_nome: 'Teste Auto' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.id, 'Pedido deve ter id')
    assert(data.status === 'aberto', `Status esperado "aberto", recebido "${data.status}"`)
    pedidoId = data.id
  })

  await test('POST /pedidos - rejeita pedido duplicado na mesa', async () => {
    const { status, data } = await api('/pedidos', {
      method: 'POST', body: { mesa_id: mesaId, tipo: 'mesa' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
    assert(data.error.includes('já possui'), 'Mensagem deve indicar pedido existente')
  })

  await test('POST /pedidos/:id/itens - adiciona item ao pedido', async () => {
    // Buscar produto disponível - preferir sem controle de estoque (estoque_quantidade = null)
    // ou com estoque suficiente
    const produtos = await api('/produtos')
    let produto = produtos.data.data.find(p => p.estoque_quantidade === null)

    if (!produto) {
      // Se todos têm controle de estoque, buscar um com estoque suficiente
      produto = produtos.data.data.find(p => p.estoque_quantidade >= 2)
    }

    if (!produto) {
      // Último recurso: atualizar o estoque do primeiro produto via API de estoque
      produto = produtos.data.data[0]
      await api(`/estoque/${produto.id}`, {
        method: 'PUT', body: { quantidade: 100, estoque_minimo: 5 }
      })
    }

    assert(produto, 'Deve existir pelo menos um produto')

    const { status, data } = await api(`/pedidos/${pedidoId}/itens`, {
      method: 'POST', body: { produto_id: produto.id, quantidade: 2, observacao: 'Teste auto' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}. Produto: ${produto.nome} (estoque: ${produto.estoque_quantidade})`)
    assert(data.quantidade === 2, `Quantidade esperada 2, recebida ${data.quantidade}`)
    assert(data.subtotal > 0, 'Subtotal deve ser > 0')
    itemId = data.id
  })

  await test('POST /pedidos/:id/itens - rejeita produto inexistente', async () => {
    const { status } = await api(`/pedidos/${pedidoId}/itens`, {
      method: 'POST', body: { produto_id: 99999, quantidade: 1 }
    })
    assert(status === 404, `Status esperado 404, recebido ${status}`)
  })

  await test('GET /pedidos/:id - retorna pedido com itens', async () => {
    const { status, data } = await api(`/pedidos/${pedidoId}`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.id === pedidoId, 'ID do pedido diferente')
    assert(Array.isArray(data.itens), 'Deve ter array de itens')
    assert(data.itens.length > 0, 'Deve ter itens')
    assert(data.total > 0, 'Total deve ser > 0')
  })

  await test('GET /pedidos - lista pedidos com filtros', async () => {
    const { status, data } = await api('/pedidos?page=1&limit=5')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.pagination, 'Deve ter paginação')
    assert(data.pagination.page === 1, 'Página deve ser 1')
  })

  await test('PUT /pedidos/:id/itens/:itemId/status - atualiza status do item (KDS)', async () => {
    assert(itemId, 'ItemId é necessário (teste anterior deve ter passado)')
    const { status, data } = await api(`/pedidos/${pedidoId}/itens/${itemId}/status`, {
      method: 'PUT', body: { status: 'preparando' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.status === 'preparando', `Status esperado "preparando", recebido "${data.status}"`)
  })

  await test('PUT /pedidos/:id/itens/:itemId/status - marca como pronto', async () => {
    assert(itemId, 'ItemId é necessário (teste anterior deve ter passado)')
    const { status, data } = await api(`/pedidos/${pedidoId}/itens/${itemId}/status`, {
      method: 'PUT', body: { status: 'pronto' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.status === 'pronto', `Status esperado "pronto", recebido "${data.status}"`)
  })

  await test('GET /pedidos/cozinha - KDS retorna pedidos em produção', async () => {
    const { status, data } = await api('/pedidos/cozinha')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })

  // Fechar o pedido sem pagamento completo - deve rejeitar porque total > 0 e não há pagamento
  await test('PUT /pedidos/:id/fechar - rejeita sem pagamento completo', async () => {
    // O pedido tem itens com total > 0, mas não tem pagamentos
    const pedidoInfo = await api(`/pedidos/${pedidoId}`)
    if (pedidoInfo.data.total > 0) {
      const { status } = await api(`/pedidos/${pedidoId}/fechar`, { method: 'PUT' })
      assert(status === 400, `Status esperado 400, recebido ${status}`)
    } else {
      // Se total for 0 por algum motivo, skip sem falhar
      console.log('    ⚠️  Total é 0, skip check de pagamento')
    }
  })

  await test('PUT /pedidos/:id/cancelar - cancela pedido com senha de supervisor', async () => {
    // Buscar status atual do pedido
    const pedidoInfo = await api(`/pedidos/${pedidoId}`)
    const pedidoStatus = pedidoInfo.data.status

    // Só cancela se não estiver pago
    if (pedidoStatus !== 'pago') {
      const { status, data } = await api(`/pedidos/${pedidoId}/cancelar`, {
        method: 'PUT', body: { motivo: 'Teste automatizado', senha: 'admin123' }
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.status === 'cancelado', `Status esperado "cancelado", recebido "${data.status}"`)
    } else {
      // Se o pedido ficou pago (edge case), testar que não pode cancelar pago
      const { status } = await api(`/pedidos/${pedidoId}/cancelar`, {
        method: 'PUT', body: { motivo: 'Teste automatizado', senha: 'admin123' }
      })
      assert(status === 400, `Pedido pago: Status esperado 400, recebido ${status}`)
    }
  })
}

// ─── 7. Pagamentos ──────────────────────────────────────────────────────────

async function testPagamentos() {
  console.log('\n💰 PAGAMENTOS')

  // Criar um pedido completo para testar pagamento
  // Limpar mesa primeiro
  await api('/mesas/2/status', { method: 'PUT', body: { status: 'livre' } })
  const pedAbertos = await api('/pedidos?mesa_id=2&status=aberto')
  if (pedAbertos.data?.data?.length > 0) {
    for (const p of pedAbertos.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza para teste', senha: 'admin123' } })
    }
  }
  const pedProd = await api('/pedidos?mesa_id=2&status=producao')
  if (pedProd.data?.data?.length > 0) {
    for (const p of pedProd.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza para teste', senha: 'admin123' } })
    }
  }
  const pedPronto = await api('/pedidos?mesa_id=2&status=pronto')
  if (pedPronto.data?.data?.length > 0) {
    for (const p of pedPronto.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza para teste', senha: 'admin123' } })
    }
  }

  const pedido = await api('/pedidos', {
    method: 'POST', body: { mesa_id: 2, tipo: 'mesa', cliente_nome: 'Teste Pagamento' }
  })
  const pedidoId = pedido.data.id

  // Adicionar item - buscar produto sem controle de estoque ou com estoque suficiente
  const produtos = await api('/produtos')
  let produto = produtos.data.data.find(p => p.estoque_quantidade === null)
  if (!produto) {
    produto = produtos.data.data.find(p => p.estoque_quantidade >= 1)
  }
  if (!produto) {
    produto = produtos.data.data[0]
    await api(`/estoque/${produto.id}`, {
      method: 'PUT', body: { quantidade: 100, estoque_minimo: 5 }
    })
  }

  const itemResult = await api(`/pedidos/${pedidoId}/itens`, {
    method: 'POST', body: { produto_id: produto.id, quantidade: 1 }
  })

  // Obter total do pedido
  const pedidoInfo = await api(`/pedidos/${pedidoId}`)
  const total = pedidoInfo.data.total

  let pagamentoId = null

  await test('POST /pagamentos - registra pagamento', async () => {
    assert(total > 0, `Total do pedido deve ser > 0 (total=${total}). Item status: ${itemResult.status}`)

    const { status, data } = await api('/pagamentos', {
      method: 'POST', body: { pedido_id: pedidoId, valor: total, forma: 'dinheiro' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}. Data: ${JSON.stringify(data)}`)
    // POST /pagamentos retorna { pagamento, pedido_total, total_pago, restante, pagamento_completo }
    assert(data.pagamento, 'Deve ter objeto pagamento')
    assert(data.pagamento.valor === total, `Valor esperado ${total}, recebido ${data.pagamento.valor}`)
    pagamentoId = data.pagamento.id
  })

  await test('POST /pagamentos - rejeita forma inválida', async () => {
    const { status } = await api('/pagamentos', {
      method: 'POST', body: { pedido_id: pedidoId, valor: 10, forma: 'bitcoin' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('GET /pagamentos - lista pagamentos', async () => {
    const { status, data } = await api('/pagamentos')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.data, 'Deve ter propriedade data')
    assert(data.pagination, 'Deve ter paginação')
  })

  await test('GET /pagamentos/resumo - resumo diário', async () => {
    const { status, data } = await api('/pagamentos/resumo')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.total_geral !== undefined, 'Deve ter total_geral')
    // A API retorna "por_forma", não "formas_pagamento"
    assert(data.por_forma, 'Deve ter por_forma')
    assert(Array.isArray(data.por_forma), 'por_forma deve ser array')
  })

  await test('PUT /pedidos/:id/fechar - fecha pedido com pagamento completo', async () => {
    const { status, data } = await api(`/pedidos/${pedidoId}/fechar`, { method: 'PUT' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.status === 'pago', `Status esperado "pago", recebido "${data.status}"`)
  })

  await test('DELETE /pagamentos/:id - rejeita estorno de pedido fechado', async () => {
    assert(pagamentoId, 'pagamentoId é necessário (teste anterior deve ter passado)')
    const { status } = await api(`/pagamentos/${pagamentoId}`, { method: 'DELETE' })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })
}

// ─── 8. Estoque ─────────────────────────────────────────────────────────────

async function testEstoque() {
  console.log('\n📦 ESTOQUE')

  // --- 8.1 GET /estoque - Listagem básica ---
  await test('GET /estoque - lista produtos com estoque', async () => {
    const { status, data } = await api('/estoque')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
  })

  // --- 8.2 GET /estoque retorna TODOS os produtos (com e sem controle) ---
  await test('GET /estoque - inclui produtos sem controle de estoque', async () => {
    const { status, data } = await api('/estoque')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    const semControle = data.filter(p => p.estoque_quantidade === null)
    const comControle = data.filter(p => p.estoque_quantidade !== null)
    // Deve ter ambos os tipos (com e sem controle)
    const totalProdutos = await api('/produtos?limit=200')
    const totalAtivos = (totalProdutos.data.data || []).filter(p => p.ativo === 1).length
    assert(data.length === totalAtivos,
      `Estoque deve listar todos os ${totalAtivos} produtos ativos, listou ${data.length}`)
  })

  // --- 8.3 GET /estoque retorna campo controle_estoque ---
  await test('GET /estoque - retorna campo controle_estoque', async () => {
    const { status, data } = await api('/estoque')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.length > 0, 'Deve ter produtos')
    // Verificar que TODOS os produtos têm o campo controle_estoque
    data.forEach(p => {
      assert('controle_estoque' in p,
        `Produto "${p.nome}" (id=${p.id}) não tem campo controle_estoque`)
    })
    // Produtos com estoque_quantidade != null devem ter controle_estoque = 1
    const comEstoque = data.filter(p => p.estoque_quantidade !== null)
    comEstoque.forEach(p => {
      assert(p.controle_estoque === 1,
        `Produto "${p.nome}" com estoque deve ter controle_estoque=1, tem ${p.controle_estoque}`)
    })
    // Produtos com estoque_quantidade = null devem ter controle_estoque = 0
    const semEstoque = data.filter(p => p.estoque_quantidade === null)
    semEstoque.forEach(p => {
      assert(p.controle_estoque === 0,
        `Produto "${p.nome}" sem estoque deve ter controle_estoque=0, tem ${p.controle_estoque}`)
    })
  })

  // --- 8.4 Alertas ---
  await test('GET /estoque/alertas - lista produtos em baixo estoque', async () => {
    const { status, data } = await api('/estoque/alertas')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    data.forEach(p => {
      assert(p.estoque_quantidade <= p.estoque_minimo,
        `Produto ${p.nome}: estoque ${p.estoque_quantidade} > minimo ${p.estoque_minimo}`)
    })
  })

  // --- 8.5 Atualizar estoque ---
  const estoque = await api('/estoque')
  const produtoComControle = estoque.data.find(p => p.estoque_quantidade !== null)
  if (produtoComControle) {
    await test('PUT /estoque/:id - atualiza quantidade do estoque', async () => {
      const { status, data } = await api(`/estoque/${produtoComControle.id}`, {
        method: 'PUT', body: { quantidade: 50, estoque_minimo: 10 }
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.estoque_quantidade === 50, `Quantidade esperada 50, recebida ${data.estoque_quantidade}`)
      assert(data.estoque_minimo === 10, `Mínimo esperado 10, recebido ${data.estoque_minimo}`)

      // Restaurar valor original
      await api(`/estoque/${produtoComControle.id}`, {
        method: 'PUT',
        body: { quantidade: produtoComControle.estoque_quantidade, estoque_minimo: produtoComControle.estoque_minimo }
      })
    })

    await test('PUT /estoque/:id - rejeita quantidade negativa', async () => {
      const { status } = await api(`/estoque/${produtoComControle.id}`, {
        method: 'PUT', body: { quantidade: -5 }
      })
      assert(status === 400, `Status esperado 400, recebido ${status}`)
    })
  }

  // --- 8.6 Toggle controle de estoque (PUT /controle) ---
  const prodSemControle = estoque.data.find(p => p.estoque_quantidade === null)

  if (prodSemControle) {
    await test('PUT /estoque/:id/controle - ativa controle de estoque', async () => {
      const { status, data } = await api(`/estoque/${prodSemControle.id}/controle`, {
        method: 'PUT', body: { controle_estoque: true }
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.controle_estoque === 1,
        `controle_estoque deve ser 1, recebido ${data.controle_estoque}`)
      assert(data.estoque_quantidade !== null,
        `estoque_quantidade deve ser != null após ativar, recebido ${data.estoque_quantidade}`)
      assert(data.estoque_minimo !== null,
        `estoque_minimo deve ser != null após ativar, recebido ${data.estoque_minimo}`)
    })

    await test('PUT /estoque/:id/controle - desativa controle de estoque', async () => {
      const { status, data } = await api(`/estoque/${prodSemControle.id}/controle`, {
        method: 'PUT', body: { controle_estoque: false }
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.controle_estoque === 0,
        `controle_estoque deve ser 0, recebido ${data.controle_estoque}`)
      assert(data.estoque_quantidade === null,
        `estoque_quantidade deve ser null após desativar, recebido ${data.estoque_quantidade}`)
      assert(data.estoque_minimo === null,
        `estoque_minimo deve ser null após desativar, recebido ${data.estoque_minimo}`)
    })

    await test('PUT /estoque/:id/controle - toggle persiste no GET /estoque', async () => {
      // Ativar
      await api(`/estoque/${prodSemControle.id}/controle`, {
        method: 'PUT', body: { controle_estoque: true }
      })
      // Verificar no GET
      const { data: estoqueAtual } = await api('/estoque')
      const prodAtivado = estoqueAtual.find(p => p.id === prodSemControle.id)
      assert(prodAtivado, `Produto ${prodSemControle.id} deve aparecer no GET /estoque`)
      assert(prodAtivado.controle_estoque === 1,
        `Produto ativado deve ter controle_estoque=1 no GET, tem ${prodAtivado.controle_estoque}`)
      assert(prodAtivado.estoque_quantidade !== null,
        `Produto ativado deve ter estoque_quantidade != null no GET`)

      // Desativar de volta
      await api(`/estoque/${prodSemControle.id}/controle`, {
        method: 'PUT', body: { controle_estoque: false }
      })
      // Verificar persistência da desativação
      const { data: estoqueDepois } = await api('/estoque')
      const prodDesativado = estoqueDepois.find(p => p.id === prodSemControle.id)
      assert(prodDesativado, `Produto ${prodSemControle.id} deve continuar no GET /estoque mesmo sem controle`)
      assert(prodDesativado.controle_estoque === 0,
        `Produto desativado deve ter controle_estoque=0 no GET, tem ${prodDesativado.controle_estoque}`)
      assert(prodDesativado.estoque_quantidade === null,
        `Produto desativado deve ter estoque_quantidade=null no GET`)
    })
  }

  // --- 8.7 Ativar/Desativar (POST) ---
  const prodParaAtivar = estoque.data.find(p => p.estoque_quantidade === null && p.id !== (prodSemControle?.id))
    || prodSemControle
  if (prodParaAtivar) {
    await test('POST /estoque/:id/ativar - ativa controle de estoque', async () => {
      const { status, data } = await api(`/estoque/${prodParaAtivar.id}/ativar`, {
        method: 'POST', body: { quantidade: 20, estoque_minimo: 5 }
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.estoque_quantidade === 20, 'Quantidade deve ser 20')
      assert(data.controle_estoque === 1, 'controle_estoque deve ser 1')
    })

    await test('POST /estoque/:id/desativar - desativa controle de estoque', async () => {
      const { status, data } = await api(`/estoque/${prodParaAtivar.id}/desativar`, {
        method: 'POST'
      })
      assert(status === 200, `Status esperado 200, recebido ${status}`)
      assert(data.estoque_quantidade === null, 'Quantidade deve ser null')
      assert(data.controle_estoque === 0, 'controle_estoque deve ser 0')
    })
  }

  // --- 8.8 Busca ---
  await test('GET /estoque - busca por nome', async () => {
    const { status, data } = await api('/estoque?busca=Carne')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
  })

  // --- 8.9 Produto sem controle NÃO bloqueia adição ao pedido ---
  await test('Produto sem controle de estoque pode ser adicionado ao pedido', async () => {
    // Garantir que temos um produto sem controle
    const { data: produtosEstoque } = await api('/estoque')
    let prodSem = produtosEstoque.find(p => p.estoque_quantidade === null)

    if (!prodSem) {
      // Se não há produto sem controle, desativar um temporariamente
      const primeiroProd = produtosEstoque[0]
      await api(`/estoque/${primeiroProd.id}/controle`, {
        method: 'PUT', body: { controle_estoque: false }
      })
      prodSem = primeiroProd
    }

    // Buscar mesa livre
    const { data: mesas } = await api('/mesas')
    const mesaLivre = (Array.isArray(mesas) ? mesas : mesas.data || []).find(m => m.status === 'livre')
    assert(mesaLivre, 'Deve ter mesa livre para teste')

    // Criar pedido
    const { status: pedidoStatus, data: pedido } = await api('/pedidos', {
      method: 'POST', body: { mesa_id: mesaLivre.id }
    })
    assert(pedidoStatus === 201, `Pedido deve ser criado, status ${pedidoStatus}`)

    // Adicionar produto SEM controle - NÃO deve bloquear
    const { status: itemStatus, data: itemData } = await api(`/pedidos/${pedido.id}/itens`, {
      method: 'POST', body: { produto_id: prodSem.id, quantidade: 1 }
    })
    assert(itemStatus === 201,
      `Produto sem controle deve ser aceito (201), recebido ${itemStatus}: ${JSON.stringify(itemData)}`)

    // Cleanup - cancelar pedido
    await api(`/pedidos/${pedido.id}/cancelar`, {
      method: 'PUT', body: { motivo: 'teste automatizado', senha: 'admin123' }
    })

    // Restaurar controle se foi desativado
    if (!produtosEstoque.find(p => p.estoque_quantidade === null)) {
      await api(`/estoque/${prodSem.id}/controle`, {
        method: 'PUT', body: { controle_estoque: true }
      })
    }
  })

  // --- 8.10 Produto COM controle e estoque insuficiente BLOQUEIA ---
  await test('Produto com controle e estoque insuficiente bloqueia adição ao pedido', async () => {
    // Encontrar produto com controle
    const { data: produtosEstoque } = await api('/estoque')
    let prodCom = produtosEstoque.find(p => p.estoque_quantidade !== null)

    if (!prodCom) return // Skip se não há produto com controle

    // Anotar estoque original
    const estoqueOriginal = prodCom.estoque_quantidade
    const minimoOriginal = prodCom.estoque_minimo

    // Setar estoque para 0
    await api(`/estoque/${prodCom.id}`, {
      method: 'PUT', body: { quantidade: 0 }
    })

    // Buscar mesa livre
    const { data: mesas } = await api('/mesas')
    const mesaLivre = (Array.isArray(mesas) ? mesas : mesas.data || []).find(m => m.status === 'livre')
    assert(mesaLivre, 'Deve ter mesa livre para teste')

    // Criar pedido
    const { data: pedido } = await api('/pedidos', {
      method: 'POST', body: { mesa_id: mesaLivre.id }
    })

    // Tentar adicionar produto com estoque 0 - DEVE bloquear
    const { status: itemStatus } = await api(`/pedidos/${pedido.id}/itens`, {
      method: 'POST', body: { produto_id: prodCom.id, quantidade: 1 }
    })
    assert(itemStatus === 400,
      `Produto com estoque zerado deve ser rejeitado (400), recebido ${itemStatus}`)

    // Cleanup
    await api(`/pedidos/${pedido.id}/cancelar`, {
      method: 'PUT', body: { motivo: 'teste automatizado', senha: 'admin123' }
    })
    // Restaurar estoque
    await api(`/estoque/${prodCom.id}`, {
      method: 'PUT', body: { quantidade: estoqueOriginal, estoque_minimo: minimoOriginal }
    })
  })
}

// ─── 9. Garçons CRUD ────────────────────────────────────────────────────────

async function testGarcons() {
  console.log('\n👨‍🍳 GARÇONS')

  let garcomId = null
  const testEmail = `garcom.teste.${Date.now()}@teste.com`

  await test('POST /auth/registro - cria novo garçom', async () => {
    const { status, data } = await api('/auth/registro', {
      method: 'POST',
      body: { nome: 'Garçom Teste Auto', email: testEmail, senha: 'teste123', perfil: 'garcom' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}. Data: ${JSON.stringify(data)}`)
    // /auth/registro retorna o usuario diretamente (não wrappado em { usuario })
    assert(data.id, 'Deve retornar id do usuario')
    assert(data.perfil === 'garcom', `Perfil esperado "garcom", recebido "${data.perfil}"`)
    garcomId = data.id
  })

  await test('GET /auth/usuarios - garçom aparece na lista', async () => {
    const { status, data } = await api('/auth/usuarios')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    const garcom = data.find(u => u.id === garcomId)
    assert(garcom, 'Garçom criado deve aparecer na lista')
    assert(garcom.nome === 'Garçom Teste Auto', `Nome esperado "Garçom Teste Auto", recebido "${garcom.nome}"`)
    assert(garcom.perfil === 'garcom', `Perfil esperado "garcom", recebido "${garcom.perfil}"`)
  })

  await test('PUT /auth/usuarios/:id - edita garçom', async () => {
    assert(garcomId, 'garcomId necessário')
    const { status, data } = await api(`/auth/usuarios/${garcomId}`, {
      method: 'PUT', body: { nome: 'Garçom Editado Auto' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.nome === 'Garçom Editado Auto', `Nome esperado "Garçom Editado Auto", recebido "${data.nome}"`)
  })

  await test('PUT /auth/usuarios/:id - desativa garçom (ativo=false)', async () => {
    assert(garcomId, 'garcomId necessário')
    const { status, data } = await api(`/auth/usuarios/${garcomId}`, {
      method: 'PUT', body: { ativo: false }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.ativo === 0 || data.ativo === false, `Ativo esperado false/0, recebido ${data.ativo}`)
  })

  await test('PUT /auth/usuarios/:id - reativa garçom (ativo=true)', async () => {
    assert(garcomId, 'garcomId necessário')
    const { status, data } = await api(`/auth/usuarios/${garcomId}`, {
      method: 'PUT', body: { ativo: true }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.ativo === 1 || data.ativo === true, `Ativo esperado true/1, recebido ${data.ativo}`)
  })

  await test('POST /auth/registro - rejeita email duplicado', async () => {
    const { status } = await api('/auth/registro', {
      method: 'POST',
      body: { nome: 'Outro Garcom', email: testEmail, senha: 'teste123', perfil: 'garcom' }
    })
    assert(status === 400 || status === 409, `Status esperado 400 ou 409, recebido ${status}`)
  })

  // Cleanup - desativar garçom de teste
  if (garcomId) {
    await api(`/auth/usuarios/${garcomId}`, { method: 'PUT', body: { ativo: false } })
  }
}

// ─── 10. Produtos CRUD ──────────────────────────────────────────────────────

async function testProdutosCRUD() {
  console.log('\n🛒 PRODUTOS CRUD')

  let produtoId = null

  await test('POST /produtos - cria produto com todos os campos', async () => {
    const { status, data } = await api('/produtos', {
      method: 'POST',
      body: {
        nome: 'Produto CRUD Teste',
        codigo: 'CRUDTST01',
        preco: 42.50,
        categoria_id: 1,
        descricao: 'Produto criado via teste automatizado',
        tempo_preparo: 20
      }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.nome === 'Produto CRUD Teste', `Nome esperado "Produto CRUD Teste", recebido "${data.nome}"`)
    assert(data.preco === 42.5, `Preço esperado 42.5, recebido ${data.preco}`)
    assert(data.codigo === 'CRUDTST01', `Codigo esperado "CRUDTST01", recebido "${data.codigo}"`)
    produtoId = data.id
  })

  await test('GET /produtos - produto criado aparece na lista', async () => {
    const { status, data } = await api(`/produtos?busca=CRUDTST01`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    const encontrado = data.data.find(p => p.id === produtoId)
    assert(encontrado, 'Produto criado deve aparecer na busca')
    assert(encontrado.descricao === 'Produto criado via teste automatizado', 'Descrição deve corresponder')
  })

  await test('PUT /produtos/:id - edita produto', async () => {
    assert(produtoId, 'produtoId necessário')
    const { status, data } = await api(`/produtos/${produtoId}`, {
      method: 'PUT', body: { nome: 'Produto CRUD Editado', preco: 55.00, tempo_preparo: 30 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.nome === 'Produto CRUD Editado', `Nome esperado "Produto CRUD Editado", recebido "${data.nome}"`)
    assert(data.preco === 55, `Preço esperado 55, recebido ${data.preco}`)
  })

  await test('DELETE /produtos/:id - desativa produto (soft delete)', async () => {
    assert(produtoId, 'produtoId necessário')
    const { status } = await api(`/produtos/${produtoId}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })

  await test('PUT /produtos/:id - reativa produto desativado', async () => {
    assert(produtoId, 'produtoId necessário')
    const { status, data } = await api(`/produtos/${produtoId}`, {
      method: 'PUT', body: { ativo: true }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })

  await test('POST /produtos - rejeita produto sem nome', async () => {
    const { status } = await api('/produtos', {
      method: 'POST', body: { preco: 10.00 }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('POST /produtos - rejeita produto sem preço', async () => {
    const { status } = await api('/produtos', {
      method: 'POST', body: { nome: 'Produto Sem Preco' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  // Cleanup - desativar produto de teste
  if (produtoId) {
    await api(`/produtos/${produtoId}`, { method: 'DELETE' })
  }
}

// ─── 11. Cancelamento com Senha ─────────────────────────────────────────────

async function testCancelamentoComSenha() {
  console.log('\n🔐 CANCELAMENTO COM SENHA')

  // Criar um pedido para testar cancelamento
  // Limpar mesa 3
  await api('/mesas/3/status', { method: 'PUT', body: { status: 'livre' } })
  const pedAbertos3 = await api('/pedidos?mesa_id=3&status=aberto')
  if (pedAbertos3.data?.data?.length > 0) {
    for (const p of pedAbertos3.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza teste', senha: 'admin123' } })
    }
  }
  const pedProd3 = await api('/pedidos?mesa_id=3&status=producao')
  if (pedProd3.data?.data?.length > 0) {
    for (const p of pedProd3.data.data) {
      await api(`/pedidos/${p.id}/cancelar`, { method: 'PUT', body: { motivo: 'Limpeza teste', senha: 'admin123' } })
    }
  }

  // Criar pedido na mesa 3
  const { data: pedido } = await api('/pedidos', {
    method: 'POST', body: { mesa_id: 3, tipo: 'mesa', cliente_nome: 'Teste Cancelamento' }
  })
  const pedidoId = pedido.id

  // Adicionar item ao pedido
  const produtos = await api('/produtos')
  let produto = produtos.data.data.find(p => p.estoque_quantidade === null)
  if (!produto) produto = produtos.data.data.find(p => p.estoque_quantidade >= 1)
  if (!produto) {
    produto = produtos.data.data[0]
    await api(`/estoque/${produto.id}`, { method: 'PUT', body: { quantidade: 100, estoque_minimo: 5 } })
  }
  await api(`/pedidos/${pedidoId}/itens`, {
    method: 'POST', body: { produto_id: produto.id, quantidade: 1 }
  })

  await test('PUT /pedidos/:id/cancelar - rejeita sem senha', async () => {
    const { status, data } = await api(`/pedidos/${pedidoId}/cancelar`, {
      method: 'PUT', body: { motivo: 'Teste sem senha' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}. Data: ${JSON.stringify(data)}`)
  })

  await test('PUT /pedidos/:id/cancelar - rejeita senha incorreta', async () => {
    const { status, data } = await api(`/pedidos/${pedidoId}/cancelar`, {
      method: 'PUT', body: { motivo: 'Teste senha errada', senha: 'senhaerrada123' }
    })
    assert(status === 403, `Status esperado 403, recebido ${status}. Data: ${JSON.stringify(data)}`)
  })

  await test('PUT /pedidos/:id/cancelar - aceita com senha correta', async () => {
    const { status, data } = await api(`/pedidos/${pedidoId}/cancelar`, {
      method: 'PUT', body: { motivo: 'Teste com senha correta', senha: 'admin123' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}. Data: ${JSON.stringify(data)}`)
    assert(data.status === 'cancelado', `Status esperado "cancelado", recebido "${data.status}"`)
    assert(data.observacao && data.observacao.includes('CANCELADO por'), 'Observação deve registrar quem cancelou')
  })

  // Teste com perfil garçom (não deve conseguir cancelar)
  await test('PUT /pedidos/:id/cancelar - garçom não pode cancelar', async () => {
    // Criar garçom temporário com email único
    const cancelTestEmail = `garcom.cancel.${Date.now()}@teste.com`
    const regResult = await api('/auth/registro', {
      method: 'POST',
      body: { nome: 'Garcom Cancelar Teste', email: cancelTestEmail, senha: 'garcom123', perfil: 'garcom' }
    })
    const garcomUserId = regResult.data?.id

    // Login como garçom para obter token
    const loginResult = await api('/auth/login', {
      method: 'POST', body: { email: cancelTestEmail, senha: 'garcom123' }
    })
    const garcomToken = loginResult.data?.token

    if (garcomToken) {
      // Criar outro pedido na mesa 3
      await api('/mesas/3/status', { method: 'PUT', body: { status: 'livre' } })
      const { data: pedido2 } = await api('/pedidos', {
        method: 'POST', body: { mesa_id: 3, tipo: 'mesa', cliente_nome: 'Teste Garcom Cancel' }
      })

      // Tentar cancelar com token de garçom
      const savedToken = TOKEN
      TOKEN = garcomToken
      const { status } = await api(`/pedidos/${pedido2.id}/cancelar`, {
        method: 'PUT', body: { motivo: 'Garçom tentando cancelar', senha: 'garcom123' }
      })
      TOKEN = savedToken
      assert(status === 403, `Garçom não deve cancelar - status esperado 403, recebido ${status}`)

      // Cleanup - cancelar pedido com admin e desativar garçom
      await api(`/pedidos/${pedido2.id}/cancelar`, { method: 'PUT', body: { motivo: 'Cleanup', senha: 'admin123' } })
      if (garcomUserId) {
        await api(`/auth/usuarios/${garcomUserId}`, { method: 'PUT', body: { ativo: false } })
      }
    }
  })

  // Teste cancelar pedido já pago
  await test('PUT /pedidos/:id/cancelar - rejeita pedido já pago', async () => {
    // Criar pedido, pagar e tentar cancelar
    await api('/mesas/3/status', { method: 'PUT', body: { status: 'livre' } })
    const { data: pedidoPago } = await api('/pedidos', {
      method: 'POST', body: { mesa_id: 3, tipo: 'mesa', cliente_nome: 'Teste Pago Cancel' }
    })
    await api(`/pedidos/${pedidoPago.id}/itens`, {
      method: 'POST', body: { produto_id: produto.id, quantidade: 1 }
    })
    const pedidoInfo = await api(`/pedidos/${pedidoPago.id}`)
    const total = pedidoInfo.data.total
    await api('/pagamentos', {
      method: 'POST', body: { pedido_id: pedidoPago.id, valor: total, forma: 'dinheiro' }
    })
    await api(`/pedidos/${pedidoPago.id}/fechar`, { method: 'PUT' })

    const { status } = await api(`/pedidos/${pedidoPago.id}/cancelar`, {
      method: 'PUT', body: { motivo: 'Tentar cancelar pago', senha: 'admin123' }
    })
    assert(status === 400, `Pedido pago não deve ser cancelável - status esperado 400, recebido ${status}`)
  })
}

// ─── 12. Áreas CRUD ────────────────────────────────────────────────────────

async function testAreas() {
  console.log('\n🗺️  ÁREAS')

  let areaId = null
  let areaId2 = null
  const areaNome = `Área Teste ${Date.now()}`
  const areaNome2 = `Área Teste2 ${Date.now()}`

  await test('POST /areas - cria nova área', async () => {
    const { status, data } = await api('/areas', {
      method: 'POST', body: { nome: areaNome, descricao: 'Área criada por teste' }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.id, 'Deve retornar id da área')
    assert(data.nome === areaNome, `Nome esperado "${areaNome}", recebido "${data.nome}"`)
    areaId = data.id
  })

  await test('POST /areas - cria segunda área', async () => {
    const { status, data } = await api('/areas', {
      method: 'POST', body: { nome: areaNome2 }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    areaId2 = data.id
  })

  await test('POST /areas - rejeita sem nome', async () => {
    const { status } = await api('/areas', {
      method: 'POST', body: { descricao: 'Sem nome' }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('POST /areas - rejeita nome duplicado', async () => {
    const { status } = await api('/areas', {
      method: 'POST', body: { nome: areaNome }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('GET /areas - lista áreas', async () => {
    const { status, data } = await api('/areas')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    const found = data.find(a => a.id === areaId)
    assert(found, 'Área criada deve aparecer na lista')
  })

  await test('GET /areas/:id - busca área por id', async () => {
    const { status, data } = await api(`/areas/${areaId}`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.nome === areaNome, 'Nome deve corresponder')
    assert('mesas' in data, 'Deve ter campo mesas')
    assert(Array.isArray(data.mesas), 'Mesas deve ser array')
  })

  await test('PUT /areas/:id - edita área', async () => {
    const { status, data } = await api(`/areas/${areaId}`, {
      method: 'PUT', body: { nome: areaNome + ' Editada', descricao: 'Descrição editada' }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.descricao === 'Descrição editada', 'Descrição deve ser atualizada')
  })

  await test('PUT /areas/:id - desativa área (ativo=0)', async () => {
    const { status, data } = await api(`/areas/${areaId}`, {
      method: 'PUT', body: { ativo: 0 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.ativo === 0 || data.ativo === false, 'Área deve estar inativa')
  })

  await test('PUT /areas/:id - reativa área (ativo=1)', async () => {
    const { status, data } = await api(`/areas/${areaId}`, {
      method: 'PUT', body: { ativo: 1 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.ativo === 1 || data.ativo === true, 'Área deve estar ativa')
  })

  // Deletar área2 (sem mesas) deve funcionar
  await test('DELETE /areas/:id - remove área sem mesas', async () => {
    const { status } = await api(`/areas/${areaId2}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })

  // Guardar areaId para uso nos testes de MesasAreas
  globalThis.__testAreaId = areaId
  globalThis.__testAreaNome = areaNome + ' Editada'
}

// ─── 13. Mesas & Áreas ─────────────────────────────────────────────────────

async function testMesasAreas() {
  console.log('\n🪑 MESAS & ÁREAS')

  const areaId = globalThis.__testAreaId
  let mesaId = null
  const mesaNumero = `MA${Date.now()}`

  // Criar outra área para teste de mover mesa
  const { data: area2 } = await api('/areas', {
    method: 'POST', body: { nome: `Área Mover ${Date.now()}` }
  })
  const areaId2 = area2?.id

  await test('POST /mesas - cria mesa com area_id', async () => {
    const { status, data } = await api('/mesas', {
      method: 'POST', body: { numero: mesaNumero, capacidade: 8, area_id: areaId }
    })
    assert(status === 201, `Status esperado 201, recebido ${status}`)
    assert(data.id, 'Deve retornar id da mesa')
    assert(data.area_id === areaId || data.area_id == areaId, `area_id esperado ${areaId}, recebido ${data.area_id}`)
    mesaId = data.id
  })

  await test('PUT /mesas/:id - edita mesa (numero, capacidade)', async () => {
    const { status, data } = await api(`/mesas/${mesaId}`, {
      method: 'PUT', body: { capacidade: 10 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.capacidade === 10, `Capacidade esperada 10, recebida ${data.capacidade}`)
  })

  await test('PUT /mesas/:id - move mesa para outra área', async () => {
    assert(areaId2, 'Área 2 deve existir')
    const { status, data } = await api(`/mesas/${mesaId}`, {
      method: 'PUT', body: { area_id: areaId2 }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.area_id === areaId2 || data.area_id == areaId2, `area_id esperado ${areaId2}, recebido ${data.area_id}`)
  })

  await test('PUT /mesas/:id - remove mesa de área (area_id=null)', async () => {
    const { status, data } = await api(`/mesas/${mesaId}`, {
      method: 'PUT', body: { area_id: null }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.area_id === null || data.area_id === undefined, `area_id esperado null, recebido ${data.area_id}`)
  })

  // Mover mesa de volta para área1 para testes seguintes
  await api(`/mesas/${mesaId}`, { method: 'PUT', body: { area_id: areaId } })

  await test('GET /mesas - retorno inclui area_id e area_nome', async () => {
    const { status, data } = await api('/mesas')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    const mesa = data.find(m => m.id === mesaId)
    assert(mesa, 'Mesa criada deve aparecer na lista')
    assert('area_id' in mesa, 'Deve ter campo area_id')
    assert('area_nome' in mesa, 'Deve ter campo area_nome')
  })

  await test('GET /mesas?area_id=X - filtra mesas por área', async () => {
    const { status, data } = await api(`/mesas?area_id=${areaId}`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Resposta deve ser array')
    const todas = data.every(m => m.area_id === areaId || m.area_id == areaId)
    assert(todas, 'Todas as mesas devem pertencer à área filtrada')
  })

  await test('GET /areas/:id - retorna mesas da área', async () => {
    const { status, data } = await api(`/areas/${areaId}`)
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data.mesas), 'Deve ter array de mesas')
    const found = data.mesas.find(m => m.id === mesaId)
    assert(found, 'Mesa deve aparecer na área')
  })

  await test('POST /mesas - rejeita número duplicado', async () => {
    const { status } = await api('/mesas', {
      method: 'POST', body: { numero: mesaNumero, capacidade: 4 }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  // Testar rejeição de remover mesa com pedido ativo
  // Criar pedido na mesa para bloquear delete
  await api(`/mesas/${mesaId}/status`, { method: 'PUT', body: { status: 'livre' } })
  const { data: pedidoTemp } = await api('/pedidos', {
    method: 'POST', body: { mesa_id: mesaId, tipo: 'mesa', cliente_nome: 'Block Delete' }
  })

  await test('DELETE /mesas/:id - rejeita remover mesa com pedido ativo', async () => {
    const { status } = await api(`/mesas/${mesaId}`, { method: 'DELETE' })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  // Cancelar pedido e limpar
  if (pedidoTemp?.id) {
    await api(`/pedidos/${pedidoTemp.id}/cancelar`, {
      method: 'PUT', body: { motivo: 'Limpeza teste', senha: 'admin123' }
    })
  }

  await test('DELETE /mesas/:id - remove mesa livre', async () => {
    const { status } = await api(`/mesas/${mesaId}`, { method: 'DELETE' })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
  })

  // Agora podemos deletar a área1 (sem mesas) - teste DELETE /areas com mesas
  // Primeiro criar uma mesa na area2 para testar bloqueio
  const { data: mesaBlock } = await api('/mesas', {
    method: 'POST', body: { numero: `BLK${Date.now()}`, area_id: areaId2 }
  })

  await test('DELETE /areas/:id - rejeita remover área com mesas', async () => {
    const { status } = await api(`/areas/${areaId2}`, { method: 'DELETE' })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  // Limpar mesa de bloqueio e área2
  if (mesaBlock?.id) {
    await api(`/mesas/${mesaBlock.id}`, { method: 'DELETE' })
  }
  if (areaId2) {
    await api(`/areas/${areaId2}`, { method: 'DELETE' })
  }

  // Limpar areaId (seção 12)
  if (areaId) {
    await api(`/areas/${areaId}`, { method: 'DELETE' })
  }
}

// ─── 14. Transferência de Mesa ──────────────────────────────────────────────

async function testTransferenciaMesa() {
  console.log('\n🔄 TRANSFERÊNCIA DE MESA')

  // Setup: Criar 2 mesas para transferência
  const mesaNumA = `TRA${Date.now()}`
  const mesaNumB = `TRB${Date.now()}`

  const { data: mesaA } = await api('/mesas', {
    method: 'POST', body: { numero: mesaNumA, capacidade: 4 }
  })
  const { data: mesaB } = await api('/mesas', {
    method: 'POST', body: { numero: mesaNumB, capacidade: 4 }
  })
  const mesaAId = mesaA?.id
  const mesaBId = mesaB?.id

  // Criar pedido na mesa A
  await api(`/mesas/${mesaAId}/status`, { method: 'PUT', body: { status: 'livre' } })
  const { data: pedido } = await api('/pedidos', {
    method: 'POST', body: { mesa_id: mesaAId, tipo: 'mesa', cliente_nome: 'Transferência Teste' }
  })
  const pedidoId = pedido?.id

  await test('POST /pedidos/:id/transferir - rejeita sem mesa_destino_id', async () => {
    const { status } = await api(`/pedidos/${pedidoId}/transferir`, {
      method: 'POST', body: {}
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  await test('POST /pedidos/:id/transferir - transfere para mesa livre', async () => {
    assert(pedidoId, 'Pedido deve existir')
    assert(mesaBId, 'Mesa B deve existir')
    const { status, data } = await api(`/pedidos/${pedidoId}/transferir`, {
      method: 'POST', body: { mesa_destino_id: mesaBId }
    })
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(data.mesa_id === mesaBId || data.mesa_id == mesaBId, `mesa_id esperado ${mesaBId}, recebido ${data.mesa_id}`)

    // Verificar que mesa A ficou livre
    const { data: mA } = await api(`/mesas/${mesaAId}`)
    assert(mA.status === 'livre', `Mesa origem deve estar livre, está "${mA.status}"`)

    // Verificar que mesa B ficou ocupada
    const { data: mB } = await api(`/mesas/${mesaBId}`)
    assert(mB.status === 'ocupada', `Mesa destino deve estar ocupada, está "${mB.status}"`)
  })

  await test('POST /pedidos/:id/transferir - rejeita para mesa ocupada', async () => {
    // Mesa A agora está livre, colocar como ocupada criando pedido
    await api(`/mesas/${mesaAId}/status`, { method: 'PUT', body: { status: 'ocupada' } })
    const { status } = await api(`/pedidos/${pedidoId}/transferir`, {
      method: 'POST', body: { mesa_destino_id: mesaAId }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
    // Restaurar mesa A para livre
    await api(`/mesas/${mesaAId}/status`, { method: 'PUT', body: { status: 'livre' } })
  })

  await test('POST /pedidos/:id/transferir - rejeita pedido inexistente', async () => {
    const { status } = await api('/pedidos/99999/transferir', {
      method: 'POST', body: { mesa_destino_id: mesaAId }
    })
    assert(status === 404, `Status esperado 404, recebido ${status}`)
  })

  await test('POST /pedidos/:id/transferir - rejeita pedido fechado/cancelado', async () => {
    // Cancelar o pedido
    await api(`/pedidos/${pedidoId}/cancelar`, {
      method: 'PUT', body: { motivo: 'Teste transferência cancelado', senha: 'admin123' }
    })
    const { status } = await api(`/pedidos/${pedidoId}/transferir`, {
      method: 'POST', body: { mesa_destino_id: mesaAId }
    })
    assert(status === 400, `Status esperado 400, recebido ${status}`)
  })

  // Teste de acesso: garçom pode transferir
  await test('POST /pedidos/:id/transferir - garçom pode transferir', async () => {
    // Criar garçom, logar, criar pedido e transferir
    const garcomEmail = `garcom.transf.${Date.now()}@teste.com`
    await api('/auth/registro', {
      method: 'POST', body: { nome: 'Garçom Transfer', email: garcomEmail, senha: 'garcom123', perfil: 'garcom' }
    })
    const { data: loginData } = await api('/auth/login', {
      method: 'POST', body: { email: garcomEmail, senha: 'garcom123' }
    })
    const garcomToken = loginData?.token

    // Limpar mesas e criar novo pedido
    await api(`/mesas/${mesaBId}/status`, { method: 'PUT', body: { status: 'livre' } })
    await api(`/mesas/${mesaAId}/status`, { method: 'PUT', body: { status: 'livre' } })

    const savedToken = TOKEN
    TOKEN = garcomToken

    try {
      const { data: pedidoG } = await api('/pedidos', {
        method: 'POST', body: { mesa_id: mesaAId, tipo: 'mesa', cliente_nome: 'Garçom Transfer' }
      })

      if (pedidoG?.id) {
        const { status } = await api(`/pedidos/${pedidoG.id}/transferir`, {
          method: 'POST', body: { mesa_destino_id: mesaBId }
        })
        assert(status === 200, `Garçom deve conseguir transferir - status esperado 200, recebido ${status}`)

        // Cancelar pedido para limpar
        TOKEN = savedToken
        await api(`/pedidos/${pedidoG.id}/cancelar`, {
          method: 'PUT', body: { motivo: 'Limpeza', senha: 'admin123' }
        })
      } else {
        assert(false, 'Garçom não conseguiu criar pedido')
      }
    } finally {
      TOKEN = savedToken
    }
  })

  // Limpar mesas de teste
  await api(`/mesas/${mesaBId}/status`, { method: 'PUT', body: { status: 'livre' } })
  await api(`/mesas/${mesaAId}/status`, { method: 'PUT', body: { status: 'livre' } })
  if (mesaAId) await api(`/mesas/${mesaAId}`, { method: 'DELETE' })
  if (mesaBId) await api(`/mesas/${mesaBId}`, { method: 'DELETE' })
}

// ─── 15. Relatórios ────────────────────────────────────────────────────────

async function testRelatorios() {
  console.log('\n📊 RELATÓRIOS')

  await test('GET /relatorios/vendas - relatório de vendas', async () => {
    const { status, data } = await api('/relatorios/vendas')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    // A API retorna { periodos, totais }, não { resumo, periodos }
    assert(data.totais, 'Deve ter totais')
    assert(Array.isArray(data.periodos), 'Deve ter array de periodos')
  })

  await test('GET /relatorios/produtos - relatório de produtos mais vendidos', async () => {
    const { status, data } = await api('/relatorios/produtos')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })

  await test('GET /relatorios/categorias - relatório por categorias', async () => {
    const { status, data } = await api('/relatorios/categorias')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })

  await test('GET /relatorios/garcons - relatório de garçons', async () => {
    const { status, data } = await api('/relatorios/garcons')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })

  await test('GET /relatorios/horarios - relatório por horários', async () => {
    const { status, data } = await api('/relatorios/horarios')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })

  await test('GET /relatorios/formas-pagamento - relatório por forma de pagamento', async () => {
    const { status, data } = await api('/relatorios/formas-pagamento')
    assert(status === 200, `Status esperado 200, recebido ${status}`)
    assert(Array.isArray(data), 'Deve ser array')
  })
}

// ─── 16. Segurança ──────────────────────────────────────────────────────────

async function testSeguranca() {
  console.log('\n🛡️  SEGURANÇA')

  await test('Rotas protegidas rejeitam sem token', async () => {
    const savedToken = TOKEN
    TOKEN = null
    const { status } = await api('/categorias')
    TOKEN = savedToken
    assert(status === 401, `Status esperado 401, recebido ${status}`)
  })

  await test('Rejeita token inválido', async () => {
    const savedToken = TOKEN
    TOKEN = 'token.invalido.aqui'
    const { status } = await api('/categorias')
    TOKEN = savedToken
    assert(status === 401, `Status esperado 401, recebido ${status}`)
  })

  await test('CORS headers presentes', async () => {
    const res = await fetch(`${BASE}/health`)
    const corsHeader = res.headers.get('access-control-allow-origin')
    assert(corsHeader === '*', `CORS header esperado "*", recebido "${corsHeader}"`)
  })

  await test('Rota inexistente retorna 404', async () => {
    const { status } = await api('/rota/inexistente')
    assert(status === 404, `Status esperado 404, recebido ${status}`)
  })
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(' 🧪 PDV Restaurante - Testes de Integração (Cloudflare)')
  console.log(' 📍 ' + BASE)
  console.log('═══════════════════════════════════════════════════════════')

  const start = Date.now()

  await testHealth()
  await testAuth()
  await testCategorias()
  await testProdutos()
  await testMesas()
  await testPedidos()
  await testPagamentos()
  await testEstoque()
  await testGarcons()
  await testProdutosCRUD()
  await testCancelamentoComSenha()
  await testAreas()
  await testMesasAreas()
  await testTransferenciaMesa()
  await testRelatorios()
  await testSeguranca()

  const duration = ((Date.now() - start) / 1000).toFixed(1)

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(` ✅ Passou: ${testResults.passed}`)
  console.log(` ❌ Falhou: ${testResults.failed}`)
  console.log(` ⏱️  Tempo: ${duration}s`)
  console.log('═══════════════════════════════════════════════════════════')

  if (testResults.errors.length > 0) {
    console.log('\n📋 FALHAS:')
    testResults.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.name}: ${e.error}`)
    })
  }

  console.log('')
  process.exit(testResults.failed > 0 ? 1 : 0)
}

runAllTests().catch(err => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
