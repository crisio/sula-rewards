import { Hono, type MiddlewareHandler } from 'hono'
import type { AppEnv, Usuario } from './env'
import { cargarAjustes, cargarHostales, historial } from './db'
import { ahora, cuerpo, esPin, fail, hashPin, randomSalt, randomToken, safeEqual, sha256, uid } from './util'

const SESION_DIAS = 30
const MAX_INTENTOS = 5
const BLOQUEO_MS = 5 * 60_000

type FilaUsuario = Usuario & { pin_hash: string; pin_salt: string; activo: number; intentos: number; bloqueado_hasta: number | null }

export const publicRoutes = new Hono<AppEnv>()

/** Pantalla de entrada: los hostales y los nombres de sus recepcionistas. */
publicRoutes.get('/inicio', async (c) => {
  const db = c.env.DB
  const [{ results: hostales }, { results: personal }, dueno] = await Promise.all([
    db.prepare('SELECT id, nombre FROM hostales ORDER BY orden').all<{ id: string; nombre: string }>(),
    db.prepare("SELECT id, nombre, hostal_id FROM usuarios WHERE rol = 'recepcion' AND activo = 1 ORDER BY nombre").all<{ id: string; nombre: string; hostal_id: string }>(),
    db.prepare("SELECT 1 FROM usuarios WHERE rol = 'dueno' AND activo = 1").first(),
  ])
  return c.json({
    hostales: hostales.map((h) => ({ ...h, recepcionistas: personal.filter((p) => p.hostal_id === h.id).map(({ id, nombre }) => ({ id, nombre })) })),
    dueno_configurado: Boolean(dueno),
    pin_inicial: !dueno && esPin(c.env.PIN_DUENO),
  })
})

publicRoutes.post('/entrar', async (c) => {
  const db = c.env.DB
  const body = await cuerpo<{ usuario_id?: string; dueno?: boolean; pin?: string }>(c)
  if (!esPin(body.pin)) fail(400, 'Escribe tu PIN (4 a 8 números).')

  let usuario: FilaUsuario | null
  if (body.dueno) {
    usuario = await db.prepare("SELECT * FROM usuarios WHERE rol = 'dueno' AND activo = 1 ORDER BY creado_en LIMIT 1").first<FilaUsuario>()
    if (!usuario) {
      // Primera vez: el dueño entra con el PIN que se guardó como secreto (PIN_DUENO) y queda creado.
      if (!esPin(c.env.PIN_DUENO)) fail(503, 'Falta configurar el PIN del dueño (secreto PIN_DUENO). Revisa el README.')
      if (!safeEqual(await sha256(body.pin), await sha256(c.env.PIN_DUENO))) fail(401, 'PIN incorrecto.')
      const salt = randomSalt()
      const id = uid()
      await db
        .prepare("INSERT INTO usuarios (id, nombre, rol, hostal_id, pin_hash, pin_salt, creado_en) VALUES (?, 'Dueño', 'dueno', NULL, ?, ?, ?)")
        .bind(id, await hashPin(body.pin, salt), salt, ahora())
        .run()
      usuario = await db.prepare('SELECT * FROM usuarios WHERE id = ?').bind(id).first<FilaUsuario>()
    }
  } else {
    if (typeof body.usuario_id !== 'string') fail(400, 'Elige tu nombre.')
    usuario = await db.prepare("SELECT * FROM usuarios WHERE id = ? AND rol = 'recepcion' AND activo = 1").bind(body.usuario_id).first<FilaUsuario>()
    if (!usuario) fail(404, 'Ese usuario no existe o está desactivado.')
  }
  if (!usuario) fail(500, 'No se pudo entrar.')

  const t = ahora()
  if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > t) {
    const min = Math.ceil((usuario.bloqueado_hasta - t) / 60_000)
    fail(429, `Demasiados intentos. Espera ${min} min y vuelve a probar.`)
  }
  const ok = safeEqual(await hashPin(body.pin, usuario.pin_salt), usuario.pin_hash)
  if (!ok) {
    const intentos = usuario.intentos + 1
    if (intentos >= MAX_INTENTOS) {
      await db.batch([
        db.prepare('UPDATE usuarios SET intentos = 0, bloqueado_hasta = ? WHERE id = ?').bind(t + BLOQUEO_MS, usuario.id),
        db
          .prepare("INSERT INTO historial (hostal_id, usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle, creado_en) VALUES (?, ?, ?, 'bloqueo por PIN', 'usuario', ?, '{}', ?)")
          .bind(usuario.hostal_id, usuario.id, usuario.nombre, usuario.id, t),
      ])
      fail(429, 'Demasiados intentos. Espera 5 min y vuelve a probar.')
    }
    await db.prepare('UPDATE usuarios SET intentos = ? WHERE id = ?').bind(intentos, usuario.id).run()
    fail(401, `PIN incorrecto. Te quedan ${MAX_INTENTOS - intentos} intentos.`)
  }

  const token = randomToken()
  await db.batch([
    db.prepare('UPDATE usuarios SET intentos = 0, bloqueado_hasta = NULL WHERE id = ?').bind(usuario.id),
    db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)').bind(await sha256(token), usuario.id, t, t + SESION_DIAS * 86_400_000),
    db.prepare('DELETE FROM sesiones WHERE expira_en < ?').bind(t),
  ])
  const { id, nombre, rol, hostal_id } = usuario
  return c.json({ token, usuario: { id, nombre, rol, hostal_id } })
})

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) fail(401, 'Tu sesión terminó. Vuelve a entrar.')
  const u = await c.env.DB.prepare(
    `SELECT u.id, u.nombre, u.rol, u.hostal_id FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_en > ? AND u.activo = 1`,
  )
    .bind(await sha256(token), ahora())
    .first<Usuario>()
  if (!u) fail(401, 'Tu sesión terminó. Vuelve a entrar.')
  c.set('usuario', u)
  await next()
}

export const sessionRoutes = new Hono<AppEnv>()

sessionRoutes.post('/salir', async (c) => {
  const token = (c.req.header('Authorization') ?? '').slice(7)
  await c.env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(await sha256(token)).run()
  return c.json({ ok: true })
})

sessionRoutes.get('/yo', async (c) => {
  const u = c.get('usuario')
  const [hostales, ajustes] = await Promise.all([cargarHostales(c.env.DB), cargarAjustes(c.env.DB)])
  return c.json({ usuario: u, hostales: hostales.filter((h) => u.rol === 'dueno' || h.id === u.hostal_id), ajustes, ahora: ahora() })
})

sessionRoutes.post('/yo/pin', async (c) => {
  const u = c.get('usuario')
  const body = await cuerpo<{ actual?: string; nuevo?: string }>(c)
  if (!esPin(body.nuevo)) fail(400, 'El PIN nuevo debe tener de 4 a 8 números.')
  const fila = await c.env.DB.prepare('SELECT pin_hash, pin_salt FROM usuarios WHERE id = ?').bind(u.id).first<{ pin_hash: string; pin_salt: string }>()
  if (!fila || !esPin(body.actual) || !safeEqual(await hashPin(body.actual, fila.pin_salt), fila.pin_hash)) fail(401, 'El PIN actual no es correcto.')
  const salt = randomSalt()
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE usuarios SET pin_hash = ?, pin_salt = ? WHERE id = ?').bind(await hashPin(body.nuevo, salt), salt, u.id),
    historial(c, { hostal_id: u.hostal_id, accion: 'cambió su PIN', entidad: 'usuario', entidad_id: u.id }),
  ])
  return c.json({ ok: true })
})
