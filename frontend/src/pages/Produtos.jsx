import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingBag, Search, X, Save, Loader2, Edit3,
  Plus, Check, XCircle, Tag, DollarSign
} from 'lucide-react'
import { getProdutos, getCategorias, criarProduto, atualizarProduto, deletarProduto } from '../services/api'
import FormField from '../components/FormField'
import ConfirmDialog from '../components/ConfirmDialog'

function StatusBadge({ ativo }) {
  return ativo ? (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      <Check size={12} /> Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <XCircle size={12} /> Inativo
    </span>
  )
}

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('todos')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    nome: '', codigo: '', preco: '', categoria_id: '',
    descricao: '', tempo_preparo: ''
  })
  const [formErrors, setFormErrors] = useState({})

  // Confirm dialog
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmData, setConfirmData] = useState(null)

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [prodData, catData] = await Promise.all([
        getProdutos({ limit: 500 }),
        getCategorias()
      ])
      const lista = prodData.data || prodData
      setProdutos(Array.isArray(lista) ? lista : [])
      setCategorias(Array.isArray(catData) ? catData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const produtosFiltrados = produtos.filter(p => {
    const matchBusca = !busca ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.codigo && p.codigo.toLowerCase().includes(busca.toLowerCase()))
    const matchCategoria = !filtroCategoria || String(p.categoria_id) === filtroCategoria
    const matchAtivo = filtroAtivo === 'todos' ||
      (filtroAtivo === 'ativos' && p.ativo) ||
      (filtroAtivo === 'inativos' && !p.ativo)
    return matchBusca && matchCategoria && matchAtivo
  })

  const abrirModal = (produto = null) => {
    if (produto) {
      setEditando(produto)
      setForm({
        nome: produto.nome || '',
        codigo: produto.codigo || '',
        preco: produto.preco ? String(produto.preco) : '',
        categoria_id: produto.categoria_id ? String(produto.categoria_id) : '',
        descricao: produto.descricao || '',
        tempo_preparo: produto.tempo_preparo ? String(produto.tempo_preparo) : ''
      })
    } else {
      setEditando(null)
      setForm({ nome: '', codigo: '', preco: '', categoria_id: '', descricao: '', tempo_preparo: '' })
    }
    setFormErrors({})
    setShowModal(true)
  }

  const fecharModal = () => {
    setShowModal(false)
    setEditando(null)
    setFormErrors({})
  }

  const validarForm = () => {
    const errors = {}
    if (!form.nome.trim()) errors.nome = 'Nome e obrigatorio'
    if (!form.preco || parseFloat(form.preco) <= 0) errors.preco = 'Preco deve ser maior que zero'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const salvarProduto = async () => {
    if (!validarForm()) return

    setSalvando(true)
    try {
      const data = {
        nome: form.nome.trim(),
        preco: parseFloat(form.preco),
      }
      if (form.codigo.trim()) data.codigo = form.codigo.trim()
      if (form.categoria_id) data.categoria_id = parseInt(form.categoria_id)
      if (form.descricao.trim()) data.descricao = form.descricao.trim()
      if (form.tempo_preparo) data.tempo_preparo = parseInt(form.tempo_preparo)

      if (editando) {
        await atualizarProduto(editando.id, data)
      } else {
        await criarProduto(data)
      }
      fecharModal()
      carregarDados()
    } catch (err) {
      setFormErrors({ geral: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivo = (produto) => {
    setConfirmData(produto)
    setShowConfirm(true)
  }

  const confirmarToggle = async () => {
    if (!confirmData) return
    try {
      if (confirmData.ativo) {
        await deletarProduto(confirmData.id)
      } else {
        await atualizarProduto(confirmData.id, { ativo: true })
      }
      carregarDados()
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setShowConfirm(false)
      setConfirmData(null)
    }
  }

  const getCategoriaNome = (catId) => {
    const cat = categorias.find(c => c.id === catId)
    return cat ? cat.nome : '-'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShoppingBag size={28} className="text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-800">Produtos</h1>
          <span className="badge bg-gray-100 text-gray-600">{produtos.length}</span>
        </div>
        <button onClick={() => abrirModal()} className="btn btn-primary flex items-center gap-2">
          <Plus size={20} />
          Novo Produto
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome ou codigo..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
          className="input w-48"
        >
          <option value="">Todas as categorias</option>
          {categorias.filter(c => c.ativo !== 0).map(cat => (
            <option key={cat.id} value={cat.id}>{cat.nome}</option>
          ))}
        </select>
        <select
          value={filtroAtivo}
          onChange={e => setFiltroAtivo(e.target.value)}
          className="input w-36"
        >
          <option value="todos">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-4 font-semibold text-gray-600">Codigo</th>
              <th className="text-left p-4 font-semibold text-gray-600">Nome</th>
              <th className="text-left p-4 font-semibold text-gray-600">Categoria</th>
              <th className="text-right p-4 font-semibold text-gray-600">Preco</th>
              <th className="text-center p-4 font-semibold text-gray-600">Status</th>
              <th className="text-center p-4 font-semibold text-gray-600">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {produtosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-gray-400 py-12">
                  <ShoppingBag size={48} className="mx-auto mb-2 opacity-50" />
                  <p>{busca || filtroCategoria ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</p>
                </td>
              </tr>
            ) : (
              produtosFiltrados.map(produto => (
                <tr key={produto.id} className={`border-b hover:bg-gray-50 transition-colors ${!produto.ativo ? 'opacity-60' : ''}`}>
                  <td className="p-4">
                    <span className="text-sm text-gray-500 font-mono">{produto.codigo || '-'}</span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{produto.nome}</div>
                    {produto.descricao && (
                      <div className="text-xs text-gray-400 truncate max-w-xs">{produto.descricao}</div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Tag size={14} />
                      <span className="text-sm">{getCategoriaNome(produto.categoria_id)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-bold text-primary-600">
                      R$ {parseFloat(produto.preco).toFixed(2)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge ativo={produto.ativo} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => abrirModal(produto)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => toggleAtivo(produto)}
                        className={`p-2 rounded-lg transition-colors ${
                          produto.ativo
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={produto.ativo ? 'Desativar' : 'Ativar'}
                      >
                        {produto.ativo ? <XCircle size={18} /> : <Check size={18} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editando ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {formErrors.geral && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                {formErrors.geral}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nome *" error={formErrors.nome}>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={e => { setForm({ ...form, nome: e.target.value }); setFormErrors({ ...formErrors, nome: '' }) }}
                    className={`input w-full ${formErrors.nome ? 'input-error' : ''}`}
                    placeholder="Nome do produto"
                  />
                </FormField>

                <FormField label="Codigo">
                  <input
                    type="text"
                    value={form.codigo}
                    onChange={e => setForm({ ...form, codigo: e.target.value })}
                    className="input w-full"
                    placeholder="Ex: PROD001"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Preco (R$) *" error={formErrors.preco}>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.preco}
                      onChange={e => { setForm({ ...form, preco: e.target.value }); setFormErrors({ ...formErrors, preco: '' }) }}
                      className={`input w-full pl-10 ${formErrors.preco ? 'input-error' : ''}`}
                      placeholder="0.00"
                    />
                  </div>
                </FormField>

                <FormField label="Categoria">
                  <select
                    value={form.categoria_id}
                    onChange={e => setForm({ ...form, categoria_id: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Sem categoria</option>
                    {categorias.filter(c => c.ativo !== 0).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nome}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="Descricao">
                <textarea
                  value={form.descricao}
                  onChange={e => setForm({ ...form, descricao: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder="Descricao do produto (opcional)"
                />
              </FormField>

              <FormField label="Tempo de preparo (minutos)">
                <input
                  type="number"
                  min="0"
                  value={form.tempo_preparo}
                  onChange={e => setForm({ ...form, tempo_preparo: e.target.value })}
                  className="input w-full"
                  placeholder="Ex: 15"
                />
              </FormField>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={fecharModal} className="btn btn-secondary">Cancelar</button>
              <button
                onClick={salvarProduto}
                disabled={salvando}
                className="btn btn-primary flex items-center gap-2"
              >
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {editando ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && confirmData && (
        <ConfirmDialog
          title={confirmData.ativo ? 'Desativar Produto' : 'Ativar Produto'}
          message={`Tem certeza que deseja ${confirmData.ativo ? 'desativar' : 'ativar'} o produto "${confirmData.nome}"?`}
          confirmText={confirmData.ativo ? 'Desativar' : 'Ativar'}
          danger={confirmData.ativo}
          onConfirm={confirmarToggle}
          onCancel={() => { setShowConfirm(false); setConfirmData(null) }}
        />
      )}
    </div>
  )
}
