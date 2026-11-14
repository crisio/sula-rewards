import { Hono } from 'hono'
import type { AppEnv } from './env'
import { historial, verificarHostal } from './db'
import { ahora, fail, uid } from './util'

// La app reduce la foto (máx. ~1600 px, JPEG) antes de subirla; aquí se guarda tal cual en la base.
const MAX_BYTES = 1_500_000
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

export const fotoRoutes = new Hono<AppEnv>()

/** Foto del voucher de tarjeta o del comprobante de depósito. */
fotoRoutes.post('/hostales/:h/fotos', async (c) => {
  const hostalId = c.req.param('h')
  verificarHostal(c.get('usuario'), hostalId)
  const mime = (c.req.header('Content-Type') ?? '').split(';')[0]
  if (!TIPOS.includes(mime)) fail(400, 'Sube una foto (JPG o PNG).')
  const datos = await c.req.arrayBuffer()
  if (!datos.byteLength) fail(400, 'La foto está vacía.')
  if (datos.byteLength > MAX_BYTES) fail(413, 'La foto es muy grande. Prueba otra vez.')
  const tipo = c.req.query('tipo') === 'deposito' ? 'deposito' : 'voucher'
  const id = uid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO fotos (id, hostal_id, tipo, mime, datos, bytes, creada_por, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      hostalId,
      tipo,
      mime,
      datos,
      datos.byteLength,
      c.get('usuario').id,
      ahora(),
    ),
    historial(c, { hostal_id: hostalId, accion: `subió foto (${tipo})`, entidad: 'foto', entidad_id: id }),
  ])
  return c.json({ id }, 201)
})

fotoRoutes.get('/fotos/:id', async (c) => {
  const f = await c.env.DB.prepare('SELECT hostal_id, mime, datos FROM fotos WHERE id = ?').bind(c.req.param('id')).first<{ hostal_id: string; mime: string; datos: number[] | ArrayBuffer }>()
  if (!f) fail(404, 'Esa foto no existe.')
  verificarHostal(c.get('usuario'), f.hostal_id)
  const bytes = f.datos instanceof ArrayBuffer ? new Uint8Array(f.datos) : new Uint8Array(f.datos)
  return new Response(bytes, { headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400' } })
})
