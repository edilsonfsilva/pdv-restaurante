import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'pdv_token'
const API_URL = '/api'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  // Helper to make authenticated requests
  const authRequest = useCallback(async (endpoint, options = {}) => {
    const currentToken = options.token || token
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      ...options,
    }

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body)
    }

    const response = await fetch(`${API_URL}${endpoint}`, config)

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }, [token])

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      const storedToken = localStorage.getItem(TOKEN_KEY)

      if (!storedToken) {
        setLoading(false)
        return
      }

      try {
        const userData = await authRequest('/auth/me', { token: storedToken })
        setUser(userData)
        setToken(storedToken)
      } catch (err) {
        console.error('Token invalido, fazendo logout:', err.message)
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Login
  const login = useCallback(async (email, senha) => {
    const data = await authRequest('/auth/login', {
      method: 'POST',
      body: { email, senha },
      token: null,
    })

    const { token: newToken, usuario } = data

    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(usuario)

    return usuario
  }, [authRequest])

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // Check if user has any of the given roles
  const hasRole = useCallback((...roles) => {
    if (!user || !user.perfil) return false
    return roles.includes(user.perfil)
  }, [user])

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user && !!token,
    login,
    logout,
    hasRole,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
