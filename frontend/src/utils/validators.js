export const validators = {
  required: (msg = 'Campo obrigatorio') => (value) => {
    if (value === null || value === undefined || String(value).trim() === '') {
      return msg
    }
    return null
  },

  minLength: (min, msg) => (value) => {
    if (value && String(value).length < min) {
      return msg || `Minimo de ${min} caracteres`
    }
    return null
  },

  maxLength: (max, msg) => (value) => {
    if (value && String(value).length > max) {
      return msg || `Maximo de ${max} caracteres`
    }
    return null
  },

  email: (msg = 'Email invalido') => (value) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      return msg
    }
    return null
  },

  numeric: (msg = 'Deve ser um numero') => (value) => {
    if (value !== '' && value !== null && value !== undefined && isNaN(Number(value))) {
      return msg
    }
    return null
  },

  min: (minVal, msg) => (value) => {
    if (value !== '' && value !== null && value !== undefined && Number(value) < minVal) {
      return msg || `Valor minimo: ${minVal}`
    }
    return null
  },

  max: (maxVal, msg) => (value) => {
    if (value !== '' && value !== null && value !== undefined && Number(value) > maxVal) {
      return msg || `Valor maximo: ${maxVal}`
    }
    return null
  },

  positivePrice: (msg = 'Preco deve ser maior que zero') => (value) => {
    const num = Number(value)
    if (isNaN(num) || num <= 0) {
      return msg
    }
    return null
  },

  minQuantity: (min = 1, msg) => (value) => {
    const num = Number(value)
    if (isNaN(num) || num < min) {
      return msg || `Quantidade minima: ${min}`
    }
    return null
  },
}

/**
 * Run an array of validation rules against a value.
 * Returns the first error string found, or null if all pass.
 */
export function validate(value, rules) {
  for (const rule of rules) {
    const error = rule(value)
    if (error) return error
  }
  return null
}
