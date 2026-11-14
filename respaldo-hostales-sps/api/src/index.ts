import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { publicRoutes, requireUser, sessionRoutes } from './auth'
import { recepcionRoutes } from './recepcion'
import { turnoRoutes } from './turnos'
import { tareaRoutes } from './tareas'
import { empresaRoutes } from './empresas'
import { fotoRoutes } from './fotos'
import { duenoRoutes } from './dueno'
import { configRoutes } from './config'
import { importarRoutes } from './importar'
import { ahora } from './util'

const app = new Hono<AppEnv>()

// La hora del servidor va en cada respuesta: la app la usa en vez del reloj del teléfono.
app.use('/api/*', async (c, next) => {
  await next()
  c.res.headers.set('X-Ahora', String(ahora()))
  c.res.headers.set('Cache-Control', c.res.headers.get('Cache-Control') ?? 'no-store')
})

const PUBLICAS = new Set(['/api/inicio', '/api/entrar', '/api/salud'])
app.use('/api/*', async (c, next) => (PUBLICAS.has(c.req.path) ? next() : requireUser(c, next)))

app.get('/api/salud', (c) => c.json({ ok: true, app: 'hostales-sps', ahora: ahora() }))
app.route('/api', publicRoutes)
app.route('/api', sessionRoutes)
app.route('/api', recepcionRoutes)
app.route('/api', turnoRoutes)
app.route('/api', tareaRoutes)
app.route('/api', fotoRoutes)
app.route('/api', duenoRoutes)
app.route('/api', configRoutes)
app.route('/api', importarRoutes)
app.route('/api/empresas', empresaRoutes)

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'No encontrado' }, 404)
  // Todo lo demás es la app (React): Cloudflare la sirve desde ../dist.
  return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('No encontrado', 404)
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const res = err.getResponse()
    if (res.headers.get('Content-Type')?.includes('json')) return res
    return c.json({ error: err.message || 'Error' }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Algo salió mal. Intenta otra vez.' }, 500)
})

export default app
