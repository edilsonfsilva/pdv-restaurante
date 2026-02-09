import { useState, useEffect, useCallback } from 'react'
import {
  MapPin, Search, X, Save, Loader2, Edit3, Trash2, Plus,
  ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Users
} from 'lucide-react'
import {
  getAreas, getArea, criarArea, atualizarArea, deletarArea,
  getMesas, criarMesa, atualizarMesa, deletarMesa
} from '../services/api'
import FormField from '../components/FormField'
import ConfirmDialog from '../components/ConfirmDialog'

function StatusBadge({ ativo }) {
  return ativo ? (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      Ativa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
      Inativa
    </span>
  )
}

export default function AreasEMesas() {
  const [tab, setTab] = useState('areas')
  const [areas, setAreas] = useState([])
  const [mesas, setMesas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busca, setBusca] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState(null) // 'area' | 'mesa'
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [formArea, setFormArea] = useState({ nome: '', descricao: '' })
  const [formMesa, setFormMesa] = useState({ numero: '', capacidade: 4, area_id: '' })
  const [formErrors, setFormErrors] = useState({})

  // Confirm dialog
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmData, setConfirmData] = useState(null)

  // Expanded areas in mesa view
  const [expandedAreas, setExpandedAreas] = useState(new Set())

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [areasData, mesasData] = await Promise.all([getAreas(), getMesas()])
      setAreas(Array.isArray(areasData) ? areasData : [])
      setMesas(Array.isArray(mesasData) ? mesasData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // ─── Areas Tab ─────────────────────────────────────────

  const areasFiltradas = areas.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase())
  )

  const abrirModalArea = (area = null) => {
    setModalType('area')
    if (area) {
      setEditando(area)
      setFormArea({ nome: area.nome, descricao: area.descricao || '' })
    } else {
      setEditando(null)
      setFormArea({ nome: '', descricao: '' })
    }
    setFormErrors({})
    setShowModal(true)
  }

  const salvarArea = async () => {
    const errors = {}
    if (!formArea.nome.trim()) errors.nome = 'Nome e obrigatorio'
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSalvando(true)
    try {
      if (editando) {
        await atualizarArea(editando.id, formArea)
      } else {
        await criarArea(formArea)
      }
      fecharModal()
      carregarDados()
    } catch (err) {
      setFormErrors({ geral: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivoArea = (area) => {
    setConfirmData({ type: 'toggle-area', item: area })
    setShowConfirm(true)
  }

  const confirmarExcluirArea = (area) => {
    setConfirmData({ type: 'delete-area', item: area })
    setShowConfirm(true)
  }

  // ─── Mesas Tab ─────────────────────────────────────────

  const mesasFiltradas = mesas.filter(m =>
    m.numero.toLowerCase().includes(busca.toLowerCase()) ||
    (m.area_nome || '').toLowerCase().includes(busca.toLowerCase())
  )

  const mesasPorArea = mesasFiltradas.reduce((acc, mesa) => {
    const key = mesa.area_id || 'sem-area'
    const label = mesa.area_nome || 'Sem Area'
    if (!acc[key]) acc[key] = { label, mesas: [] }
    acc[key].mesas.push(mesa)
    return acc
  }, {})

  const abrirModalMesa = (mesa = null) => {
    setModalType('mesa')
    if (mesa) {
      setEditando(mesa)
      setFormMesa({
        numero: mesa.numero,
        capacidade: mesa.capacidade || 4,
        area_id: mesa.area_id || ''
      })
    } else {
      setEditando(null)
      setFormMesa({ numero: '', capacidade: 4, area_id: '' })
    }
    setFormErrors({})
    setShowModal(true)
  }

  const salvarMesa = async () => {
    const errors = {}
    if (!formMesa.numero.trim()) errors.numero = 'Numero e obrigatorio'
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSalvando(true)
    try {
      const data = {
        numero: formMesa.numero,
        capacidade: parseInt(formMesa.capacidade) || 4,
        area_id: formMesa.area_id ? parseInt(formMesa.area_id) : null
      }
      if (editando) {
        await atualizarMesa(editando.id, data)
      } else {
        await criarMesa(data)
      }
      fecharModal()
      carregarDados()
    } catch (err) {
      setFormErrors({ geral: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExcluirMesa = (mesa) => {
    setConfirmData({ type: 'delete-mesa', item: mesa })
    setShowConfirm(true)
  }

  // ─── Shared ────────────────────────────────────────────

  const fecharModal = () => {
    setShowModal(false)
    setModalType(null)
    setEditando(null)
    setFormErrors({})
  }

  const executarConfirm = async () => {
    if (!confirmData) return
    try {
      const { type, item } = confirmData
      if (type === 'toggle-area') {
        await atualizarArea(item.id, { ativo: item.ativo ? 0 : 1 })
      } else if (type === 'delete-area') {
        await deletarArea(item.id)
      } else if (type === 'delete-mesa') {
        await deletarMesa(item.id)
      }
      carregarDados()
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setShowConfirm(false)
      setConfirmData(null)
    }
  }

  const toggleExpandArea = (key) => {
    setExpandedAreas(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MapPin size={28} className="text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-800">Areas & Mesas</h1>
        </div>
        <button
          onClick={() => tab === 'areas' ? abrirModalArea() : abrirModalMesa()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          {tab === 'areas' ? 'Nova Area' : 'Nova Mesa'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setTab('areas'); setBusca('') }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'areas' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Areas ({areas.length})
        </button>
        <button
          onClick={() => { setTab('mesas'); setBusca('') }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'mesas' ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Mesas ({mesas.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder={tab === 'areas' ? 'Buscar area...' : 'Buscar mesa ou area...'}
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="input pl-10 w-full"
        />
      </div>

      {/* ─── Areas Table ─── */}
      {tab === 'areas' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-4 font-semibold text-gray-600">Nome</th>
                <th className="text-left p-4 font-semibold text-gray-600">Descricao</th>
                <th className="text-center p-4 font-semibold text-gray-600">Mesas</th>
                <th className="text-center p-4 font-semibold text-gray-600">Status</th>
                <th className="text-center p-4 font-semibold text-gray-600">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {areasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-12">
                    <MapPin size={48} className="mx-auto mb-2 opacity-50" />
                    <p>{busca ? 'Nenhuma area encontrada' : 'Nenhuma area cadastrada'}</p>
                  </td>
                </tr>
              ) : (
                areasFiltradas.map(area => (
                  <tr key={area.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">{area.nome}</td>
                    <td className="p-4 text-gray-600 text-sm">{area.descricao || '—'}</td>
                    <td className="p-4 text-center">
                      <span className="badge bg-gray-100 text-gray-600">{area.total_mesas || 0}</span>
                    </td>
                    <td className="p-4 text-center">
                      <StatusBadge ativo={area.ativo} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => abrirModalArea(area)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                          onClick={() => toggleAtivoArea(area)}
                          className={`p-2 rounded-lg transition-colors ${
                            area.ativo ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={area.ativo ? 'Desativar' : 'Ativar'}
                        >
                          {area.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button
                          onClick={() => confirmarExcluirArea(area)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Mesas Grouped by Area ─── */}
      {tab === 'mesas' && (
        <div className="space-y-3">
          {Object.entries(mesasPorArea).length === 0 ? (
            <div className="card p-12 text-center text-gray-400">
              <Users size={48} className="mx-auto mb-2 opacity-50" />
              <p>{busca ? 'Nenhuma mesa encontrada' : 'Nenhuma mesa cadastrada'}</p>
            </div>
          ) : (
            Object.entries(mesasPorArea).map(([key, group]) => (
              <div key={key} className="card overflow-hidden">
                <button
                  onClick={() => toggleExpandArea(key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedAreas.has(key) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    <span className="font-semibold text-gray-800">{group.label}</span>
                    <span className="badge bg-gray-100 text-gray-600">{group.mesas.length}</span>
                  </div>
                </button>

                {expandedAreas.has(key) && (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-t border-b">
                        <th className="text-left p-3 pl-12 text-sm font-semibold text-gray-600">Numero</th>
                        <th className="text-center p-3 text-sm font-semibold text-gray-600">Capacidade</th>
                        <th className="text-center p-3 text-sm font-semibold text-gray-600">Status</th>
                        <th className="text-center p-3 text-sm font-semibold text-gray-600">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.mesas.map(mesa => (
                        <tr key={mesa.id} className="border-b last:border-b-0 hover:bg-gray-50 transition-colors">
                          <td className="p-3 pl-12 font-medium text-gray-800">
                            {mesa.numero === 'BAL' ? 'Balcao' : `Mesa ${mesa.numero}`}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-600">
                              <Users size={14} />
                              {mesa.capacidade}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`badge ${
                              mesa.status === 'livre' ? 'bg-green-100 text-green-800' :
                              mesa.status === 'ocupada' ? 'bg-primary-100 text-primary-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {mesa.status === 'livre' ? 'Livre' :
                               mesa.status === 'ocupada' ? 'Ocupada' : 'Reservada'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => abrirModalMesa(mesa)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => confirmarExcluirMesa(mesa)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Modal Area ─── */}
      {showModal && modalType === 'area' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editando ? 'Editar Area' : 'Nova Area'}
              </h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {formErrors.geral && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{formErrors.geral}</div>
            )}

            <div className="space-y-4">
              <FormField label="Nome" error={formErrors.nome}>
                <input
                  type="text"
                  value={formArea.nome}
                  onChange={e => { setFormArea({ ...formArea, nome: e.target.value }); setFormErrors({}) }}
                  className={`input w-full ${formErrors.nome ? 'input-error' : ''}`}
                  placeholder="Ex: Salao Principal"
                />
              </FormField>

              <FormField label="Descricao (opcional)">
                <input
                  type="text"
                  value={formArea.descricao}
                  onChange={e => setFormArea({ ...formArea, descricao: e.target.value })}
                  className="input w-full"
                  placeholder="Descricao da area"
                />
              </FormField>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={fecharModal} className="btn btn-secondary">Cancelar</button>
              <button
                onClick={salvarArea}
                disabled={salvando}
                className="btn btn-primary flex items-center gap-2"
              >
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {editando ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Mesa ─── */}
      {showModal && modalType === 'mesa' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editando ? 'Editar Mesa' : 'Nova Mesa'}
              </h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {formErrors.geral && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{formErrors.geral}</div>
            )}

            <div className="space-y-4">
              <FormField label="Numero" error={formErrors.numero}>
                <input
                  type="text"
                  value={formMesa.numero}
                  onChange={e => { setFormMesa({ ...formMesa, numero: e.target.value }); setFormErrors({}) }}
                  className={`input w-full ${formErrors.numero ? 'input-error' : ''}`}
                  placeholder="Ex: 01, 02, BAL"
                />
              </FormField>

              <FormField label="Capacidade">
                <input
                  type="number"
                  min={1}
                  value={formMesa.capacidade}
                  onChange={e => setFormMesa({ ...formMesa, capacidade: e.target.value })}
                  className="input w-full"
                />
              </FormField>

              <FormField label="Area">
                <select
                  value={formMesa.area_id}
                  onChange={e => setFormMesa({ ...formMesa, area_id: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sem area</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={fecharModal} className="btn btn-secondary">Cancelar</button>
              <button
                onClick={salvarMesa}
                disabled={salvando}
                className="btn btn-primary flex items-center gap-2"
              >
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {editando ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && confirmData && (
        <ConfirmDialog
          title={
            confirmData.type === 'toggle-area'
              ? (confirmData.item.ativo ? 'Desativar Area' : 'Ativar Area')
              : confirmData.type === 'delete-area'
              ? 'Excluir Area'
              : 'Excluir Mesa'
          }
          message={
            confirmData.type === 'toggle-area'
              ? `Tem certeza que deseja ${confirmData.item.ativo ? 'desativar' : 'ativar'} a area "${confirmData.item.nome}"?`
              : confirmData.type === 'delete-area'
              ? `Tem certeza que deseja excluir a area "${confirmData.item.nome}"? Esta acao nao pode ser desfeita.`
              : `Tem certeza que deseja excluir a mesa "${confirmData.item.numero}"? Esta acao nao pode ser desfeita.`
          }
          confirmText={
            confirmData.type === 'toggle-area'
              ? (confirmData.item.ativo ? 'Desativar' : 'Ativar')
              : 'Excluir'
          }
          danger={confirmData.type !== 'toggle-area' || confirmData.item.ativo}
          onConfirm={executarConfirm}
          onCancel={() => { setShowConfirm(false); setConfirmData(null) }}
        />
      )}
    </div>
  )
}
