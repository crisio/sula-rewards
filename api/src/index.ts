import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { authRoutes, meRoutes, requireUser } from './auth'
import { businessRoutes } from './businesses'
import { programRoutes } from './programs'
import { cardRoutes } from './cards'
import { publicRoutes } from './public'
import { appleRoutes } from './apple'

const app = new Hono<AppEnv>()

app.use('*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  })(c, next)
})

app.get('/', (c) => c.json({ name: 'sula-rewards-api', ok: true }))

// Sin AUTH_SECRET no hay forma segura de firmar los códigos de acceso: mejor no arrancar.
app.use('*', async (c, next) => {
  if ((c.env.AUTH_SECRET ?? '').length < 32) {
    console.error('AUTH_SECRET falta o es muy corto (mínimo 32 caracteres)')
    return c.json({ error: 'El servidor no está configurado todavía.' }, 503)
  }
  await next()
})

app.route('/auth', authRoutes)
app.route('/public', publicRoutes)
app.route('/apple', appleRoutes)

// El panel del comercio: todo con sesión.
app.use('/me', requireUser)
app.use('/businesses', requireUser)
app.use('/businesses/*', requireUser)
app.use('/programs/*', requireUser)
app.use('/cards/*', requireUser)
app.route('/me', meRoutes)
app.route('/businesses', businessRoutes)
app.route('/programs', programRoutes)
app.route('/cards', cardRoutes)

app.notFound((c) => c.json({ error: 'No encontrado' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Algo salió mal. Intenta de nuevo.' }, 500)
})

export default app
