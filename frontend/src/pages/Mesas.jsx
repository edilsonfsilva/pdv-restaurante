import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Clock, DollarSign, Plus } from 'lucide-react'
import { getMesas } from '../services/api'
import { useSocketEvent } from '../contexts/SocketContext'

function MesaCard({ mesa, onClick }) {
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
    <button
      onClick={() => onClick(mesa)}
      className={`
        card p-4 border-2 transition-all cursor-pointer
        ${statusColors[mesa.status]}
        ${mesa.status === 'ocupada' ? 'ring-2 ring-primary-300' : ''}
      `}
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-2xl font-bold text-gray-800">
          {mesa.numero === 'BAL' ? '🍺 Balcão' : `Mesa ${mesa.numero}`}
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
  )
}

export default function Mesas() {
  const navigate = useNavigate()
  const [mesas, setMesas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
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
  
  // Escutar atualizações em tempo real
  useSocketEvent('mesa-atualizada', carregarMesas)
  useSocketEvent('pedido-criado', carregarMesas)
  useSocketEvent('pedido-fechado', carregarMesas)
  useSocketEvent('pedido-cancelado', carregarMesas)
  
  const handleMesaClick = (mesa) => {
    if (mesa.status === 'livre') {
      // Ir para PDV para abrir novo pedido
      navigate(`/pdv/${mesa.id}`)
    } else if (mesa.pedido_id) {
      // Ir para PDV com pedido existente
      navigate(`/pdv/${mesa.id}`)
    }
  }
  
  // Agrupar mesas por localização
  const mesasPorLocal = mesas.reduce((acc, mesa) => {
    const local = mesa.localizacao || 'outros'
    if (!acc[local]) acc[local] = []
    acc[local].push(mesa)
    return acc
  }, {})
  
  const localLabels = {
    salao: '🏠 Salão',
    varanda: '🌿 Varanda',
    vip: '⭐ VIP',
    balcao: '🍺 Balcão',
    outros: '📍 Outros'
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
      
      {Object.entries(mesasPorLocal).map(([local, mesasLocal]) => (
        <div key={local} className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">
            {localLabels[local] || local}
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mesasLocal.map(mesa => (
              <MesaCard 
                key={mesa.id} 
                mesa={mesa} 
                onClick={handleMesaClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
