import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, X, Save, Loader2, Edit3,
  UserPlus, UserCheck, UserX, Mail, Lock
} from 'lucide-react'
import { getUsuarios, registrarUsuario, atualizarUsuario } from '../services/api'
import FormField from '../components/FormField'
import ConfirmDialog from '../components/ConfirmDialog'

function StatusBadge({ ativo }) {
  return ativo ? (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      <UserCheck size={12} /> Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <UserX size={12} /> Inativo
    </span>
  )
}

export default function Garcons() {
  const [garcons, setGarcons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busca, setBusca] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', email: '', senha: '' })
  const [formErrors, setFormErrors] = useState({})

  // Confirm dialog
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmData, setConfirmData] = useState(null)

  const carregarGarcons = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const usuarios = await getUsuarios()
      const listaGarcons = (Array.isArray(usuarios) ? usuarios : [])
        .filter(u => u.perfil === 'garcom')
      setGarcons(listaGarcons)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarGarcons()
  }, [carregarGarcons])

  const garconsFiltrados = garcons.filter(g =>
    g.nome.toLowerCase().includes(busca.toLowerCase()) ||
    g.email.toLowerCase().includes(busca.toLowerCase())
  )

  const abrirModal = (garcom = null) => {
    if (garcom) {
      setEditando(garcom)
      setForm({ nome: garcom.nome, email: garcom.email, senha: '' })
    } else {
      setEditando(null)
      setForm({ nome: '', email: '', senha: '' })
    }
    setFormErrors({})
    setShowModal(true)
  }

  const fecharModal = () => {
    setShowModal(false)
    setEditando(null)
    setForm({ nome: '', email: '', senha: '' })
    setFormErrors({})
  }

  const validarForm = () => {
    const errors = {}
    if (!form.nome.trim()) errors.nome = 'Nome e obrigatorio'
    if (!form.email.trim()) errors.email = 'Email e obrigatorio'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Email invalido'
    if (!editando && !form.senha.trim()) errors.senha = 'Senha e obrigatoria'
    if (form.senha && form.senha.length < 4) errors.senha = 'Senha deve ter pelo menos 4 caracteres'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const salvarGarcom = async () => {
    if (!validarForm()) return

    setSalvando(true)
    try {
      if (editando) {
        const data = { nome: form.nome, email: form.email }
        if (form.senha.trim()) data.senha = form.senha
        await atualizarUsuario(editando.id, data)
      } else {
        await registrarUsuario({
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          perfil: 'garcom'
        })
      }
      fecharModal()
      carregarGarcons()
    } catch (err) {
      setFormErrors({ geral: err.message })
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivo = (garcom) => {
    setConfirmData(garcom)
    setShowConfirm(true)
  }

  const confirmarToggle = async () => {
    if (!confirmData) return
    try {
      await atualizarUsuario(confirmData.id, { ativo: !confirmData.ativo })
      carregarGarcons()
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setShowConfirm(false)
      setConfirmData(null)
    }
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
          <Users size={28} className="text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-800">Garcons</h1>
          <span className="badge bg-gray-100 text-gray-600">{garcons.length}</span>
        </div>
        <button onClick={() => abrirModal()} className="btn btn-primary flex items-center gap-2">
          <UserPlus size={20} />
          Novo Garcom
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">{error}</div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="input pl-10 w-full"
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-4 font-semibold text-gray-600">Nome</th>
              <th className="text-left p-4 font-semibold text-gray-600">Email</th>
              <th className="text-center p-4 font-semibold text-gray-600">Status</th>
              <th className="text-center p-4 font-semibold text-gray-600">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {garconsFiltrados.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-12">
                  <Users size={48} className="mx-auto mb-2 opacity-50" />
                  <p>{busca ? 'Nenhum garcom encontrado' : 'Nenhum garcom cadastrado'}</p>
                </td>
              </tr>
            ) : (
              garconsFiltrados.map(garcom => (
                <tr key={garcom.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{garcom.nome}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail size={14} />
                      {garcom.email}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge ativo={garcom.ativo} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => abrirModal(garcom)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => toggleAtivo(garcom)}
                        className={`p-2 rounded-lg transition-colors ${
                          garcom.ativo
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={garcom.ativo ? 'Desativar' : 'Ativar'}
                      >
                        {garcom.ativo ? <UserX size={18} /> : <UserCheck size={18} />}
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
          <div className="card p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editando ? 'Editar Garcom' : 'Novo Garcom'}
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
              <FormField label="Nome" error={formErrors.nome}>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => { setForm({ ...form, nome: e.target.value }); setFormErrors({ ...formErrors, nome: '' }) }}
                  className={`input w-full ${formErrors.nome ? 'input-error' : ''}`}
                  placeholder="Nome completo"
                />
              </FormField>

              <FormField label="Email" error={formErrors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => { setForm({ ...form, email: e.target.value }); setFormErrors({ ...formErrors, email: '' }) }}
                  className={`input w-full ${formErrors.email ? 'input-error' : ''}`}
                  placeholder="email@exemplo.com"
                />
              </FormField>

              <FormField label={editando ? 'Nova Senha (deixe vazio para manter)' : 'Senha'} error={formErrors.senha}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="password"
                    value={form.senha}
                    onChange={e => { setForm({ ...form, senha: e.target.value }); setFormErrors({ ...formErrors, senha: '' }) }}
                    className={`input w-full pl-10 ${formErrors.senha ? 'input-error' : ''}`}
                    placeholder={editando ? 'Nova senha (opcional)' : 'Senha de acesso'}
                  />
                </div>
              </FormField>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={fecharModal} className="btn btn-secondary">Cancelar</button>
              <button
                onClick={salvarGarcom}
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
          title={confirmData.ativo ? 'Desativar Garcom' : 'Ativar Garcom'}
          message={`Tem certeza que deseja ${confirmData.ativo ? 'desativar' : 'ativar'} o garcom "${confirmData.nome}"?`}
          confirmText={confirmData.ativo ? 'Desativar' : 'Ativar'}
          danger={confirmData.ativo}
          onConfirm={confirmarToggle}
          onCancel={() => { setShowConfirm(false); setConfirmData(null) }}
        />
      )}
    </div>
  )
}
