import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  CreditCard, Banknote, QrCode, Receipt,
  CheckCircle, X, ChevronLeft, Search,
  DollarSign, TrendingUp, Printer
} from 'lucide-react'
import {
  getPedidos, getPedido, registrarPagamento,
  fecharPedido, getResumoPagamentos
} from '../services/api'
import { useSocketEvent } from '../contexts/SocketContext'
import Pagination from '../components/Pagination'
import ConfirmDialog from '../components/ConfirmDialog'
import { printContent } from '../utils/print'
import { CupomPagamento } from '../components/PrintTemplates'

const formasPagamento = [
  { id: 'dinheiro', nome: 'Dinheiro', icone: Banknote, cor: 'green' },
  { id: 'pix', nome: 'PIX', icone: QrCode, cor: 'purple' },
  { id: 'credito', nome: 'Credito', icone: CreditCard, cor: 'blue' },
  { id: 'debito', nome: 'Debito', icone: CreditCard, cor: 'cyan' },
]

function PedidoResumo({ pedido, onClick, isSelected }) {
  return (
    <button
      onClick={onClick}
      className={`
        card p-4 text-left w-full transition-all
        ${isSelected ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:shadow-md'}
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <span className="font-bold text-lg">#{pedido.id}</span>
          {pedido.mesa_numero && (
            <span className="text-gray-500 ml-2">Mesa {pedido.mesa_numero}</span>
          )}
        </div>
        <span className={`badge badge-${pedido.status}`}>
          {pedido.status}
        </span>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {pedido.qtd_itens} {pedido.qtd_itens === 1 ? 'item' : 'itens'}
        </span>
        <span className="text-xl font-bold text-primary-600">
          R$ {parseFloat(pedido.total).toFixed(2)}
        </span>
      </div>
    </button>
  )
}

function FormaPagamentoBtn({ forma, isSelected, onClick }) {
  const Icon = forma.icone
  const cores = {
    green: 'bg-green-100 border-green-400 text-green-700',
    purple: 'bg-purple-100 border-purple-400 text-purple-700',
    blue: 'bg-blue-100 border-blue-400 text-blue-700',
    cyan: 'bg-cyan-100 border-cyan-400 text-cyan-700',
  }

  return (
    <button
      onClick={onClick}
      className={`
        p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all
        ${isSelected
          ? `${cores[forma.cor]} ring-2 ring-offset-2 ring-${forma.cor}-500`
          : 'bg-white border-gray-200 hover:border-gray-300'
        }
      `}
    >
      <Icon size={32} />
      <span className="font-medium">{forma.nome}</span>
    </button>
  )
}

export default function Caixa() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [pedidos, setPedidos] = useState([])
  const [pedidoSelecionado, setPedidoSelecionado] = useState(null)
  const [formaSelecionada, setFormaSelecionada] = useState(null)
  const [valorPagamento, setValorPagamento] = useState('')
  const [valorRecebido, setValorRecebido] = useState('')
  const [resumoDia, setResumoDia] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [valorError, setValorError] = useState('')

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

  // Carregar pedidos prontos para pagamento
  const carregarPedidos = useCallback(async () => {
    try {
      const dataProonto = await getPedidos({ status: 'pronto' })
      const prontos = dataProonto.data || dataProonto
      // Incluir tambem abertos e em producao
      const dataAbertos = await getPedidos({ status: 'aberto' })
      const abertos = dataAbertos.data || dataAbertos
      const dataProducao = await getPedidos({ status: 'producao' })
      const producao = dataProducao.data || dataProducao
      setPedidos([...prontos, ...producao, ...abertos])
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarResumo = useCallback(async () => {
    try {
      const data = await getResumoPagamentos()
      setResumoDia(data)
    } catch (err) {
      console.error('Erro ao carregar resumo:', err)
    }
  }, [])

  useEffect(() => {
    carregarPedidos()
    carregarResumo()

    // Verificar se veio com pedido na URL
    const pedidoId = searchParams.get('pedido')
    if (pedidoId) {
      getPedido(pedidoId).then(p => {
        setPedidoSelecionado(p)
        setValorPagamento(parseFloat(p.total).toFixed(2))
      })
    }
  }, [carregarPedidos, carregarResumo, searchParams])

  // Socket events
  useSocketEvent('pedido-atualizado', carregarPedidos)
  useSocketEvent('pedido-fechado', () => {
    carregarPedidos()
    carregarResumo()
  })
  useSocketEvent('pagamento-registrado', carregarResumo)

  const selecionarPedido = async (pedido) => {
    const pedidoCompleto = await getPedido(pedido.id)
    setPedidoSelecionado(pedidoCompleto)

    // Calcular valor restante
    const totalPago = pedidoCompleto.pagamentos?.reduce(
      (acc, p) => acc + parseFloat(p.valor), 0
    ) || 0
    const restante = parseFloat(pedidoCompleto.total) - totalPago
    setValorPagamento(restante.toFixed(2))
    setFormaSelecionada(null)
    setValorRecebido('')
    setValorError('')
  }

  const calcularTroco = () => {
    if (formaSelecionada !== 'dinheiro') return 0
    const recebido = parseFloat(valorRecebido) || 0
    const valor = parseFloat(valorPagamento) || 0
    return Math.max(0, recebido - valor)
  }

  const calcularRestante = () => {
    if (!pedidoSelecionado) return 0
    const totalPago = pedidoSelecionado.pagamentos?.reduce(
      (acc, p) => acc + parseFloat(p.valor), 0
    ) || 0
    return parseFloat(pedidoSelecionado.total) - totalPago
  }

  // Validate payment amount
  const validarValorPagamento = (valor) => {
    const valorNum = parseFloat(valor)
    const restante = calcularRestante()

    if (isNaN(valorNum) || valorNum <= 0) {
      setValorError('Valor deve ser maior que zero')
      return false
    }
    if (valorNum > restante) {
      setValorError(`Valor nao pode exceder o restante (R$ ${restante.toFixed(2)})`)
      return false
    }
    setValorError('')
    return true
  }

  const handleValorPagamentoChange = (value) => {
    setValorPagamento(value)
    if (value) {
      validarValorPagamento(value)
    } else {
      setValorError('')
    }
  }

  const handlePagamento = async () => {
    if (!formaSelecionada || !valorPagamento) return

    if (!validarValorPagamento(valorPagamento)) return

    setProcessando(true)

    try {
      const resultado = await registrarPagamento({
        pedido_id: pedidoSelecionado.id,
        forma: formaSelecionada,
        valor: parseFloat(valorPagamento),
        troco: calcularTroco()
      })

      if (resultado.pagamento_completo) {
        // Fechar pedido automaticamente
        await fecharPedido(pedidoSelecionado.id)

        // Print receipt
        const cupomData = {
          pedido: pedidoSelecionado,
          pagamento: {
            forma: formaSelecionada,
            valor: parseFloat(valorPagamento),
            troco: calcularTroco()
          }
        }

        alert('Pagamento realizado e pedido fechado!')

        // Offer print
        openConfirm('Deseja imprimir o cupom de pagamento?', () => {
          printContent(CupomPagamento(cupomData))
        })

        setPedidoSelecionado(null)
        setFormaSelecionada(null)
        setValorPagamento('')
        setValorRecebido('')
        setValorError('')
        carregarPedidos()
        carregarResumo()
      } else {
        alert(`Pagamento parcial registrado! Restam R$ ${resultado.restante}`)
        selecionarPedido({ id: pedidoSelecionado.id })
      }
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setProcessando(false)
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
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Coluna esquerda - Lista de pedidos */}
      <div className="w-80 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => navigate('/')} className="btn btn-secondary">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-xl font-bold">Pedidos Abertos</h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {pedidos.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Receipt size={48} className="mx-auto mb-2 opacity-50" />
              <p>Nenhum pedido aberto</p>
            </div>
          ) : (
            pedidos.map(pedido => (
              <PedidoResumo
                key={pedido.id}
                pedido={pedido}
                isSelected={pedidoSelecionado?.id === pedido.id}
                onClick={() => selecionarPedido(pedido)}
              />
            ))
          )}
        </div>

        {/* Resumo do dia */}
        {resumoDia && (
          <div className="card p-4 mt-4 bg-gradient-to-r from-green-50 to-primary-50">
            <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
              <TrendingUp size={18} />
              Resumo do Dia
            </h3>
            <div className="text-2xl font-bold text-green-600">
              R$ {resumoDia.total_geral.toFixed(2)}
            </div>
            <div className="text-sm text-gray-500">
              {resumoDia.total_pedidos} pedidos fechados
            </div>
          </div>
        )}
      </div>

      {/* Coluna central - Detalhes e pagamento */}
      <div className="flex-1 card p-6">
        {!pedidoSelecionado ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <CreditCard size={64} className="mx-auto mb-4 opacity-50" />
              <p className="text-xl">Selecione um pedido</p>
              <p className="text-sm">para processar o pagamento</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header do pedido */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold">
                  Pedido #{pedidoSelecionado.id}
                </h3>
                {pedidoSelecionado.mesa_numero && (
                  <p className="text-gray-500">Mesa {pedidoSelecionado.mesa_numero}</p>
                )}
              </div>
              <button
                onClick={() => setPedidoSelecionado(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            {/* Itens do pedido */}
            <div className="mb-6 max-h-48 overflow-y-auto">
              <h4 className="font-semibold text-gray-700 mb-2">Itens</h4>
              {pedidoSelecionado.itens?.map(item => (
                <div key={item.id} className="flex justify-between text-sm py-1 border-b">
                  <span>{item.quantidade}x {item.produto_nome}</span>
                  <span>R$ {parseFloat(item.subtotal).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Subtotal</span>
                <span>R$ {parseFloat(pedidoSelecionado.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-600">Taxa de servico</span>
                <span>R$ {parseFloat(pedidoSelecionado.taxa_servico).toFixed(2)}</span>
              </div>
              {pedidoSelecionado.pagamentos?.length > 0 && (
                <div className="flex justify-between mb-1 text-green-600">
                  <span>Ja pago</span>
                  <span>
                    - R$ {pedidoSelecionado.pagamentos.reduce(
                      (acc, p) => acc + parseFloat(p.valor), 0
                    ).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold pt-2 border-t">
                <span>A pagar</span>
                <span className="text-primary-600">
                  R$ {calcularRestante().toFixed(2)}
                </span>
              </div>
            </div>

            {/* Formas de pagamento */}
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-3">Forma de Pagamento</h4>
              <div className="grid grid-cols-4 gap-3">
                {formasPagamento.map(forma => (
                  <FormaPagamentoBtn
                    key={forma.id}
                    forma={forma}
                    isSelected={formaSelecionada === forma.id}
                    onClick={() => setFormaSelecionada(forma.id)}
                  />
                ))}
              </div>
            </div>

            {/* Valores */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor do Pagamento
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="number"
                    step="0.01"
                    value={valorPagamento}
                    onChange={e => handleValorPagamentoChange(e.target.value)}
                    className={`input pl-10 text-xl font-bold ${valorError ? 'input-error' : ''}`}
                  />
                </div>
                {valorError && (
                  <p className="text-red-500 text-sm mt-1">{valorError}</p>
                )}
              </div>

              {formaSelecionada === 'dinheiro' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor Recebido
                  </label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="number"
                      step="0.01"
                      value={valorRecebido}
                      onChange={e => setValorRecebido(e.target.value)}
                      className="input pl-10 text-xl font-bold"
                      placeholder="0.00"
                    />
                  </div>
                  {calcularTroco() > 0 && (
                    <div className="mt-2 text-lg font-bold text-green-600">
                      Troco: R$ {calcularTroco().toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botao de pagamento */}
            <button
              onClick={handlePagamento}
              disabled={!formaSelecionada || !valorPagamento || processando || !!valorError}
              className="btn btn-success w-full py-4 text-lg"
            >
              {processando ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Processando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle size={24} />
                  Confirmar Pagamento
                </span>
              )}
            </button>
          </>
        )}
      </div>

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
