import { describe, it, expect } from 'vitest'
import { validators, validate } from '../utils/validators'

describe('validators.required', () => {
  const rule = validators.required()

  it('retorna erro para string vazia', () => {
    expect(rule('')).toBeTruthy()
  })

  it('retorna erro para null', () => {
    expect(rule(null)).toBeTruthy()
  })

  it('retorna erro para undefined', () => {
    expect(rule(undefined)).toBeTruthy()
  })

  it('retorna erro para string com apenas espacos', () => {
    expect(rule('   ')).toBeTruthy()
  })

  it('retorna null para valor valido', () => {
    expect(rule('hello')).toBeNull()
  })

  it('retorna null para numero', () => {
    expect(rule(0)).toBeNull()
  })

  it('usa mensagem customizada', () => {
    const custom = validators.required('Preencha o campo')
    expect(custom('')).toBe('Preencha o campo')
  })
})

describe('validators.minLength', () => {
  const rule = validators.minLength(3)

  it('retorna erro para string menor que o minimo', () => {
    expect(rule('ab')).toBeTruthy()
  })

  it('retorna null para string com tamanho exato', () => {
    expect(rule('abc')).toBeNull()
  })

  it('retorna null para string maior que o minimo', () => {
    expect(rule('abcd')).toBeNull()
  })

  it('retorna null para valor vazio (nao e responsabilidade de minLength)', () => {
    expect(rule('')).toBeNull()
  })
})

describe('validators.maxLength', () => {
  const rule = validators.maxLength(5)

  it('retorna erro para string maior que o maximo', () => {
    expect(rule('123456')).toBeTruthy()
  })

  it('retorna null para string com tamanho exato', () => {
    expect(rule('12345')).toBeNull()
  })

  it('retorna null para string menor', () => {
    expect(rule('abc')).toBeNull()
  })
})

describe('validators.email', () => {
  const rule = validators.email()

  it('retorna erro para email sem @', () => {
    expect(rule('invalido')).toBeTruthy()
  })

  it('retorna erro para email sem dominio', () => {
    expect(rule('user@')).toBeTruthy()
  })

  it('retorna null para email valido', () => {
    expect(rule('user@example.com')).toBeNull()
  })

  it('retorna null para valor vazio', () => {
    expect(rule('')).toBeNull()
  })
})

describe('validators.numeric', () => {
  const rule = validators.numeric()

  it('retorna erro para texto', () => {
    expect(rule('abc')).toBeTruthy()
  })

  it('retorna null para numero como string', () => {
    expect(rule('42')).toBeNull()
  })

  it('retorna null para decimal', () => {
    expect(rule('3.14')).toBeNull()
  })

  it('retorna null para string vazia', () => {
    expect(rule('')).toBeNull()
  })
})

describe('validators.min', () => {
  const rule = validators.min(10)

  it('retorna erro para valor abaixo do minimo', () => {
    expect(rule(5)).toBeTruthy()
  })

  it('retorna null para valor igual ao minimo', () => {
    expect(rule(10)).toBeNull()
  })

  it('retorna null para valor acima do minimo', () => {
    expect(rule(15)).toBeNull()
  })
})

describe('validators.max', () => {
  const rule = validators.max(100)

  it('retorna erro para valor acima do maximo', () => {
    expect(rule(150)).toBeTruthy()
  })

  it('retorna null para valor igual ao maximo', () => {
    expect(rule(100)).toBeNull()
  })
})

describe('validators.positivePrice', () => {
  const rule = validators.positivePrice()

  it('retorna erro para zero', () => {
    expect(rule(0)).toBeTruthy()
  })

  it('retorna erro para negativo', () => {
    expect(rule(-5)).toBeTruthy()
  })

  it('retorna erro para NaN', () => {
    expect(rule('abc')).toBeTruthy()
  })

  it('retorna null para preco positivo', () => {
    expect(rule(25.90)).toBeNull()
  })
})

describe('validators.minQuantity', () => {
  const rule = validators.minQuantity(1)

  it('retorna erro para zero', () => {
    expect(rule(0)).toBeTruthy()
  })

  it('retorna null para 1', () => {
    expect(rule(1)).toBeNull()
  })

  it('retorna null para quantidade acima', () => {
    expect(rule(5)).toBeNull()
  })
})

describe('validate()', () => {
  it('retorna primeiro erro encontrado', () => {
    const result = validate('', [
      validators.required('Obrigatorio'),
      validators.minLength(3, 'Curto demais'),
    ])
    expect(result).toBe('Obrigatorio')
  })

  it('retorna null se todas as regras passam', () => {
    const result = validate('hello@test.com', [
      validators.required(),
      validators.email(),
    ])
    expect(result).toBeNull()
  })

  it('retorna segundo erro quando primeiro passa', () => {
    const result = validate('ab', [
      validators.required(),
      validators.minLength(5, 'Minimo 5'),
    ])
    expect(result).toBe('Minimo 5')
  })
})
