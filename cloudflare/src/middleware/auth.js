// Auth middleware for Cloudflare Workers (using Web Crypto API for JWT)
import { json } from '../worker.js'

// Base64url decode
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Verify JWT using Web Crypto API
async function verifyJWT(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const data = encoder.encode(parts[0] + '.' + parts[1])
  const signature = base64urlDecode(parts[2])

  const valid = await crypto.subtle.verify('HMAC', key, signature, data)
  if (!valid) throw new Error('Invalid signature')

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])))

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired')
  }

  return payload
}

// Sign JWT using Web Crypto API
export async function signJWT(payload, secret, expiresIn = '8h') {
  const encoder = new TextEncoder()

  // Parse expiresIn
  let seconds = 28800 // default 8h
  const match = expiresIn.match(/^(\d+)(h|m|s|d)$/)
  if (match) {
    const val = parseInt(match[1])
    const unit = match[2]
    if (unit === 'h') seconds = val * 3600
    else if (unit === 'm') seconds = val * 60
    else if (unit === 's') seconds = val
    else if (unit === 'd') seconds = val * 86400
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + seconds }

  const base64url = (obj) => {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  const headerB64 = base64url(header)
  const payloadB64 = base64url(fullPayload)
  const data = encoder.encode(headerB64 + '.' + payloadB64)

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, data)
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return headerB64 + '.' + payloadB64 + '.' + sigB64
}

// Auth middleware - returns user object or null
export async function authMiddleware(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  try {
    const token = authHeader.split(' ')[1]
    const decoded = await verifyJWT(token, env.JWT_SECRET)

    const result = await env.DB.prepare(
      'SELECT id, nome, email, perfil FROM usuarios WHERE id = ? AND ativo = 1'
    ).bind(decoded.id).all()

    if (result.results.length === 0) return null
    return result.results[0]
  } catch (err) {
    return null
  }
}

// Role check - returns true/false
export function roleMiddleware(user, ...roles) {
  if (!user) return false
  return roles.includes(user.perfil)
}
