import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, DollarSign, ArrowRightLeft } from 'lucide-react'
import { getMesas, transferirMesa } from '../services/api'
import { useSocketEvent } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'

function MesaCard({ mesa, onClick, onTransferir }) {
  const statusColors = {
    livre: 'bg-green-100 border-green-400 hover:bg-green-50',
    ocupada: 'bg-primary-100 border-primary-400 hover:bg-primary-50',
    reservada: 'bg-purple-100 border-purple-400 hover:bg-purple-50',
  }

  const statusLabels = {
    livre: 'Livre',
    ocupada: 'Ocupada',
    reservada: 'Reservada',
  }

  const tempoAberta = mesa.pedido_inicio
    ? Math.round((Date.now() - new Date(mesa.pedido_inicio).getTime()) / 60000)
    : 0

  return (
    <div
      className={`
        card p-4 border-2 transition-all
        ${statusColors[mesa.status]}
        ${mesa.status === 'ocupada' ? 'ring-2 ring-primary-300' : ''}
      `}
    >
      <button
        onClick={() => onClick(mesa)}
        className="w-full text-left"
      >
        <div className="flex justify-between items-start mb-3">
          <span className="text-2xl font-bold text-gray-800">
            {mesa.numero === 'BAL' ? 'Balcao' : `Mesa ${mesa.numero}`}
          </span>
          <span className={`badge ${
            mesa.status === 'livre' ? 'bg-green-200 text-green-800' :
            mesa.status === 'ocupada' ? 'bg-primary-200 text-primary-800' :
            'bg-purple-200 text-purple-800'
          }`}>
            {statusLabels[mesa.status]}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users size={16} />
            <span>{mesa.capacidade}</span>
          </div>

          {mesa.status === 'ocupada' && (
            <>
              <div className="flex items-center gap-1">
                <Clock size={16} />
                <span>{tempoAberta} min</span>
              </div>

              {mesa.pedido_total > 0 && (
                <div className="flex items-center gap-1 text-primary-600 font-medium">
                  <DollarSign size={16} />
                  <span>{parseFloat(mesa.pedido_total).toFixed(2)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {mesa.qtd_itens > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {mesa.qtd_itens} {mesa.qtd_itens === 1 ? 'item' : 'itens'} no pedido
          </div>
        )}
      </button>

      {mesa.status === 'ocupada' && mesa.pedido_id && onTransferir && (
        <button
          onClick={(e) => { e.stopPropagation(); onTransferir(mesa) }}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
        >
          <ArrowRightLeft size={14} />
          Transferir
        </button>
      )}
    </div>
  )
}

export default function Mesas() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mesas, setMesas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferSource, setTransferSource] = useState(null)
  const [transferring, setTransferring] = useState(false)

  const carregarMesas = useCallback(async () => {
    try {
      const data = await getMesas()
      setMesas(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarMesas()
  }, [carregarMesas])

  // Escutar atualizacoes em tempo real
  useSocketEvent('mesa-atualizada', carregarMesas)
  useSocketEvent('pedido-criado', carregarMesas)
  useSocketEvent('pedido-fechado', carregarMesas)
  useSocketEvent('pedido-cancelado', carregarMesas)

  const handleMesaClick = (mesa) => {
    if (mesa.status === 'livre') {
      navigate(`/pdv/${mesa.id}`)
    } else if (mesa.pedido_id) {
      navigate(`/pdv/${mesa.id}`)
    }
  }

  const canTransfer = user && ['admin', 'gerente', 'garcom'].includes(user.perfil)

  const handleTransferir = (mesa) => {
    setTransferSource(mesa)
    setShowTransfer(true)
  }

  const executarTransferencia = async (mesaDestinoId) => {
    if (!transferSource?.pedido_id) return
    setTransferring(true)
    try {
      await transferirMesa(transferSource.pedido_id, mesaDestinoId)
      setShowTransfer(false)
      setTransferSource(null)
      carregarMesas()
    } catch (err) {
      alert('Erro ao transferir: ' + err.message)
    } finally {
      setTransferring(false)
    }
  }

  const mesasLivres = mesas.filter(m => m.status === 'livre')

  // Agrupar mesas por area_nome (ou localizacao como fallback)
  const mesasPorArea = mesas.reduce((acc, mesa) => {
    const local = mesa.area_nome || mesa.localizacao || 'outros'
    if (!acc[local]) acc[local] = []
    acc[local].push(mesa)
    return acc
  }, {})

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
        <p className="text-red-500 mb-4">Erro ao carregar mesas: {error}</p>
        <button onClick={carregarMesas} className="btn btn-primary">
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Mapa de Mesas</h2>

        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-400"></div>
            <span>Livre ({mesas.filter(m => m.status === 'livre').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary-400"></div>
            <span>Ocupada ({mesas.filter(m => m.status === 'ocupada').length})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-400"></div>
            <span>Reservada ({mesas.filter(m => m.status === 'reservada').length})</span>
          </div>
        </div>
      </div>

      {Object.entries(mesasPorArea).map(([area, mesasArea]) => (
        <div key={area} className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">
            {area}
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mesasArea.map(mesa => (
              <MesaCard
                key={mesa.id}
                mesa={mesa}
                onClick={handleMesaClick}
                onTransferir={canTransfer ? handleTransferir : null}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Transfer Modal */}
      {showTransfer && transferSource && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-2">Transferir Pedido</h2>
            <p className="text-gray-600 text-sm mb-4">
              Mesa <strong>{transferSource.numero}</strong> &rarr; Selecione o destino
            </p>

            {mesasLivres.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Nenhuma mesa livre disponivel</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {mesasLivres.map(mesa => (
                  <button
                    key={mesa.id}
                    onClick={() => executarTransferencia(mesa.id)}
                    disabled={transferring}
                    className="p-3 bg-green-50 border-2 border-green-300 rounded-lg hover:bg-green-100 transition-colors text-center disabled:opacity-50"
                  >
                    <span className="font-bold text-gray-800">
                      {mesa.numero === 'BAL' ? 'BAL' : mesa.numero}
                    </span>
                    {mesa.area_nome && (
                      <span className="block text-xs text-gray-500 mt-1">{mesa.area_nome}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => { setShowTransfer(false); setTransferSource(null) }}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
