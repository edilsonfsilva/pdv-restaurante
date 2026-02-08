import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'

// Helper to mock useAuth with specific values
let mockAuthValues = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValues,
}))

function renderWithRouter(authValues, roles = undefined) {
  mockAuthValues = authValues

  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/" element={<div data-testid="home-page">Home</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute roles={roles}>
              <div data-testid="protected-content">Conteudo protegido</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('mostra spinner enquanto loading', () => {
    renderWithRouter({
      isAuthenticated: false,
      loading: true,
      hasRole: () => false,
    })

    // Should NOT show content or login page
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('redireciona para /login se nao autenticado', () => {
    renderWithRouter({
      isAuthenticated: false,
      loading: false,
      hasRole: () => false,
    })

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renderiza conteudo se autenticado sem restricao de role', () => {
    renderWithRouter({
      isAuthenticated: true,
      loading: false,
      hasRole: () => true,
    })

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('renderiza conteudo se autenticado e com role correto', () => {
    renderWithRouter(
      {
        isAuthenticated: true,
        loading: false,
        hasRole: (...roles) => roles.includes('admin'),
      },
      ['admin', 'gerente']
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('redireciona para / se autenticado mas sem role correto', () => {
    renderWithRouter(
      {
        isAuthenticated: true,
        loading: false,
        hasRole: (...roles) => roles.includes('admin'),
      },
      ['cozinheiro']
    )

    // Should redirect to home, not show content
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('home-page')).toBeInTheDocument()
  })
})
