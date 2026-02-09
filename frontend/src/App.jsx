import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { LayoutGrid, UtensilsCrossed, MonitorPlay, CreditCard, BarChart3, Package, LogOut, User, Users, ShoppingBag, MapPin } from 'lucide-react'

// Pages
import Mesas from './pages/Mesas'
import PDV from './pages/PDV'
import KDS from './pages/KDS'
import Caixa from './pages/Caixa'
import Login from './pages/Login'
import Relatorios from './pages/Relatorios'
import Estoque from './pages/Estoque'
import Garcons from './pages/Garcons'
import Produtos from './pages/Produtos'
import AreasEMesas from './pages/AreasEMesas'

// Contexto global
import { SocketProvider } from './contexts/SocketContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Components
import ProtectedRoute from './components/ProtectedRoute'

const allNavLinks = [
  { to: '/', icon: LayoutGrid, label: 'Mesas', roles: ['admin', 'gerente', 'garcom'] },
  { to: '/pdv', icon: UtensilsCrossed, label: 'PDV', roles: ['admin', 'gerente', 'garcom'] },
  { to: '/kds', icon: MonitorPlay, label: 'Cozinha', roles: ['admin', 'gerente', 'cozinheiro'] },
  { to: '/caixa', icon: CreditCard, label: 'Caixa', roles: ['admin', 'gerente', 'caixa'] },
  { to: '/relatorios', icon: BarChart3, label: 'Relatorios', roles: ['admin', 'gerente'] },
  { to: '/estoque', icon: Package, label: 'Estoque', roles: ['admin', 'gerente'] },
  { to: '/produtos', icon: ShoppingBag, label: 'Produtos', roles: ['admin', 'gerente'] },
  { to: '/garcons', icon: Users, label: 'Garcons', roles: ['admin', 'gerente'] },
  { to: '/areas-mesas', icon: MapPin, label: 'Areas & Mesas', roles: ['admin', 'gerente'] },
]

function NavLink({ to, icon: Icon, children }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-primary-500 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{children}</span>
    </Link>
  )
}

function Layout({ children }) {
  const { user, logout } = useAuth()

  const visibleLinks = allNavLinks.filter(link =>
    user && link.roles.includes(user.perfil)
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍽️</span>
            <h1 className="text-xl font-bold text-gray-800">PDV Restaurante</h1>
          </div>

          <nav className="flex gap-2">
            {visibleLinks.map(link => (
              <NavLink key={link.to} to={link.to} icon={link.icon}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User size={16} />
                  <span className="font-medium">{user.nome}</span>
                  <span className="badge bg-primary-100 text-primary-700">{user.perfil}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Sair"
                >
                  <LogOut size={18} />
                  <span>Sair</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            {/* Login - no layout, no auth */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes with layout */}
            <Route path="/" element={
              <ProtectedRoute roles={['admin', 'gerente', 'garcom']}>
                <Layout><Mesas /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/pdv" element={
              <ProtectedRoute roles={['admin', 'gerente', 'garcom']}>
                <Layout><PDV /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/pdv/:mesaId" element={
              <ProtectedRoute roles={['admin', 'gerente', 'garcom']}>
                <Layout><PDV /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/kds" element={
              <ProtectedRoute roles={['admin', 'gerente', 'cozinheiro']}>
                <Layout><KDS /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/caixa" element={
              <ProtectedRoute roles={['admin', 'gerente', 'caixa']}>
                <Layout><Caixa /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/relatorios" element={
              <ProtectedRoute roles={['admin', 'gerente']}>
                <Layout><Relatorios /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/estoque" element={
              <ProtectedRoute roles={['admin', 'gerente']}>
                <Layout><Estoque /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/produtos" element={
              <ProtectedRoute roles={['admin', 'gerente']}>
                <Layout><Produtos /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/garcons" element={
              <ProtectedRoute roles={['admin', 'gerente']}>
                <Layout><Garcons /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/areas-mesas" element={
              <ProtectedRoute roles={['admin', 'gerente']}>
                <Layout><AreasEMesas /></Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  )
}

export default App
