import { Hono } from 'hono'
import { esFecha, turnoDeHora } from '../../shared/fechas'
import type { Hostal, Tarea } from '../../shared/reglas'
import type { AppEnv, Usuario } from './env'
import { cargarHostal, historial, soloDueno, subirVersion, verificarHostal } from './db'
import { ahora, cuerpo, fail, texto, uid } from './util'

const SELECT_TAREA = `
  SELECT t.*, u.nombre AS usuario, h.nombre AS hecha_por_nombre
  FROM tareas t
  LEFT JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN usuarios h ON h.id = t.hecha_por`

const aTarea = (f: Record<string, unknown>): Tarea => ({
  id: f.id as string,
  hostal_id: f.hostal_id as string,
  texto: f.texto as string,
  usuario_id: (f.usuario_id as string) ?? null,
  usuario: (f.usuario as string) ?? null,
  turno: (f.turno as Tarea['turno']) ?? null,
  fecha: (f.fecha as string) ?? null,
  creada_en: f.creada_en as number,
  hecha_en: (f.hecha_en as number) ?? null,
  hecha_por: (f.hecha_por as string) ?? null,
  hecha_por_nombre: (f.hecha_por_nombre as string) ?? null,
  nota: (f.nota as string) ?? '',
})

/**
 * Tareas que ve recepción: las pendientes para ella (o para cualquiera) en este turno, y las que se hicieron
 * en las últimas 24 horas. El dueño ve todas las pendientes y las hechas en la última semana.
 */
export async function tareasPara(db: D1Database, h: Hostal, u: Usuario) {
  const t = ahora()
  if (u.rol === 'dueno') {
    const { results } = await db
      .prepare(`${SELECT_TAREA} WHERE t.hostal_id = ? AND (t.hecha_en IS NULL OR t.hecha_en > ?) ORDER BY t.hecha_en IS NOT NULL, t.creada_en DESC`)
      .bind(h.id, t - 7 * 86_400_000)
      .all()
    return results.map(aTarea)
  }
  const turno = turnoDeHora(t, h.hora_dia, h.hora_noche)
  const { results } = await db
    .prepare(
      `${SELECT_TAREA} WHERE t.hostal_id = ?
       AND (t.usuario_id IS NULL OR t.usuario_id = ?)
       AND ((t.hecha_en IS NULL AND (t.turno IS NULL OR t.turno = ?) AND (t.fecha IS NULL OR t.fecha <= ?)) OR t.hecha_en > ?)
       ORDER BY t.hecha_en IS NOT NULL, t.creada_en`,
    )
    .bind(h.id, u.id, turno.tipo, turno.fecha, t - 86_400_000)
    .all()
  return results.map(aTarea)
}

export const tareaRoutes = new Hono<AppEnv>()

tareaRoutes.get('/hostales/:h/tareas', async (c) => {
  const u = c.get('usuario')
  verificarHostal(u, c.req.param('h'))
  const h = await cargarHostal(c.env.DB, c.req.param('h'))
  return c.json({ tareas: await tareasPara(c.env.DB, h, u) })
})

tareaRoutes.post('/hostales/:h/tareas', async (c) => {
  const u = c.get('usuario')
  soloDueno(u)
  const h = await cargarHostal(c.env.DB, c.req.param('h'))
  const body = await cuerpo<{ texto?: string; usuario_id?: string | null; turno?: string | null; fecha?: string | null }>(c)
  const t = texto(body.texto, 300)
  if (!t) fail(400, 'Escribe la tarea.')
  let usuarioId: string | null = null
  if (body.usuario_id) {
    const r = await c.env.DB.prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'recepcion' AND hostal_id = ?").bind(body.usuario_id, h.id).first<{ id: string }>()
    if (!r) fail(400, 'Ese recepcionista no es de este hostal.')
    usuarioId = r.id
  }
  const turno = body.turno === 'dia' || body.turno === 'noche' ? body.turno : null
  const fecha = esFecha(body.fecha) ? body.fecha : null
  const id = uid()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO tareas (id, hostal_id, texto, usuario_id, turno, fecha, creada_por, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, h.id, t, usuarioId, turno, fecha, u.id, ahora()),
    historial(c, { hostal_id: h.id, accion: 'asignó tarea', entidad: 'tarea', entidad_id: id, detalle: { texto: t, usuario_id: usuarioId, turno, fecha } }),
    subirVersion(c.env.DB, h.id),
  ])
  const fila = await c.env.DB.prepare(`${SELECT_TAREA} WHERE t.id = ?`).bind(id).first()
  return c.json(aTarea(fila!), 201)
})

tareaRoutes.patch('/tareas/:id', async (c) => {
  const u = c.get('usuario')
  const id = c.req.param('id')
  const antes = await c.env.DB.prepare(`${SELECT_TAREA} WHERE t.id = ?`).bind(id).first()
  if (!antes) fail(404, 'Esa tarea no existe.')
  const tarea = aTarea(antes)
  verificarHostal(u, tarea.hostal_id)
  const body = await cuerpo<{ hecha?: boolean; nota?: string; texto?: string }>(c)
  const sentencias: D1PreparedStatement[] = []
  if (body.hecha !== undefined) {
    const hecha = Boolean(body.hecha)
    if (u.rol !== 'dueno' && !hecha && tarea.hecha_por !== u.id) fail(403, 'Solo quien la marcó (o el dueño) puede desmarcarla.')
    sentencias.push(
      c.env.DB.prepare('UPDATE tareas SET hecha_en = ?, hecha_por = ?, nota = ? WHERE id = ?').bind(hecha ? ahora() : null, hecha ? u.id : null, texto(body.nota, 300) || tarea.nota, id),
      historial(c, { hostal_id: tarea.hostal_id, accion: hecha ? 'hizo tarea' : 'desmarcó tarea', entidad: 'tarea', entidad_id: id, detalle: { texto: tarea.texto } }),
    )
  }
  if (body.texto !== undefined) {
    soloDueno(u)
    const t = texto(body.texto, 300)
    if (!t) fail(400, 'Escribe la tarea.')
    sentencias.push(
      c.env.DB.prepare('UPDATE tareas SET texto = ? WHERE id = ?').bind(t, id),
      historial(c, { hostal_id: tarea.hostal_id, accion: 'editó tarea', entidad: 'tarea', entidad_id: id, detalle: { antes: tarea.texto, despues: t } }),
    )
  }
  if (!sentencias.length) fail(400, 'No hay cambios.')
  await c.env.DB.batch([...sentencias, subirVersion(c.env.DB, tarea.hostal_id)])
  return c.json(aTarea((await c.env.DB.prepare(`${SELECT_TAREA} WHERE t.id = ?`).bind(id).first())!))
})

tareaRoutes.delete('/tareas/:id', async (c) => {
  soloDueno(c.get('usuario'))
  const id = c.req.param('id')
  const tarea = await c.env.DB.prepare('SELECT * FROM tareas WHERE id = ?').bind(id).first<{ hostal_id: string; texto: string }>()
  if (!tarea) fail(404, 'Esa tarea no existe.')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tareas WHERE id = ?').bind(id),
    historial(c, { hostal_id: tarea.hostal_id, accion: 'borró tarea', entidad: 'tarea', entidad_id: id, detalle: { texto: tarea.texto } }),
    subirVersion(c.env.DB, tarea.hostal_id),
  ])
  return c.json({ ok: true })
})
