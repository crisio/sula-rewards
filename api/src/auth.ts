import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { USER_COLUMNS, type AppEnv, type Env, type User } from './env'
import { hmac, randomCode, randomToken, safeEqual, sha256 } from './crypto'
import { loginCodeMail, sendMail } from './email'
import { fail } from './errors'
import { normalizePhone, text } from './rules'
import { revokeApple } from './jwt'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const CODE_TTL = 10 * MINUTE
const RESEND_AFTER = MINUTE
const MAX_SENDS_PER_HOUR = 5
const MAX_ATTEMPTS = 5
const SESSION_TTL = 90 * DAY

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) fail(400, 'Escribe un correo válido')
  return email
}

const codeHash = (env: Env, email: string, code: string) => hmac(env.AUTH_SECRET, `login:${email}:${code}`)

/**
 * Cuenta para la revisión de la App Store: los revisores de Apple no reciben nuestros correos, así que ese correo
 * (REVIEW_EMAIL) entra con un código fijo (REVIEW_CODE, secreto). Los límites de envíos e intentos siguen igual.
 */
function reviewCode(env: Env, email: string) {
  const code = env.REVIEW_CODE ?? ''
  return env.REVIEW_EMAIL && email === env.REVIEW_EMAIL.trim().toLowerCase() && /^\d{6}$/.test(code) ? code : null
}

interface CodeRow {
  code_hash: string
  expires_at: number
  attempts: number
  sent_at: number
  window_start: number
  sends_in_window: number
}

export const authRoutes = new Hono<AppEnv>()

// 1) Pedir un código: se envía por correo. Siempre responde igual exista o no la cuenta.
authRoutes.post('/code', async (c) => {
  const { email: raw } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
  const email = normalizeEmail(raw)
  const now = Date.now()

  const prev = await c.env.DB.prepare('SELECT * FROM auth_codes WHERE email = ?').bind(email).first<CodeRow>()
  if (prev && now - prev.sent_at < RESEND_AFTER) fail(429, 'Espera un minuto antes de pedir otro código')
  const sameWindow = prev && now - prev.window_start < 60 * MINUTE
  if (sameWindow && prev.sends_in_window >= MAX_SENDS_PER_HOUR) fail(429, 'Pediste muchos códigos. Intenta en una hora.')

  const fixed = reviewCode(c.env, email)
  const code = fixed ?? randomCode()
  await c.env.DB.prepare(
    `INSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at, window_start, sends_in_window)
     VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)
     ON CONFLICT (email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, sent_at = ?4,
       window_start = ?5, sends_in_window = ?6`,
  )
    .bind(email, await codeHash(c.env, email, code), now + CODE_TTL, now, sameWindow ? prev.window_start : now, sameWindow ? prev.sends_in_window + 1 : 1)
    .run()
  if (fixed) return c.json({ ok: true })

  try {
    await sendMail(c.env, loginCodeMail(email, code, c.env.APP_URL))
  } catch (err) {
    console.error('sendMail', err)
    fail(502, 'No pudimos enviar el correo. Intenta de nuevo en un momento.')
  }
  return c.json({ ok: true })
})

// 2) Verificar el código: crea la cuenta si es nueva y regresa un token de sesión.
authRoutes.post('/verify', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>().catch(() => ({}) as { email?: string; code?: string })
  const email = normalizeEmail(body.email)
  const code = String(body.code ?? '').replace(/\D/g, '')
  const now = Date.now()

  const row = await c.env.DB.prepare('SELECT * FROM auth_codes WHERE email = ?').bind(email).first<CodeRow>()
  if (!row || row.expires_at < now) fail(400, 'El código venció. Pide uno nuevo.')
  if (row.attempts >= MAX_ATTEMPTS) fail(429, 'Demasiados intentos. Pide un código nuevo.')

  if (code.length !== 6 || !safeEqual(row.code_hash, await codeHash(c.env, email, code))) {
    await c.env.DB.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    fail(400, 'Código incorrecto')
  }

  await c.env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run()
  const user = (await findUserByEmail(c.env, email)) ?? (await createUser(c.env, email, null))
  return c.json({ token: await createSession(c.env, user.id), user })
})

export const findUserByEmail = (env: Env, email: string) =>
  env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(email).first<User>()

export async function createUser(env: Env, email: string, fullName: string | null) {
  const user: User = { id: crypto.randomUUID(), email, full_name: fullName, phone: null }
  await env.DB.prepare('INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)').bind(user.id, email, fullName).run()
  return user
}

/** Abre una sesión y regresa su token (solo se guarda su SHA-256). */
export async function createSession(env: Env, userId: string) {
  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, refreshed_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now + SESSION_TTL, now)
    .run()
  return token
}

/** Exige `Authorization: Bearer <token>` válido y deja al usuario en c.var.user. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) fail(401, 'Inicia sesión')

  const hash = await sha256(token)
  const now = Date.now()
  const row = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS.split(', ').map((col) => `u.${col}`).join(', ')}, s.refreshed_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, now)
    .first<User & { refreshed_at: number }>()
  if (!row) fail(401, 'Tu sesión expiró. Vuelve a entrar.')

  // Sesión deslizante: mientras uses la app no expira.
  if (now - row.refreshed_at > DAY) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ?, refreshed_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_TTL, now, hash)
      .run()
  }

  const { refreshed_at: _, ...user } = row
  c.set('user', user)
  c.set('sessionHash', hash)
  await next()
})

authRoutes.post('/logout', requireUser, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.var.sessionHash).run()
  return c.json({ ok: true })
})

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/', (c) => c.json(c.var.user))

// Nombre y celular (el celular es para unirse a programas como cliente). Solo cambia lo que viene.
meRoutes.patch('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const next = {
    full_name: body.full_name === undefined ? c.var.user.full_name : text(body.full_name, 'tu nombre', { min: 2, max: 80 }),
    phone: body.phone === undefined ? c.var.user.phone : body.phone ? normalizePhone(body.phone) : null,
  }
  await c.env.DB.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').bind(next.full_name, next.phone, c.var.user.id).run()
  return c.json({ ...c.var.user, ...next })
})

// Borrar la cuenta (lo pide la App Store): sus negocios, programas, tarjetas, movimientos y sesiones se van en cascada.
// Los pases que los clientes guardaron en el Wallet dejan de actualizarse. Las tarjetas que tenía como cliente siguen
// en sus negocios, solo dejan de estar en su cuenta.
meRoutes.delete('/', async (c) => {
  // Si entró con Apple, se le revoca el acceso a la app (lo pide la App Store). No bloquea el borrado.
  const { results: apple } = await c.env.DB.prepare(
    "SELECT refresh_token FROM identities WHERE user_id = ? AND provider = 'apple' AND refresh_token IS NOT NULL",
  )
    .bind(c.var.user.id)
    .all<{ refresh_token: string }>()
  for (const { refresh_token } of apple) c.executionCtx.waitUntil(revokeApple(c.env, refresh_token))
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(c.var.user.id).run()
  return c.json({ ok: true })
})
