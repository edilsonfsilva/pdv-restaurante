import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Loader2, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import FormField from '../components/FormField'
import { validators, validate } from '../utils/validators'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({ email: '', senha: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Clear field error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
    if (apiError) setApiError('')
  }

  const validateForm = () => {
    const newErrors = {}

    newErrors.email = validate(form.email, [
      validators.required('Email e obrigatorio'),
      validators.email('Formato de email invalido'),
    ])

    newErrors.senha = validate(form.senha, [
      validators.required('Senha e obrigatoria'),
      validators.minLength(3, 'Senha deve ter no minimo 3 caracteres'),
    ])

    // Remove null entries
    const filteredErrors = {}
    for (const key of Object.keys(newErrors)) {
      if (newErrors[key]) filteredErrors[key] = newErrors[key]
    }

    setErrors(filteredErrors)
    return Object.keys(filteredErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setApiError('')

    if (!validateForm()) return

    try {
      setLoading(true)
      await login(form.email, form.senha)
      navigate('/', { replace: true })
    } catch (err) {
      setApiError(err.message || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="card p-8 w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 mb-4">
            <UtensilsCrossed size={32} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">PDV Restaurante</h1>
          <p className="text-gray-500 mt-1">Faca login para continuar</p>
        </div>

        {/* API Error */}
        {apiError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {apiError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <FormField
            label="Email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            value={form.email}
            onChange={handleChange}
            error={errors.email}
            autoComplete="email"
          />

          <FormField
            label="Senha"
            name="senha"
            type="password"
            placeholder="Sua senha"
            value={form.senha}
            onChange={handleChange}
            error={errors.senha}
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full flex items-center justify-center gap-2 mt-6"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Entrando...
              </>
            ) : (
              <>
                <LogIn size={20} />
                Entrar
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
