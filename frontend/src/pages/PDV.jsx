import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Minus, Trash2, X, Search, Send,
  CreditCard, ChevronLeft, MessageSquare
} from 'lucide-react'
import {
  getMesa, getCardapio, criarPedido,
  adicionarItem, removerItem, getPedido
} from '../services/api'
import { useSocketEvent } from '../contexts/SocketContext'
import ConfirmDialog from '../components/ConfirmDialog'

function ProdutoCard({ produto, onAdd }) {
  return (
    <button
      onClick={() => onAdd(produto)}
      className="card p-3 text-left hover:shadow-md transition-shadow"
    >
      <div className="font-medium text-gray-800 truncate">{produto.nome}</div>
      <div className="text-primary-600 font-bold mt-1">
        R$ {parseFloat(produto.preco).toFixed(2)}
      </div>
    </button>
  )
}

function ItemPedido({ item, onRemove, onUpdateQtd }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100">
      <div className="flex-1">
        <div className="font-medium text-gray-800">{item.produto_nome}</div>
        <div className="text-sm text-gray-500">
          R$ {parseFloat(item.preco_unitario).toFixed(2)} un.
        </div>
        {item.observacao && (
          <div className="text-xs text-primary-600 mt-1">
            📝 {item.observacao}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdateQtd(item, -1)}
          className="p-1 rounded bg-gray-100 hover:bg-gray-200"
        >
          <Minus size={16} />
        </button>
        <span className="w-8 text-center font-bold">{item.quantidade}</span>
        <button
          onClick={() => onUpdateQtd(item, 1)}
          className="p-1 rounded bg-gray-100 hover:bg-gray-200"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="w-20 text-right font-bold text-gray-800">
        R$ {parseFloat(item.subtotal).toFixed(2)}
      </div>

      <button
        onClick={() => onRemove(item)}
        className="p-1 text-red-500 hover:bg-red-50 rounded"
      >
        <Trash2 size={18} />
      </button>
    </div>
  )
}

function ModalObservacao({ produto, onConfirm, onCancel }) {
  const [quantidade, setQuantidade] = useState(1)
  const [observacao, setObservacao] = useState('')

  const handleQuantidadeChange = (value) => {
    const parsed = parseInt(value) || 1
    setQuantidade(Math.max(1, parsed))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{produto.nome}</h3>
            <p className="text-primary-600 font-bold">
              R$ {parseFloat(produto.preco).toFixed(2)}
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quantidade
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantidade(q => Math.max(1, q - 1))}
              className="btn btn-secondary"
            >
              <Minus size={20} />
            </button>
            <input
              type="number"
              value={quantidade}
              onChange={e => handleQuantidadeChange(e.target.value)}
              min="1"
              className={`input w-20 text-center text-xl font-bold ${quantidade < 1 ? 'input-error' : ''}`}
            />
            <button
              onClick={() => setQuantidade(q => q + 1)}
              className="btn btn-secondary"
            >
              <Plus size={20} />
            </button>
          </div>
          {quantidade < 1 && (
            <p className="text-red-500 text-sm mt-1">Quantidade minima: 1</p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MessageSquare size={16} className="inline mr-1" />
            Observacao
          </label>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value.slice(0, 200))}
            placeholder="Ex: sem cebola, bem passado..."
            className="input resize-none h-20"
            maxLength={200}
          />
          <div className="text-xs text-gray-400 text-right mt-1">
            {observacao.length}/200
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="btn btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm({ quantidade: Math.max(1, quantidade), observacao })}
            disabled={quantidade < 1}
            className="btn btn-primary flex-1"
          >
            Adicionar (R$ {(produto.preco * Math.max(1, quantidade)).toFixed(2)})
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PDV() {
  const { mesaId } = useParams()
  const navigate = useNavigate()

  const [mesa, setMesa] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [cardapio, setCardapio] = useState([])
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [produtoModal, setProdutoModal] = useState(null)

  // ConfirmDialog state
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmMessage, setConfirmMessage] = useState('')

  const openConfirm = (message, action) => {
    setConfirmMessage(message)
    setConfirmAction(() => action)
    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setShowConfirm(false)
    if (confirmAction) confirmAction()
    setConfirmAction(null)
  }

  const handleCancelConfirm = () => {
    setShowConfirm(false)
    setConfirmAction(null)
  }

  // Carregar dados iniciais
  useEffect(() => {
    async function carregarDados() {
      try {
        setLoading(true)

        // Carregar cardapio
        const cardapioData = await getCardapio()
        setCardapio(cardapioData)
        if (cardapioData.length > 0) {
          setCategoriaSelecionada(cardapioData[0].id)
        }

        // Carregar mesa se houver mesaId
        if (mesaId) {
          const mesaData = await getMesa(mesaId)
          setMesa(mesaData)
          setPedido(mesaData.pedido)
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [mesaId])

  // Recarregar pedido
  const recarregarPedido = useCallback(async () => {
    if (pedido?.id) {
      const pedidoAtualizado = await getPedido(pedido.id)
      setPedido(pedidoAtualizado)
    }
  }, [pedido?.id])

  // Socket events
  useSocketEvent('pedido-atualizado', (data) => {
    if (data.id === pedido?.id) {
      recarregarPedido()
    }
  })

  // Abrir pedido
  const abrirPedido = async () => {
    try {
      const novoPedido = await criarPedido({
        mesa_id: mesa?.id || null,
        tipo: mesa ? 'mesa' : 'balcao'
      })
      setPedido({ ...novoPedido, itens: [] })
    } catch (err) {
      alert('Erro ao abrir pedido: ' + err.message)
    }
  }

  // Adicionar item
  const handleAddProduto = (produto) => {
    if (!pedido) {
      abrirPedido().then(() => setProdutoModal(produto))
    } else {
      setProdutoModal(produto)
    }
  }

  const confirmarAddProduto = async ({ quantidade, observacao }) => {
    try {
      let pedidoAtual = pedido

      // Se nao tem pedido, criar um
      if (!pedidoAtual) {
        pedidoAtual = await criarPedido({
          mesa_id: mesa?.id || null,
          tipo: mesa ? 'mesa' : 'balcao'
        })
      }

      await adicionarItem(pedidoAtual.id, {
        produto_id: produtoModal.id,
        quantidade,
        observacao
      })

      // Recarregar pedido completo
      const pedidoAtualizado = await getPedido(pedidoAtual.id)
      setPedido(pedidoAtualizado)
      setProdutoModal(null)
    } catch (err) {
      alert('Erro ao adicionar item: ' + err.message)
    }
  }

  // Remover item
  const handleRemoverItem = async (item) => {
    openConfirm('Remover item do pedido?', async () => {
      try {
        await removerItem(pedido.id, item.id)
        recarregarPedido()
      } catch (err) {
        alert('Erro ao remover item: ' + err.message)
      }
    })
  }

  // Alterar quantidade (simplificado - remove e adiciona de novo)
  const handleUpdateQtd = async (item, delta) => {
    const novaQtd = item.quantidade + delta

    if (novaQtd <= 0) {
      handleRemoverItem(item)
      return
    }

    // Por simplicidade, remove e adiciona novamente
    try {
      await removerItem(pedido.id, item.id)
      await adicionarItem(pedido.id, {
        produto_id: item.produto_id,
        quantidade: novaQtd,
        observacao: item.observacao
      })
      recarregarPedido()
    } catch (err) {
      alert('Erro ao atualizar quantidade: ' + err.message)
    }
  }

  // Filtrar produtos
  const produtosFiltrados = () => {
    if (busca) {
      return cardapio.flatMap(cat =>
        cat.produtos.filter(p =>
          p.nome.toLowerCase().includes(busca.toLowerCase())
        )
      )
    }

    const categoria = cardapio.find(c => c.id === categoriaSelecionada)
    return categoria?.produtos || []
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Lado esquerdo - Cardapio */}
      <div className="flex-1 flex flex-col">
        {/* Header com busca */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              className="input pl-10"
            />
          </div>
        </div>

        {/* Categorias */}
        {!busca && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {cardapio.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaSelecionada(cat.id)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  categoriaSelecionada === cat.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cat.icone} {cat.nome}
              </button>
            ))}
          </div>
        )}

        {/* Grid de produtos */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {produtosFiltrados().map(produto => (
              <ProdutoCard
                key={produto.id}
                produto={produto}
                onAdd={handleAddProduto}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Lado direito - Pedido */}
      <div className="w-96 card flex flex-col">
        {/* Header do pedido */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg text-gray-800">
                {mesa ? `Mesa ${mesa.numero}` : 'Balcao'}
              </h3>
              {pedido && (
                <span className="text-sm text-gray-500">
                  Pedido #{pedido.id}
                </span>
              )}
            </div>
            {pedido && (
              <span className={`badge badge-${pedido.status}`}>
                {pedido.status}
              </span>
            )}
          </div>
        </div>

        {/* Itens do pedido */}
        <div className="flex-1 overflow-y-auto p-4">
          {!pedido || !pedido.itens?.length ? (
            <div className="text-center text-gray-400 py-12">
              <Send size={48} className="mx-auto mb-4 opacity-50" />
              <p>Nenhum item no pedido</p>
              <p className="text-sm">Clique em um produto para adicionar</p>
            </div>
          ) : (
            pedido.itens.map(item => (
              <ItemPedido
                key={item.id}
                item={item}
                onRemove={handleRemoverItem}
                onUpdateQtd={handleUpdateQtd}
              />
            ))
          )}
        </div>

        {/* Totais */}
        {pedido && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span>R$ {parseFloat(pedido.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Taxa de servico (10%)</span>
                <span>R$ {parseFloat(pedido.taxa_servico || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total</span>
                <span className="text-primary-600">
                  R$ {parseFloat(pedido.total || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate('/caixa?pedido=' + pedido.id)}
              disabled={!pedido.itens?.length}
              className="btn btn-success w-full mt-4"
            >
              <CreditCard size={20} className="mr-2" />
              Fechar Conta
            </button>
          </div>
        )}
      </div>

      {/* Modal de observacao */}
      {produtoModal && (
        <ModalObservacao
          produto={produtoModal}
          onConfirm={confirmarAddProduto}
          onCancel={() => setProdutoModal(null)}
        />
      )}

      {/* ConfirmDialog */}
      {showConfirm && (
        <ConfirmDialog
          message={confirmMessage}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      )}
    </div>
  )
}
