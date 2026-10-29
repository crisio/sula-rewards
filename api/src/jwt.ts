import type { Env } from './env'
import { pemToDer } from './der'
import { fail } from './errors'

// Entrar con Apple y con Google: la app manda el «identity token» (un JWT firmado por Apple o Google) y aquí se
// verifica con las llaves públicas del proveedor. Sin librerías: WebCrypto.

const encoder = new TextEncoder()

const b64urlDecode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const json = (part: string) => JSON.parse(new TextDecoder().decode(b64urlDecode(part)))

interface Jwk extends JsonWebKey {
  kid: string
}

export const APPLE_ISSUER = 'https://appleid.apple.com'
export const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys'
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
export const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

// Las llaves públicas cambian poco: se guardan una hora (y se vuelven a pedir si llega un «kid» que no está).
const keyCache = new Map<string, { keys: Jwk[]; expiresAt: number }>()

async function publicKeys(url: string, refresh = false) {
  const hit = keyCache.get(url)
  if (hit && !refresh && hit.expiresAt > Date.now()) return hit.keys
  const res = await fetch(url)
  if (!res.ok) fail(502, 'No pudimos verificar tu cuenta. Intenta de nuevo.')
  const { keys } = await res.json<{ keys: Jwk[] }>()
  keyCache.set(url, { keys, expiresAt: Date.now() + 60 * 60_000 })
  return keys
}

export interface IdClaims {
  iss: string
  aud: string | string[]
  sub: string
  exp: number
  email?: string
  email_verified?: boolean | string
  name?: string
}

/** Verifica un JWT RS256 del proveedor: firma, emisor, audiencia (uno de `audiences`) y vigencia. */
export async function verifyIdToken(token: unknown, opts: { keysUrl: string; issuers: string[]; audiences: string[] }) {
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3) fail(400, 'Falta el token de la cuenta')
  let header: { alg?: string; kid?: string }
  let claims: IdClaims
  try {
    header = json(parts[0])
    claims = json(parts[1])
  } catch {
    fail(401, 'No pudimos verificar tu cuenta')
  }
  if (header.alg !== 'RS256' || !header.kid) fail(401, 'No pudimos verificar tu cuenta')
  let jwk = (await publicKeys(opts.keysUrl)).find((k) => k.kid === header.kid)
  if (!jwk) jwk = (await publicKeys(opts.keysUrl, true)).find((k) => k.kid === header.kid)
  if (!jwk) fail(401, 'No pudimos verificar tu cuenta')

  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    !valid ||
    !opts.issuers.includes(claims.iss) ||
    !audiences.some((aud) => opts.audiences.includes(aud)) ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < Date.now() - 60_000 ||
    !claims.sub
  ) {
    fail(401, 'No pudimos verificar tu cuenta. Vuelve a intentarlo.')
  }
  return claims
}

export const appleAudiences = (env: Env) => (env.APPLE_SIGNIN_AUDIENCES ?? '').split(',').map((a) => a.trim()).filter(Boolean)
export const googleAudiences = (env: Env) => [env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_WEB_CLIENT_ID].filter((id): id is string => Boolean(id))

// --- Sign in with Apple: el refresh token y su revocación (la App Store pide revocarlo al borrar la cuenta) ---

const appleKeyConfigured = (env: Env) => Boolean(env.APPLE_SIGNIN_KEY && env.APPLE_SIGNIN_KEY_ID && env.APPLE_TEAM_ID)

/** El «client secret» de Apple: un JWT ES256 firmado con la llave .p8 de Sign in with Apple (dura 5 minutos). */
async function appleClientSecret(env: Env, clientId: string) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.APPLE_SIGNIN_KEY!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const encode = (obj: unknown) => b64url(encoder.encode(JSON.stringify(obj)))
  const data = `${encode({ alg: 'ES256', kid: env.APPLE_SIGNIN_KEY_ID })}.${encode({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: clientId })}`
  // WebCrypto entrega la firma ECDSA como r‖s (64 bytes), que es justo lo que pide JWS.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(data)))
  return `${data}.${b64url(signature)}`
}

/** Cambia el «authorization code» que da el iPhone por el refresh token de Apple. Si algo falla, regresa null. */
export async function appleRefreshToken(env: Env, clientId: string, code: string) {
  if (!appleKeyConfigured(env) || !code) return null
  try {
    const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret(env, clientId), code, grant_type: 'authorization_code' }),
    })
    if (!res.ok) {
      console.error('Apple token', res.status, (await res.text()).slice(0, 300))
      return null
    }
    return (await res.json<{ refresh_token?: string }>()).refresh_token ?? null
  } catch (err) {
    console.error('Apple token', err)
    return null
  }
}

/** Revoca el acceso de la app en la cuenta de Apple de la persona (al borrar su cuenta). */
export async function revokeApple(env: Env, refreshToken: string) {
  if (!appleKeyConfigured(env)) return
  const clientId = appleAudiences(env)[0]
  try {
    const res = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: await appleClientSecret(env, clientId), token: refreshToken, token_type_hint: 'refresh_token' }),
    })
    if (!res.ok) console.error('Apple revoke', res.status, (await res.text()).slice(0, 300))
  } catch (err) {
    console.error('Apple revoke', err)
  }
}
