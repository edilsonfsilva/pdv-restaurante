import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth
const mockLogin = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    isAuthenticated: false,
    loading: false,
    hasRole: () => false,
  }),
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza campos de email e senha', () => {
    renderLogin()

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('mostra titulo PDV Restaurante', () => {
    renderLogin()
    expect(screen.getByText('PDV Restaurante')).toBeInTheDocument()
  })

  it('mostra erro de validacao para email vazio ao submeter', async () => {
    renderLogin()

    const submitBtn = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/email.*obrigat/i)).toBeInTheDocument()
    })
  })

  it('mostra erro de validacao para senha vazia', async () => {
    renderLogin()

    const emailInput = screen.getByLabelText(/email/i)
    await userEvent.type(emailInput, 'test@test.com')

    const submitBtn = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/senha.*obrigat/i)).toBeInTheDocument()
    })
  })

  it('mostra erro de validacao para senha curta', async () => {
    renderLogin()

    const emailInput = screen.getByLabelText(/email/i)
    await userEvent.type(emailInput, 'test@test.com')

    const senhaInput = screen.getByLabelText(/senha/i)
    await userEvent.type(senhaInput, 'ab')

    const submitBtn = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/minimo.*3/i)).toBeInTheDocument()
    })
  })

  it('chama login e navega ao submeter formulario valido', async () => {
    mockLogin.mockResolvedValue({ id: 1, nome: 'Admin', perfil: 'admin' })

    renderLogin()

    const emailInput = screen.getByLabelText(/email/i)
    await userEvent.type(emailInput, 'admin@test.com')

    const senhaInput = screen.getByLabelText(/senha/i)
    await userEvent.type(senhaInput, 'admin123')

    const submitBtn = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin@test.com', 'admin123')
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('mostra erro da API quando login falha', async () => {
    mockLogin.mockRejectedValue(new Error('Email ou senha invalidos'))

    renderLogin()

    const emailInput = screen.getByLabelText(/email/i)
    await userEvent.type(emailInput, 'admin@test.com')

    const senhaInput = screen.getByLabelText(/senha/i)
    await userEvent.type(senhaInput, 'senhaerrada')

    const submitBtn = screen.getByRole('button', { name: /entrar/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/email ou senha inv/i)).toBeInTheDocument()
    })
  })
})
