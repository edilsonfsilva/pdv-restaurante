import { useState, useEffect, useCallback } from 'react'
import {
  Package, Search, AlertTriangle, X, Save,
  Loader2, Filter, ArrowUpDown, Check, XCircle, Edit3
} from 'lucide-react'
import FormField from '../components/FormField'
import ConfirmDialog from '../components/ConfirmDialog'

const API_URL = '/api'

async function authRequest(endpoint, options = {}) {
  const token = localStorage.getItem('pdv_token')
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  }
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body)
  }
  const response = await fetch(`${API_URL}${endpoint}`, config)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  return response.json()
}

function getStockStatus(produto) {
  if (!produto.controle_estoque) return 'inactive'
  const qtd = produto.estoque_quantidade ?? 0
  const min = produto.estoque_minimo ?? 0
  if (qtd <= 0) return 'critical'
  if (qtd <= min) return 'low'
  if (qtd <= min * 1.5) return 'warning'
  return 'ok'
}

function StockBadge({ status }) {
  const config = {
    ok: { label: 'OK', classes: 'bg-green-100 text-green-800' },
    warning: { label: 'Baixo', classes: 'bg-yellow-100 text-yellow-800' },
    low: { label: 'Critico', classes: 'bg-red-100 text-red-800' },
    critical: { label: 'Zerado', classes: 'bg-red-200 text-red-900' },
    inactive: { label: 'Sem controle', classes: 'bg-gray-100 text-gray-500' },
  }
  const { label, classes } = config[status] || config.inactive

  return (
    <span className={`badge ${classes}`}>{label}</span>
  )
}

function ModalAjusteEstoque({ produto, onSave, onClose }) {
  const [quantidade, setQuantidade] = useState(produto.estoque_quantidade ?? 0)
  const [estoqueMinimo, setEstoqueMinimo] = useState(produto.estoque_minimo ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(produto.id, {
        estoque_quantidade: Number(quantidade),
        estoque_minimo: Number(estoqueMinimo),
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Ajustar Estoque</h3>
            <p className="text-gray-500 text-sm">{produto.nome}</p>
            {produto.codigo && (
              <p className="text-gray-400 text-xs">Codigo: {produto.codigo}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <FormField
          label="Quantidade em Estoque"
          type="number"
          min="0"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
        />

        <FormField
          label="Estoque Minimo"
          type="number"
          min="0"
          value={estoqueMinimo}
          onChange={(e) => setEstoqueMinimo(e.target.value)}
        />

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busca, setBusca] = useState('')
  const [apenasLow, setApenasLow] = useState(false)
  const [selectedProduto, setSelectedProduto] = useState(null)
  const [confirmToggle, setConfirmToggle] = useState(null)
  const [sortField, setSortField] = useState('nome')
  const [sortDir, setSortDir] = useState('asc')

  const carregarProdutos = useCallback(async () => {
    try {
      setLoading(true)
      const data = await authRequest('/estoque')
      setProdutos(Array.isArray(data) ? data : data.produtos || data.data || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarProdutos()
  }, [carregarProdutos])

  // Products below minimum
  const produtosBaixoEstoque = produtos.filter((p) => {
    if (!p.controle_estoque) return false
    const qtd = p.estoque_quantidade ?? 0
    const min = p.estoque_minimo ?? 0
    return qtd <= min
  })

  // Filter and sort
  const produtosFiltrados = produtos
    .filter((p) => {
      // Search filter
      if (busca) {
        const termo = busca.toLowerCase()
        const matchNome = (p.nome || '').toLowerCase().includes(termo)
        const matchCodigo = (p.codigo || '').toLowerCase().includes(termo)
        const matchCategoria = (p.categoria_nome || '').toLowerCase().includes(termo)
        if (!matchNome && !matchCodigo && !matchCategoria) return false
      }
      // Low stock filter
      if (apenasLow) {
        if (!p.controle_estoque) return false
        const qtd = p.estoque_quantidade ?? 0
        const min = p.estoque_minimo ?? 0
        if (qtd > min) return false
      }
      return true
    })
    .sort((a, b) => {
      let valA, valB
      switch (sortField) {
        case 'nome':
          valA = (a.nome || '').toLowerCase()
          valB = (b.nome || '').toLowerCase()
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        case 'estoque_quantidade':
          valA = a.estoque_quantidade ?? 0
          valB = b.estoque_quantidade ?? 0
          return sortDir === 'asc' ? valA - valB : valB - valA
        case 'status':
          const statusOrder = { critical: 0, low: 1, warning: 2, ok: 3, inactive: 4 }
          valA = statusOrder[getStockStatus(a)] ?? 5
          valB = statusOrder[getStockStatus(b)] ?? 5
          return sortDir === 'asc' ? valA - valB : valB - valA
        default:
          return 0
      }
    })

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleSaveEstoque = async (produtoId, dados) => {
    await authRequest(`/estoque/${produtoId}`, {
      method: 'PUT',
      body: dados,
    })
    await carregarProdutos()
  }

  const handleToggleControle = async (produto) => {
    try {
      await authRequest(`/estoque/${produto.id}/controle`, {
        method: 'PUT',
        body: { controle_estoque: !produto.controle_estoque },
      })
      await carregarProdutos()
    } catch (err) {
      alert('Erro ao alterar controle de estoque: ' + err.message)
    } finally {
      setConfirmToggle(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <p className="text-red-500 mb-4">Erro ao carregar estoque: {error}</p>
        <button onClick={carregarProdutos} className="btn btn-primary">
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Package size={28} className="text-primary-500" />
          <h2 className="text-2xl font-bold text-gray-800">Controle de Estoque</h2>
        </div>
        <span className="text-sm text-gray-500">
          {produtos.length} produtos cadastrados
        </span>
      </div>

      {/* Alert banner for low stock */}
      {produtosBaixoEstoque.length > 0 && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertTriangle size={24} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-800">
              {produtosBaixoEstoque.length} {produtosBaixoEstoque.length === 1 ? 'produto' : 'produtos'} abaixo do estoque minimo
            </p>
            <p className="text-red-600 text-sm mt-1">
              {produtosBaixoEstoque.map((p) => p.nome).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, codigo ou categoria..."
            className="input pl-10"
          />
        </div>

        <button
          onClick={() => setApenasLow(!apenasLow)}
          className={`btn flex items-center gap-2 ${
            apenasLow ? 'btn-danger' : 'btn-secondary'
          }`}
        >
          <Filter size={18} />
          {apenasLow ? 'Mostrando baixo estoque' : 'Apenas baixo estoque'}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th
                  className="text-left p-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('nome')}
                >
                  <div className="flex items-center gap-1">
                    Produto
                    <ArrowUpDown size={14} className="text-gray-400" />
                  </div>
                </th>
                <th className="text-left p-3 font-medium text-gray-600">Codigo</th>
                <th className="text-left p-3 font-medium text-gray-600">Categoria</th>
                <th
                  className="text-right p-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('estoque_quantidade')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Estoque
                    <ArrowUpDown size={14} className="text-gray-400" />
                  </div>
                </th>
                <th className="text-right p-3 font-medium text-gray-600">Minimo</th>
                <th
                  className="text-center p-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status
                    <ArrowUpDown size={14} className="text-gray-400" />
                  </div>
                </th>
                <th className="text-center p-3 font-medium text-gray-600">Controle</th>
                <th className="text-center p-3 font-medium text-gray-600">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400">
                    Nenhum produto encontrado
                  </td>
                </tr>
              ) : (
                produtosFiltrados.map((produto) => {
                  const status = getStockStatus(produto)
                  const qtd = produto.estoque_quantidade ?? 0
                  const min = produto.estoque_minimo ?? 0

                  // Row background based on stock status
                  let rowBg = ''
                  if (produto.controle_estoque) {
                    if (status === 'critical') rowBg = 'bg-red-50'
                    else if (status === 'low') rowBg = 'bg-red-50/50'
                    else if (status === 'warning') rowBg = 'bg-yellow-50/50'
                  }

                  return (
                    <tr
                      key={produto.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${rowBg}`}
                    >
                      <td className="p-3 font-medium text-gray-800">{produto.nome}</td>
                      <td className="p-3 text-gray-500">{produto.codigo || '-'}</td>
                      <td className="p-3 text-gray-500">{produto.categoria_nome || '-'}</td>
                      <td className="p-3 text-right">
                        {produto.controle_estoque ? (
                          <span
                            className={`font-bold ${
                              status === 'critical' || status === 'low'
                                ? 'text-red-600'
                                : status === 'warning'
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}
                          >
                            {qtd}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right text-gray-500">
                        {produto.controle_estoque ? min : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <StockBadge status={status} />
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setConfirmToggle(produto)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            produto.controle_estoque
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title={produto.controle_estoque ? 'Desativar controle' : 'Ativar controle'}
                        >
                          {produto.controle_estoque ? <Check size={16} /> : <XCircle size={16} />}
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedProduto(produto)}
                          disabled={!produto.controle_estoque}
                          className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1 mx-auto disabled:opacity-30"
                        >
                          <Edit3 size={14} />
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary footer */}
      <div className="flex gap-4 mt-4 text-sm text-gray-500">
        <span>
          Total: {produtosFiltrados.length} produtos
        </span>
        <span>
          Com controle: {produtosFiltrados.filter((p) => p.controle_estoque).length}
        </span>
        <span className="text-red-500">
          Baixo estoque: {produtosBaixoEstoque.length}
        </span>
      </div>

      {/* Modal: adjust stock */}
      {selectedProduto && (
        <ModalAjusteEstoque
          produto={selectedProduto}
          onSave={handleSaveEstoque}
          onClose={() => setSelectedProduto(null)}
        />
      )}

      {/* Modal: confirm toggle stock control */}
      {confirmToggle && (
        <ConfirmDialog
          title={confirmToggle.controle_estoque ? 'Desativar Controle de Estoque' : 'Ativar Controle de Estoque'}
          message={
            confirmToggle.controle_estoque
              ? `Deseja desativar o controle de estoque para "${confirmToggle.nome}"? A quantidade atual sera mantida.`
              : `Deseja ativar o controle de estoque para "${confirmToggle.nome}"?`
          }
          confirmText={confirmToggle.controle_estoque ? 'Desativar' : 'Ativar'}
          danger={confirmToggle.controle_estoque}
          onConfirm={() => handleToggleControle(confirmToggle)}
          onCancel={() => setConfirmToggle(null)}
        />
      )}
    </div>
  )
}
