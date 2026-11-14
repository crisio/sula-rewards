import type { Context } from 'hono'
import { fechaTrabajo, turnoDeHora } from '../../shared/fechas'
import { AJUSTES_INICIALES, type Ajustes, type Habitacion, type Hostal, type Registro, type Turno } from '../../shared/reglas'
import type { AppEnv, Usuario } from './env'
import { ahora, fail } from './util'

type Fila = Record<string, unknown>

export const SELECT_REGISTRO = `
  SELECT r.*, e.nombre AS empresa, u.nombre AS creado_por_nombre
  FROM registros r
  LEFT JOIN empresas e ON e.id = r.empresa_id
  LEFT JOIN usuarios u ON u.id = r.creado_por`

export function aRegistro(f: Fila): Registro {
  return {
    id: f.id as string,
    hostal_id: f.hostal_id as string,
    fecha: f.fecha as string,
    habitacion: f.habitacion as string,
    modo: f.modo as Registro['modo'],
    huesped: f.huesped as string,
    empresa_id: (f.empresa_id as string) ?? null,
    empresa: (f.empresa as string) ?? null,
    tipo: f.tipo as Registro['tipo'],
    precio: (f.precio as number) ?? null,
    pago: (f.pago as Registro['pago']) ?? null,
    larga: Boolean(f.larga),
    estadia_id: f.estadia_id as string,
    nota: (f.nota as string) ?? '',
    foto_id: (f.foto_id as string) ?? null,
    entrada_en: f.entrada_en as number,
    salida_en: (f.salida_en as number) ?? null,
    cobro_turno_id: (f.cobro_turno_id as string) ?? null,
    factura_id: (f.factura_id as string) ?? null,
    origen: f.origen as Registro['origen'],
    creado_por: (f.creado_por as string) ?? null,
    creado_por_nombre: (f.creado_por_nombre as string) ?? null,
    creado_en: f.creado_en as number,
    editado_en: (f.editado_en as number) ?? null,
  }
}

export const SELECT_TURNO = `
  SELECT t.*, u.nombre AS usuario, c.nombre AS cerrado_por_nombre
  FROM turnos t
  LEFT JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN usuarios c ON c.id = t.cerrado_por`

export function aTurno(f: Fila): Turno {
  return {
    id: f.id as string,
    hostal_id: f.hostal_id as string,
    fecha: f.fecha as string,
    tipo: f.tipo as Turno['tipo'],
    usuario_id: (f.usuario_id as string) ?? null,
    usuario: (f.usuario as string) ?? null,
    abierto_en: f.abierto_en as number,
    cerrado_en: (f.cerrado_en as number) ?? null,
    cerrado_por: (f.cerrado_por as string) ?? null,
    cerrado_por_nombre: (f.cerrado_por_nombre as string) ?? null,
    notas: (f.notas as string) ?? '',
  }
}

/** Agrega a cada turno sus movimientos de caja. */
export async function conMovimientos(db: D1Database, turnos: Turno[]) {
  if (!turnos.length) return turnos
  const ids = turnos.map((t) => t.id)
  const { results } = await db
    .prepare(`SELECT * FROM caja_movimientos WHERE turno_id IN (${ids.map(() => '?').join(',')}) ORDER BY creado_en`)
    .bind(...ids)
    .all<Fila>()
  for (const t of turnos) {
    t.movimientos = results
      .filter((m) => m.turno_id === t.id)
      .map((m) => ({
        id: m.id as string,
        turno_id: m.turno_id as string,
        tipo: m.tipo as 'entregado' | 'depositado',
        monto: m.monto as number,
        cuenta: m.cuenta as string,
        referencia: m.referencia as string,
        entregado_por: m.entregado_por as string,
        recibido_por: m.recibido_por as string,
        foto_id: (m.foto_id as string) ?? null,
        creado_en: m.creado_en as number,
      }))
  }
  return turnos
}

export async function cargarHostal(db: D1Database, id: string): Promise<Hostal> {
  const h = await db.prepare('SELECT * FROM hostales WHERE id = ?').bind(id).first<Fila>()
  if (!h) fail(404, 'Ese hostal no existe.')
  const { results } = await db.prepare('SELECT * FROM habitaciones WHERE hostal_id = ? ORDER BY orden, numero').bind(id).all<Fila>()
  return {
    ...(h as unknown as Omit<Hostal, 'habitaciones'>),
    habitaciones: results.map(
      (r): Habitacion => ({ numero: r.numero as string, tipo: r.tipo as Habitacion['tipo'], orden: r.orden as number, activa: Boolean(r.activa), limpia_en: (r.limpia_en as number) ?? null }),
    ),
  }
}

export async function cargarHostales(db: D1Database) {
  const { results } = await db.prepare('SELECT id FROM hostales ORDER BY orden').all<{ id: string }>()
  return Promise.all(results.map((h) => cargarHostal(db, h.id)))
}

export async function cargarAjustes(db: D1Database): Promise<Ajustes> {
  const { results } = await db.prepare('SELECT clave, valor FROM ajustes').all<{ clave: string; valor: string }>()
  const ajustes: Record<string, unknown> = { ...AJUSTES_INICIALES }
  for (const r of results) {
    try {
      ajustes[r.clave] = JSON.parse(r.valor)
    } catch {
      /* se queda el valor inicial */
    }
  }
  return ajustes as unknown as Ajustes
}

/** El dueño ve todo; recepción solo su hostal. */
export function verificarHostal(u: Usuario, hostalId: string) {
  if (u.rol !== 'dueno' && u.hostal_id !== hostalId) fail(403, 'No tienes acceso a ese hostal.')
}

export function soloDueno(u: Usuario) {
  if (u.rol !== 'dueno') fail(403, 'Solo el dueño puede hacer esto.')
}

/** Día de trabajo de hoy para un hostal. */
export const fechaDeHoy = (h: Pick<Hostal, 'hora_dia'>) => fechaTrabajo(ahora(), h.hora_dia)

/** El turno abierto que corresponde a esta hora (para anotar en qué turno se cobró). */
export async function turnoAbiertoActual(db: D1Database, h: Hostal, u: Usuario) {
  if (u.rol === 'recepcion') {
    const mio = await db
      .prepare('SELECT id FROM turnos WHERE hostal_id = ? AND usuario_id = ? AND cerrado_en IS NULL ORDER BY abierto_en DESC LIMIT 1')
      .bind(h.id, u.id)
      .first<{ id: string }>()
    if (mio) return mio.id
  }
  const t = turnoDeHora(ahora(), h.hora_dia, h.hora_noche)
  const actual = await db
    .prepare('SELECT id FROM turnos WHERE hostal_id = ? AND fecha = ? AND tipo = ? AND cerrado_en IS NULL')
    .bind(h.id, t.fecha, t.tipo)
    .first<{ id: string }>()
  return actual?.id ?? null
}

/**
 * ¿Puede este usuario cambiar los registros de esa fecha?
 * Recepción: solo el día de trabajo de hoy, o el día de un turno suyo que sigue abierto, y nunca un día cerrado.
 * El dueño: siempre (queda en el historial como corrección si el día estaba cerrado).
 */
export async function verificarFechaEditable(db: D1Database, h: Hostal, u: Usuario, fecha: string) {
  const dia = await db.prepare('SELECT cerrado_en FROM dias WHERE hostal_id = ? AND fecha = ?').bind(h.id, fecha).first<{ cerrado_en: number | null }>()
  const cerrado = dia?.cerrado_en != null
  if (u.rol === 'dueno') return { cerrado }
  if (cerrado) fail(403, 'Ese día ya se cerró. Solo el dueño puede corregirlo.')
  if (fecha === fechaDeHoy(h)) return { cerrado }
  const turnoMio = await db
    .prepare('SELECT 1 FROM turnos WHERE hostal_id = ? AND usuario_id = ? AND fecha = ? AND cerrado_en IS NULL')
    .bind(h.id, u.id, fecha)
    .first()
  if (!turnoMio) fail(403, 'Solo puedes cambiar el día de trabajo de hoy. Pide al dueño que lo corrija.')
  return { cerrado }
}

/** Sentencia para el historial: quién, qué y cuándo. */
export function historial(
  c: Context<AppEnv>,
  datos: { hostal_id: string | null; accion: string; entidad: string; entidad_id?: string | null; detalle?: unknown },
) {
  const u = c.get('usuario')
  return c.env.DB.prepare(
    'INSERT INTO historial (hostal_id, usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(datos.hostal_id, u?.id ?? null, u?.nombre ?? '', datos.accion, datos.entidad, datos.entidad_id ?? null, JSON.stringify(datos.detalle ?? {}), ahora())
}

/** Sube la versión del hostal: los teléfonos que lo están viendo se actualizan en segundos. */
export const subirVersion = (db: D1Database, hostalId: string) => db.prepare('UPDATE hostales SET version = version + 1 WHERE id = ?').bind(hostalId)

/** Solo los campos que cambiaron, para el historial. */
export function cambios(antes: Record<string, unknown>, despues: Record<string, unknown>) {
  const out: Record<string, { antes: unknown; despues: unknown }> = {}
  for (const k of Object.keys(despues)) if (antes[k] !== despues[k]) out[k] = { antes: antes[k] ?? null, despues: despues[k] ?? null }
  return out
}
