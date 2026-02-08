import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, Calendar, Download, Loader2, Printer,
  ShoppingBag, Tag, Users, Clock, CreditCard, TrendingUp
} from 'lucide-react'
import { printContent } from '../utils/print'
import { RelatorioDiario } from '../components/PrintTemplates'

const API_URL = '/api'

async function authRequest(endpoint) {
  const token = localStorage.getItem('pdv_token')
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  return response.json()
}

// Helper: format date to YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function formatCurrency(val) {
  return `R$ ${parseFloat(val || 0).toFixed(2)}`
}

// --- Tab components ---

function TabelaVendas({ data }) {
  if (!data) return null
  const resumo = data.totais || data.resumo || data
  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Pedidos</div>
          <div className="text-2xl font-bold text-gray-800">{resumo.total_pedidos || 0}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Faturamento</div>
          <div className="text-2xl font-bold text-primary-600">{formatCurrency(resumo.faturamento_bruto || resumo.receita_total || resumo.faturamento)}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Ticket Medio</div>
          <div className="text-2xl font-bold text-gray-800">{formatCurrency(resumo.ticket_medio)}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Cancelados</div>
          <div className="text-2xl font-bold text-red-500">{resumo.pedidos_cancelados || 0}</div>
        </div>
      </div>

      {/* Daily breakdown table if available */}
      {(data.periodos || data.por_dia) && (data.periodos || data.por_dia).length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-3 font-medium text-gray-600">Data</th>
                <th className="text-right p-3 font-medium text-gray-600">Pedidos</th>
                <th className="text-right p-3 font-medium text-gray-600">Faturamento</th>
                <th className="text-right p-3 font-medium text-gray-600">Ticket Medio</th>
              </tr>
            </thead>
            <tbody>
              {(data.periodos || data.por_dia).map((dia, i) => {
                const dataStr = dia.periodo || dia.data
                const dateDisplay = dataStr ? new Date(dataStr.length === 10 ? dataStr + 'T12:00:00' : dataStr).toLocaleDateString('pt-BR') : '-'
                return (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3">{dateDisplay}</td>
                    <td className="p-3 text-right">{dia.total_pedidos || dia.pedidos || 0}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(dia.receita_total || dia.faturamento)}</td>
                    <td className="p-3 text-right">{formatCurrency(dia.ticket_medio)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabelaProdutos({ data }) {
  if (!data || !data.length) return <p className="text-gray-500">Nenhum dado encontrado.</p>
  const maxQtd = Math.max(...data.map((p) => p.quantidade_vendida || p.quantidade || 0), 1)

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600">#</th>
            <th className="text-left p-3 font-medium text-gray-600">Produto</th>
            <th className="text-right p-3 font-medium text-gray-600">Qtd</th>
            <th className="text-right p-3 font-medium text-gray-600">Receita</th>
            <th className="p-3 font-medium text-gray-600 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((prod, i) => {
            const qtd = prod.quantidade_vendida || prod.quantidade || 0
            const pct = (qtd / maxQtd) * 100
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 text-gray-400">{i + 1}</td>
                <td className="p-3 font-medium">{prod.nome || prod.produto_nome}</td>
                <td className="p-3 text-right">{qtd}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(prod.receita || prod.total)}</td>
                <td className="p-3">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaCategorias({ data }) {
  if (!data || !data.length) return <p className="text-gray-500">Nenhum dado encontrado.</p>
  const maxVal = Math.max(...data.map((c) => parseFloat(c.receita || c.total || 0)), 1)

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600">Categoria</th>
            <th className="text-right p-3 font-medium text-gray-600">Itens Vendidos</th>
            <th className="text-right p-3 font-medium text-gray-600">Receita</th>
            <th className="p-3 font-medium text-gray-600 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((cat, i) => {
            const val = parseFloat(cat.receita || cat.total || 0)
            const pct = (val / maxVal) * 100
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 font-medium">{cat.nome || cat.categoria_nome || cat.categoria}</td>
                <td className="p-3 text-right">{cat.quantidade_vendida || cat.quantidade || 0}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(val)}</td>
                <td className="p-3">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaGarcons({ data }) {
  if (!data || !data.length) return <p className="text-gray-500">Nenhum dado encontrado.</p>
  const maxVal = Math.max(...data.map((g) => parseFloat(g.faturamento || g.total || 0)), 1)

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600">Garcom</th>
            <th className="text-right p-3 font-medium text-gray-600">Pedidos</th>
            <th className="text-right p-3 font-medium text-gray-600">Faturamento</th>
            <th className="text-right p-3 font-medium text-gray-600">Ticket Medio</th>
            <th className="p-3 font-medium text-gray-600 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((g, i) => {
            const val = parseFloat(g.faturamento || g.total || 0)
            const pct = (val / maxVal) * 100
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 font-medium">{g.nome || g.garcom_nome}</td>
                <td className="p-3 text-right">{g.total_pedidos || g.pedidos || 0}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(val)}</td>
                <td className="p-3 text-right">{formatCurrency(g.ticket_medio)}</td>
                <td className="p-3">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaHorarios({ data }) {
  if (!data || !data.length) return <p className="text-gray-500">Nenhum dado encontrado.</p>
  const maxPedidos = Math.max(...data.map((h) => h.total_pedidos || h.pedidos || 0), 1)

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600">Horario</th>
            <th className="text-right p-3 font-medium text-gray-600">Pedidos</th>
            <th className="text-right p-3 font-medium text-gray-600">Faturamento</th>
            <th className="p-3 font-medium text-gray-600 w-48"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => {
            const pedidos = h.total_pedidos || h.pedidos || 0
            const pct = (pedidos / maxPedidos) * 100
            const hora = h.hora !== undefined ? `${String(h.hora).padStart(2, '0')}:00` : h.faixa || h.horario
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 font-medium">{hora}</td>
                <td className="p-3 text-right">{pedidos}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(h.faturamento || h.total)}</td>
                <td className="p-3">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaPagamentos({ data }) {
  if (!data || !data.length) return <p className="text-gray-500">Nenhum dado encontrado.</p>
  const totalGeral = data.reduce((s, p) => s + parseFloat(p.total || p.valor || 0), 0)

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-600">Metodo</th>
            <th className="text-right p-3 font-medium text-gray-600">Quantidade</th>
            <th className="text-right p-3 font-medium text-gray-600">Total</th>
            <th className="text-right p-3 font-medium text-gray-600">%</th>
            <th className="p-3 font-medium text-gray-600 w-40"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => {
            const val = parseFloat(p.total || p.valor || 0)
            const pct = totalGeral > 0 ? (val / totalGeral) * 100 : 0
            const metodosMap = {
              dinheiro: 'Dinheiro',
              credito: 'Cartao Credito',
              debito: 'Cartao Debito',
              pix: 'PIX',
            }
            const metodo = p.metodo || p.forma
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 font-medium">{metodosMap[metodo] || metodo}</td>
                <td className="p-3 text-right">{p.quantidade || p.count || 0}</td>
                <td className="p-3 text-right font-medium">{formatCurrency(val)}</td>
                <td className="p-3 text-right">{pct.toFixed(1)}%</td>
                <td className="p-3">
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-bold">
            <td className="p-3">Total</td>
            <td className="p-3 text-right">
              {data.reduce((s, p) => s + (p.quantidade || p.count || 0), 0)}
            </td>
            <td className="p-3 text-right">{formatCurrency(totalGeral)}</td>
            <td className="p-3 text-right">100%</td>
            <td className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// --- Tab config ---

const TABS = [
  { id: 'vendas', label: 'Vendas', icon: TrendingUp },
  { id: 'produtos', label: 'Produtos', icon: ShoppingBag },
  { id: 'categorias', label: 'Categorias', icon: Tag },
  { id: 'garcons', label: 'Garcons', icon: Users },
  { id: 'horarios', label: 'Horarios', icon: Clock },
  { id: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
]

// --- Main component ---

export default function Relatorios() {
  const [activeTab, setActiveTab] = useState('vendas')
  const [dataInicio, setDataInicio] = useState(thirtyDaysAgoStr())
  const [dataFim, setDataFim] = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reportData, setReportData] = useState({})

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Mapear tab IDs para endpoints do backend
      const endpointMap = {
        pagamentos: 'formas-pagamento',
      }
      const endpoint = endpointMap[activeTab] || activeTab
      const params = `?data_inicio=${dataInicio}&data_fim=${dataFim}`
      const result = await authRequest(`/relatorios/${endpoint}${params}`)
      setReportData((prev) => ({ ...prev, [activeTab]: result }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, dataInicio, dataFim])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handlePrint = () => {
    if (activeTab === 'vendas' && reportData.vendas) {
      const resumo = reportData.vendas.resumo || reportData.vendas
      const html = RelatorioDiario({ resumo, data: dataFim })
      printContent(html, 'Relatorio Diario')
    }
  }

  const currentData = reportData[activeTab]

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={32} className="animate-spin text-primary-500" />
        </div>
      )
    }

    if (error) {
      return (
        <div className="card p-6 text-center">
          <p className="text-red-500 mb-4">Erro ao carregar relatorio: {error}</p>
          <button onClick={fetchReport} className="btn btn-primary">
            Tentar novamente
          </button>
        </div>
      )
    }

    switch (activeTab) {
      case 'vendas':
        return <TabelaVendas data={currentData} />
      case 'produtos':
        return <TabelaProdutos data={currentData?.produtos || currentData || []} />
      case 'categorias':
        return <TabelaCategorias data={currentData?.categorias || currentData || []} />
      case 'garcons':
        return <TabelaGarcons data={currentData?.garcons || currentData || []} />
      case 'horarios':
        return <TabelaHorarios data={currentData?.horarios || currentData || []} />
      case 'pagamentos':
        return <TabelaPagamentos data={currentData?.pagamentos || currentData || []} />
      default:
        return null
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 size={28} className="text-primary-500" />
          <h2 className="text-2xl font-bold text-gray-800">Relatorios</h2>
        </div>

        {/* Date range picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-400" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="input w-auto"
            />
          </div>
          <span className="text-gray-400">ate</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="input w-auto"
            />
          </div>
          {activeTab === 'vendas' && (
            <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-1">
              <Printer size={18} />
              Imprimir
            </button>
          )}
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {renderTabContent()}
    </div>
  )
}
