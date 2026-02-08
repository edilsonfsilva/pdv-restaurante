import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Relatorios from '../pages/Relatorios'

// Mock print utility
vi.mock('../utils/print', () => ({
  printContent: vi.fn(),
}))

vi.mock('../components/PrintTemplates', () => ({
  RelatorioDiario: vi.fn(() => '<div>print</div>'),
}))

// Helper: create a successful fetch mock response
function mockFetchOk(data) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

function mockFetchError(status, body = { error: 'Erro' }) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('Relatorios - Vendas tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('pdv_token', 'fake-token')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renderiza resumo de vendas com campos do backend (totais/receita_total)', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/relatorios/vendas')) {
        return mockFetchOk({
          periodos: [
            { periodo: '2025-01-15', total_pedidos: 12, receita_total: '450.00', ticket_medio: '37.50' },
            { periodo: '2025-01-16', total_pedidos: 8, receita_total: '320.00', ticket_medio: '40.00' },
          ],
          totais: { total_pedidos: 20, receita_total: '770.00', ticket_medio: '38.50' },
        })
      }
      return mockFetchOk([])
    })

    render(<Relatorios />)

    // Vendas e a aba padrao - verificar que os totais aparecem
    await waitFor(() => {
      expect(screen.getByText('20')).toBeInTheDocument()
    })

    // Faturamento deve mostrar R$ 770,00 (receita_total do backend)
    expect(screen.getByText(/770/)).toBeInTheDocument()

    // Ticket medio deve mostrar R$ 38.50
    expect(screen.getByText(/38\.50/)).toBeInTheDocument()
  })

  it('renderiza tabela de periodos com dados do backend', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/relatorios/vendas')) {
        return mockFetchOk({
          periodos: [
            { periodo: '2025-01-15', total_pedidos: 7, receita_total: '450.00', ticket_medio: '64.29' },
          ],
          totais: { total_pedidos: 7, receita_total: '450.00', ticket_medio: '64.29' },
        })
      }
      return mockFetchOk([])
    })

    render(<Relatorios />)

    // Verifica data formatada (15/01/2025) - indica que a tabela de periodos renderizou
    await waitFor(() => {
      expect(screen.getByText('15/01/2025')).toBeInTheDocument()
    })

    // Receita aparece no resumo e na tabela
    const matches = screen.getAllByText(/450/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('nao quebra quando vendas retorna periodos vazio', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/relatorios/vendas')) {
        return mockFetchOk({
          periodos: [],
          totais: { total_pedidos: 0, receita_total: '0.00', ticket_medio: '0.00' },
        })
      }
      return mockFetchOk([])
    })

    render(<Relatorios />)

    await waitFor(() => {
      expect(screen.getByText('Total Pedidos')).toBeInTheDocument()
    })

    // Nao deve ter tabela de detalhes quando periodos esta vazio
    expect(screen.queryByText('Data')).not.toBeInTheDocument()
  })
})

describe('Relatorios - Pagamentos tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('pdv_token', 'fake-token')
    // Default: vendas tab loads first
    global.fetch.mockImplementation((url) => {
      if (url.includes('/relatorios/vendas')) {
        return mockFetchOk({ periodos: [], totais: { total_pedidos: 0, receita_total: 0, ticket_medio: 0 } })
      }
      if (url.includes('/relatorios/formas-pagamento')) {
        return mockFetchOk([
          { forma: 'pix', quantidade: 5, total: '150.00' },
          { forma: 'dinheiro', quantidade: 3, total: '90.00' },
          { forma: 'credito', quantidade: 2, total: '80.00' },
        ])
      }
      return mockFetchOk([])
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('chama endpoint /relatorios/formas-pagamento ao clicar na aba Pagamentos', async () => {
    render(<Relatorios />)

    // Espera a aba de vendas carregar primeiro
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/relatorios/vendas'),
        expect.any(Object)
      )
    })

    // Clicar na aba Pagamentos
    const pagamentosTab = screen.getByRole('button', { name: /pagamentos/i })
    await userEvent.click(pagamentosTab)

    // Deve chamar formas-pagamento, NAO /relatorios/pagamentos
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/relatorios/formas-pagamento'),
        expect.any(Object)
      )
    })

    // Verificar que NÃO chamou /relatorios/pagamentos (endpoint incorreto)
    const calls = global.fetch.mock.calls.map(c => c[0])
    const badCalls = calls.filter(url => url.includes('/relatorios/pagamentos') && !url.includes('formas-pagamento'))
    expect(badCalls).toHaveLength(0)
  })

  it('renderiza tabela de pagamentos com dados corretos', async () => {
    render(<Relatorios />)

    // Navegar para aba Pagamentos
    const pagamentosTab = screen.getByRole('button', { name: /pagamentos/i })
    await userEvent.click(pagamentosTab)

    // Verificar que os dados de pagamento aparecem
    await waitFor(() => {
      expect(screen.getByText('PIX')).toBeInTheDocument()
    })
    expect(screen.getByText('Dinheiro')).toBeInTheDocument()
    expect(screen.getByText('Cartao Credito')).toBeInTheDocument()
  })

  it('exibe mensagem de erro quando endpoint retorna erro', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/relatorios/vendas')) {
        return mockFetchOk({ periodos: [], totais: { total_pedidos: 0, receita_total: 0, ticket_medio: 0 } })
      }
      if (url.includes('/relatorios/formas-pagamento')) {
        return mockFetchError(500, { error: 'Erro interno do servidor' })
      }
      return mockFetchOk([])
    })

    render(<Relatorios />)

    const pagamentosTab = screen.getByRole('button', { name: /pagamentos/i })
    await userEvent.click(pagamentosTab)

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar relatorio/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/tentar novamente/i)).toBeInTheDocument()
  })

  it('envia Authorization header com token', async () => {
    render(<Relatorios />)

    const pagamentosTab = screen.getByRole('button', { name: /pagamentos/i })
    await userEvent.click(pagamentosTab)

    await waitFor(() => {
      const pagamentosCall = global.fetch.mock.calls.find(c =>
        c[0].includes('/relatorios/formas-pagamento')
      )
      expect(pagamentosCall).toBeDefined()
      expect(pagamentosCall[1].headers.Authorization).toBe('Bearer fake-token')
    })
  })

  it('cada tab chama seu endpoint correto', async () => {
    // Mapear quais endpoints cada tab deve chamar
    const tabEndpoints = {
      'Produtos': '/relatorios/produtos',
      'Categorias': '/relatorios/categorias',
      'Garcons': '/relatorios/garcons',
      'Horarios': '/relatorios/horarios',
      'Pagamentos': '/relatorios/formas-pagamento',
    }

    render(<Relatorios />)

    // Esperar vendas carregar
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    for (const [tabLabel, expectedEndpoint] of Object.entries(tabEndpoints)) {
      global.fetch.mockClear()

      const tab = screen.getByRole('button', { name: new RegExp(tabLabel, 'i') })
      await userEvent.click(tab)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(expectedEndpoint),
          expect.any(Object)
        )
      })
    }
  })
})
