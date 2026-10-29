import { Hono } from 'hono'
import { USER_COLUMNS, type AppEnv, type Env, type User } from './env'
import { createSession, createUser, findUserByEmail } from './auth'
import { fail } from './errors'
import { APPLE_ISSUER, APPLE_KEYS_URL, GOOGLE_ISSUERS, GOOGLE_KEYS_URL, appleAudiences, appleRefreshToken, googleAudiences, verifyIdToken } from './jwt'

// Entrar con Apple o con Google. La primera vez se crea la cuenta (o se une a la que ya tiene ese correo); después,
// el «sub» del proveedor lleva siempre a la misma cuenta aunque cambie el correo.

type Provider = 'apple' | 'google'

const verified = (value: unknown) => value === true || value === 'true'

async function signIn(env: Env, provider: Provider, subject: string, email: string | null, fullName: string | null, refreshToken: string | null) {
  const linked = await env.DB.prepare(
    `SELECT ${USER_COLUMNS.split(', ').map((col) => `u.${col}`).join(', ')} FROM identities i JOIN users u ON u.id = i.user_id
     WHERE i.provider = ? AND i.subject = ?`,
  )
    .bind(provider, subject)
    .first<User>()
  let user = linked
  if (!user) {
    // Sin correo (Apple lo da siempre que se pide, pero por si acaso) la cuenta lleva uno interno que no recibe nada.
    const address = email ?? `${provider}-${subject.toLowerCase()}@cuentas.sularewards.invalid`
    user = (await findUserByEmail(env, address)) ?? (await createUser(env, address, fullName))
    await env.DB.prepare('INSERT INTO identities (provider, subject, user_id, email, refresh_token) VALUES (?, ?, ?, ?, ?)')
      .bind(provider, subject, user.id, email, refreshToken)
      .run()
  } else if (refreshToken) {
    await env.DB.prepare('UPDATE identities SET refresh_token = ? WHERE provider = ? AND subject = ?').bind(refreshToken, provider, subject).run()
  }
  // Apple manda el nombre solo la primera vez: si la cuenta no tenía, se guarda.
  if (fullName && !user.full_name) {
    await env.DB.prepare('UPDATE users SET full_name = ? WHERE id = ?').bind(fullName, user.id).run()
    user = { ...user, full_name: fullName }
  }
  return { token: await createSession(env, user.id), user }
}

const cleanName = (value: unknown) => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  return name.length >= 2 ? name : null
}

export const oauthRoutes = new Hono<AppEnv>()

/** Qué formas de entrar están listas (la app muestra los botones según esto). */
oauthRoutes.get('/config', (c) =>
  c.json({ apple: appleAudiences(c.env).length > 0, google_ios_client_id: c.env.GOOGLE_IOS_CLIENT_ID || null, google_web_client_id: c.env.GOOGLE_WEB_CLIENT_ID || null }),
)

// Sign in with Apple: el iPhone manda el identity token, el código de autorización (para revocar al borrar la cuenta)
// y el nombre (Apple solo lo da la primera vez).
oauthRoutes.post('/apple', async (c) => {
  const audiences = appleAudiences(c.env)
  if (!audiences.length) fail(501, 'Entrar con Apple todavía no está configurado')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const claims = await verifyIdToken(body.identity_token, { keysUrl: APPLE_KEYS_URL, issuers: [APPLE_ISSUER], audiences })
  const email = claims.email && verified(claims.email_verified ?? true) ? claims.email.trim().toLowerCase() : null
  const clientId = (Array.isArray(claims.aud) ? claims.aud[0] : claims.aud) as string
  const refreshToken = typeof body.authorization_code === 'string' ? await appleRefreshToken(c.env, clientId, body.authorization_code) : null
  return c.json(await signIn(c.env, 'apple', claims.sub, email, cleanName(body.full_name), refreshToken))
})

// Google: la app hace el OAuth (PKCE) y manda el id_token.
oauthRoutes.post('/google', async (c) => {
  const audiences = googleAudiences(c.env)
  if (!audiences.length) fail(501, 'Entrar con Google todavía no está configurado')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const claims = await verifyIdToken(body.id_token, { keysUrl: GOOGLE_KEYS_URL, issuers: GOOGLE_ISSUERS, audiences })
  if (!claims.email || !verified(claims.email_verified)) fail(401, 'Tu cuenta de Google no tiene un correo verificado')
  return c.json(await signIn(c.env, 'google', claims.sub, claims.email.trim().toLowerCase(), cleanName(claims.name), null))
})
