import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock, CheckCircle, ChefHat, AlertTriangle, Printer, Loader2 } from 'lucide-react'
import { getPedidosCozinha, atualizarItemStatus } from '../services/api'
import { useSocketEvent, useSocketRoom } from '../contexts/SocketContext'
import { printContent } from '../utils/print'
import { ComandaCozinha } from '../components/PrintTemplates'

function ItemCard({ item, onStatusChange, disabled }) {
  const isUrgente = item.espera > 15
  const statusColors = {
    pendente: 'border-yellow-400 bg-yellow-50',
    preparando: 'border-blue-400 bg-blue-50',
  }

  return (
    <div
      className={`
        p-3 rounded-lg border-2 mb-2
        ${statusColors[item.status]}
        ${isUrgente ? 'animate-pulse-border' : ''}
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-800">
            {item.quantidade}x
          </span>
          <span className="font-medium text-gray-800">{item.produto}</span>
        </div>

        <div className={`flex items-center gap-1 text-sm ${isUrgente ? 'text-red-600' : 'text-gray-500'}`}>
          {isUrgente && <AlertTriangle size={16} />}
          <Clock size={14} />
          <span>{item.espera} min</span>
        </div>
      </div>

      {item.observacao && (
        <div className="bg-white/60 rounded p-2 mb-2 text-sm text-primary-700">
          📝 {item.observacao}
        </div>
      )}

      <div className="flex gap-2">
        {item.status === 'pendente' && (
          <button
            onClick={() => onStatusChange(item, 'preparando')}
            disabled={disabled}
            className="btn btn-secondary flex-1 text-sm disabled:opacity-50"
          >
            {disabled ? <Loader2 size={16} className="mr-1 animate-spin" /> : <ChefHat size={16} className="mr-1" />}
            Preparando
          </button>
        )}

        <button
          onClick={() => onStatusChange(item, 'pronto')}
          disabled={disabled}
          className="btn btn-success flex-1 text-sm disabled:opacity-50"
        >
          {disabled ? <Loader2 size={16} className="mr-1 animate-spin" /> : <CheckCircle size={16} className="mr-1" />}
          Pronto
        </button>
      </div>
    </div>
  )
}

function PedidoCard({ pedido, onItemStatusChange, onPrint, updatingItems }) {
  const tempoTotal = Math.max(...pedido.itens.map(i => i.espera))
  const isUrgente = tempoTotal > 20

  return (
    <div className={`card overflow-hidden ${isUrgente ? 'ring-2 ring-red-400' : ''}`}>
      {/* Header */}
      <div className={`
        px-4 py-3 flex justify-between items-center
        ${isUrgente ? 'bg-red-100' : 'bg-primary-100'}
      `}>
        <div>
          <span className="text-2xl font-bold">
            {pedido.mesa || 'Balcao'}
          </span>
          <span className="text-sm text-gray-600 ml-2">
            #{pedido.id}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPrint(pedido)}
            className="p-1.5 rounded-lg hover:bg-white/50 transition-colors text-gray-600 hover:text-gray-800"
            title="Imprimir comanda"
          >
            <Printer size={18} />
          </button>

          <div className={`flex items-center gap-1 ${isUrgente ? 'text-red-600' : 'text-gray-600'}`}>
            <Clock size={18} />
            <span className="font-bold">{tempoTotal} min</span>
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="p-4">
        {pedido.itens.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            disabled={updatingItems.has(item.id)}
            onStatusChange={(item, status) => onItemStatusChange(pedido.id, item.id, status)}
          />
        ))}
      </div>
    </div>
  )
}

export default function KDS() {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingItems, setUpdatingItems] = useState(new Set())
  const debounceRef = useRef(null)

  // Entrar na sala da cozinha para receber eventos
  useSocketRoom('cozinha')

  const carregarPedidos = useCallback(async () => {
    try {
      const data = await getPedidosCozinha()
      setPedidos(data)
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce para evitar múltiplas chamadas simultâneas via Socket events
  const carregarPedidosDebounced = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      carregarPedidos()
    }, 300)
  }, [carregarPedidos])

  useEffect(() => {
    carregarPedidos()

    // Atualizar a cada 30 segundos
    const interval = setInterval(carregarPedidos, 30000)
    return () => {
      clearInterval(interval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [carregarPedidos])

  // Socket events - usar versão debounced para evitar flood de chamadas
  useSocketEvent('novo-item', carregarPedidosDebounced)
  useSocketEvent('item-atualizado', carregarPedidosDebounced)
  useSocketEvent('pedido-criado', carregarPedidosDebounced)
  useSocketEvent('pedido-cancelado', carregarPedidosDebounced)

  const handleItemStatusChange = async (pedidoId, itemId, status) => {
    // Evitar cliques duplos - se já está atualizando este item, ignorar
    if (updatingItems.has(itemId)) return

    setUpdatingItems(prev => new Set(prev).add(itemId))

    try {
      await atualizarItemStatus(pedidoId, itemId, status)

      // Atualizar localmente para feedback imediato
      if (status === 'pronto') {
        setPedidos(prev =>
          prev.map(p => ({
            ...p,
            itens: p.id === pedidoId ? p.itens.filter(i => i.id !== itemId) : p.itens
          })).filter(p => p.itens.length > 0)
        )
      } else {
        // Atualizar status do item localmente
        setPedidos(prev =>
          prev.map(p => ({
            ...p,
            itens: p.id === pedidoId
              ? p.itens.map(i => i.id === itemId ? { ...i, status } : i)
              : p.itens
          }))
        )
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err)
      // Recarregar para garantir estado correto após erro
      carregarPedidos()
    } finally {
      setUpdatingItems(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handlePrintComanda = (pedido) => {
    printContent(ComandaCozinha({ pedido }))
  }

  // Estatisticas
  const totalItens = pedidos.reduce((acc, p) => acc + p.itens.length, 0)
  const itensPendentes = pedidos.reduce(
    (acc, p) => acc + p.itens.filter(i => i.status === 'pendente').length,
    0
  )
  const itensPreparando = pedidos.reduce(
    (acc, p) => acc + p.itens.filter(i => i.status === 'preparando').length,
    0
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header com estatisticas */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ChefHat size={28} />
          Cozinha (KDS)
        </h2>

        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800">{pedidos.length}</div>
            <div className="text-sm text-gray-500">Pedidos</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">{itensPendentes}</div>
            <div className="text-sm text-gray-500">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{itensPreparando}</div>
            <div className="text-sm text-gray-500">Preparando</div>
          </div>
        </div>
      </div>

      {/* Grid de pedidos */}
      {pedidos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <ChefHat size={64} className="mx-auto mb-4 opacity-50" />
            <p className="text-xl">Nenhum pedido em producao</p>
            <p className="text-sm">Os pedidos aparecerao aqui automaticamente</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 h-full pb-4">
            {pedidos.map(pedido => (
              <div key={pedido.id} className="w-80 flex-shrink-0">
                <PedidoCard
                  pedido={pedido}
                  onItemStatusChange={handleItemStatusChange}
                  onPrint={handlePrintComanda}
                  updatingItems={updatingItems}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
