import { Hono, type Context } from 'hono'
import { esFecha, instanteHN, sumarDias } from '../../shared/fechas'
import { nombrePropio, PAGOS, precioLista, TIPOS, type Hostal, type Pago, type TipoHabitacion } from '../../shared/reglas'
import type { AppEnv } from './env'
import {
  aRegistro,
  aTurno,
  cambios,
  cargarAjustes,
  cargarHostal,
  fechaDeHoy,
  historial,
  SELECT_REGISTRO,
  SELECT_TURNO,
  subirVersion,
  turnoAbiertoActual,
  verificarFechaEditable,
  verificarHostal,
} from './db'
import { resolverEmpresa } from './empresas'
import { tareasPara } from './tareas'
import { ahora, cuerpo, fail, monto, texto, textoLargo, uid } from './util'

export const recepcionRoutes = new Hono<AppEnv>()

async function hostalDe(c: Context<AppEnv>, id: string) {
  verificarHostal(c.get('usuario'), id)
  return cargarHostal(c.env.DB, id)
}

async function cargarRegistro(c: Context<AppEnv>, id: string) {
  const f = await c.env.DB.prepare(`${SELECT_REGISTRO} WHERE r.id = ? AND r.anulado_en IS NULL`).bind(id).first()
  if (!f) fail(404, 'Ese registro no existe o fue anulado.')
  const r = aRegistro(f)
  verificarHostal(c.get('usuario'), r.hostal_id)
  return r
}

const releer = async (db: D1Database, id: string) => aRegistro((await db.prepare(`${SELECT_REGISTRO} WHERE r.id = ?`).bind(id).first())!)

function leerPagoBody(valor: unknown): Pago | null {
  if (valor == null || valor === '') return null
  if (!PAGOS.includes(valor as Pago)) fail(400, 'Esa forma de pago no es válida.')
  return valor as Pago
}

function leerTipoBody(valor: unknown, porDefecto: TipoHabitacion): TipoHabitacion {
  if (valor == null || valor === '') return porDefecto
  if (!TIPOS.includes(valor as TipoHabitacion)) fail(400, 'El tipo de habitación debe ser Sencilla, Doble o Triple.')
  return valor as TipoHabitacion
}

/** Registros que chocan con una habitación en una noche: otra noche, un alquiler por hora abierto o el huésped de anoche. */
async function verificarDisponible(db: D1Database, h: Hostal, habitacion: string, fecha: string, modo: 'noche' | 'hora', excepto?: string) {
  const { results } = await db
    .prepare(
      `${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.habitacion = ? AND r.anulado_en IS NULL AND r.id != ?
       AND (r.fecha IN (?, ?) OR (r.modo = 'hora' AND r.salida_en IS NULL))`,
    )
    .bind(h.id, habitacion, excepto ?? '', fecha, sumarDias(fecha, -1))
    .all()
  const regs = results.map(aRegistro)
  const noche = regs.find((r) => r.modo === 'noche' && r.fecha === fecha)
  if (modo === 'noche' && noche) fail(409, `La habitación ${habitacion} ya tiene huésped esa noche: ${noche.huesped}.`, { conflicto: noche })
  if (modo === 'hora' && noche && noche.salida_en == null) fail(409, `La habitación ${habitacion} tiene huésped esta noche: ${noche.huesped}.`, { conflicto: noche })
  const hora = regs.find((r) => r.modo === 'hora' && r.salida_en == null)
  if (hora) fail(409, `La habitación ${habitacion} está alquilada por hora. Primero cierra ese alquiler.`, { conflicto: hora })
  // Si el huésped de anoche no ha salido y todavía no son las 11:30, al ocupar la habitación se marca su salida.
  const anoche = regs.find((r) => r.modo === 'noche' && r.fecha === sumarDias(fecha, -1) && r.salida_en == null)
  if (anoche && fecha === fechaDeHoy(h) && ahora() < instanteHN(fecha, h.hora_salida)) return anoche
  return null
}

const marcarLimpia = (db: D1Database, h: Hostal, habitacion: string) =>
  db.prepare('UPDATE habitaciones SET limpia_en = ? WHERE hostal_id = ? AND numero = ?').bind(ahora(), h.id, habitacion)

/** Todo lo del día de trabajo: habitaciones, registros de hoy y de anoche, turnos, nota del turno anterior y tareas. */
recepcionRoutes.get('/hostales/:h/hoy', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const h = await hostalDe(c, c.req.param('h'))
  const fecha = fechaDeHoy(h)
  const ayer = sumarDias(fecha, -1)
  const [regs, turnos, nota, dias, tareas, ajustes] = await Promise.all([
    db
      .prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.anulado_en IS NULL AND (r.fecha IN (?, ?) OR (r.modo = 'hora' AND r.salida_en IS NULL)) ORDER BY r.entrada_en`)
      .bind(h.id, fecha, ayer)
      .all(),
    db.prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND (t.cerrado_en IS NULL OR t.fecha >= ?) ORDER BY t.abierto_en`).bind(h.id, ayer).all(),
    db
      .prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND t.cerrado_en IS NOT NULL AND t.notas != '' ORDER BY t.cerrado_en DESC LIMIT 1`)
      .bind(h.id)
      .first(),
    db.prepare('SELECT fecha, cerrado_en FROM dias WHERE hostal_id = ? AND fecha IN (?, ?)').bind(h.id, fecha, ayer).all<{ fecha: string; cerrado_en: number | null }>(),
    tareasPara(db, h, u),
    cargarAjustes(db),
  ])
  const registros = regs.results.map(aRegistro)
  return c.json({
    fecha,
    ayer,
    ahora: ahora(),
    version: h.version,
    hostal: h,
    hoy: registros.filter((r) => r.fecha === fecha),
    // Los de anoche, más cualquier alquiler por hora que se quedó abierto de días anteriores.
    anoche: registros.filter((r) => r.fecha !== fecha),
    turnos: turnos.results.map(aTurno),
    nota_anterior: nota ? aTurno(nota) : null,
    dia_cerrado: dias.results.some((d) => d.fecha === fecha && d.cerrado_en != null),
    tareas,
    ver_totales: u.rol === 'dueno' || ajustes.recepcion_ve_totales,
  })
})

/** Consulta liviana para saber si hay cambios (cada pocos segundos desde cada teléfono). */
recepcionRoutes.get('/hostales/:h/version', async (c) => {
  verificarHostal(c.get('usuario'), c.req.param('h'))
  const h = await c.env.DB.prepare('SELECT version, hora_dia FROM hostales WHERE id = ?').bind(c.req.param('h')).first<{ version: number; hora_dia: string }>()
  if (!h) fail(404, 'Ese hostal no existe.')
  return c.json({ version: h.version, fecha: fechaDeHoy(h), ahora: ahora() })
})

/** Huéspedes recientes (para autocompletar) y el tipo que más se vende en cada habitación. */
recepcionRoutes.get('/hostales/:h/sugerencias', async (c) => {
  const h = await hostalDe(c, c.req.param('h'))
  const desde = sumarDias(fechaDeHoy(h), -120)
  const [huespedes, tipos] = await Promise.all([
    c.env.DB.prepare(
      `SELECT r.huesped, e.nombre AS empresa, r.tipo, MAX(r.fecha) AS fecha
       FROM registros r LEFT JOIN empresas e ON e.id = r.empresa_id
       WHERE r.hostal_id = ? AND r.fecha >= ? AND r.anulado_en IS NULL AND r.modo = 'noche'
       GROUP BY r.huesped ORDER BY fecha DESC LIMIT 400`,
    )
      .bind(h.id, desde)
      .all<{ huesped: string; empresa: string | null; tipo: string; fecha: string }>(),
    c.env.DB.prepare(
      `SELECT habitacion, tipo, COUNT(*) AS n FROM registros
       WHERE hostal_id = ? AND fecha >= ? AND anulado_en IS NULL AND modo = 'noche'
       GROUP BY habitacion, tipo ORDER BY n DESC`,
    )
      .bind(h.id, sumarDias(fechaDeHoy(h), -60))
      .all<{ habitacion: string; tipo: TipoHabitacion; n: number }>(),
  ])
  const porHabitacion: Record<string, TipoHabitacion> = {}
  for (const t of tipos.results) porHabitacion[t.habitacion] ??= t.tipo
  return c.json({ huespedes: huespedes.results, tipos: porHabitacion })
})

/** Registrar una noche (o empezar un alquiler por hora). La fecha la pone el servidor: el día de trabajo de hoy. */
recepcionRoutes.post('/hostales/:h/registros', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const h = await hostalDe(c, c.req.param('h'))
  const body = await cuerpo<Record<string, unknown>>(c)
  const hab = h.habitaciones.find((x) => x.numero === body.habitacion && x.activa)
  if (!hab) fail(404, 'Esa habitación no existe.')
  const modo = body.modo === 'hora' ? 'hora' : 'noche'
  const fecha = u.rol === 'dueno' && esFecha(body.fecha) ? body.fecha : fechaDeHoy(h)
  const { cerrado } = await verificarFechaEditable(db, h, u, fecha)

  const huesped = nombrePropio(texto(body.huesped, 120)) || (modo === 'hora' ? 'Por hora' : '')
  if (!huesped) fail(400, 'Escribe el nombre del huésped.')
  const tipo = leerTipoBody(body.tipo, hab.tipo)
  const pago = leerPagoBody(body.pago)
  const empresa = await resolverEmpresa(c, h.id, body)
  if (pago === 'credito' && !empresa.id) fail(400, 'Para crédito elige la empresa.')
  const larga = modo === 'noche' && Boolean(body.larga)
  let precio: number | null
  if (pago === 'credito') precio = precioLista(h, tipo) // el crédito se valora con el precio de lista
  else if (body.precio == null || body.precio === '') precio = modo === 'noche' ? precioLista(h, tipo) - (larga ? h.descuento_larga : 0) : h.precio_hora
  else precio = monto(body.precio, 'El precio')

  const anoche = await verificarDisponible(db, h, hab.numero, fecha, modo)
  const id = uid()
  const t = ahora()
  const cobro = pago ? await turnoAbiertoActual(db, h, u) : null
  const nuevo = {
    id,
    hostal_id: h.id,
    fecha,
    habitacion: hab.numero,
    modo,
    huesped,
    empresa_id: empresa.id,
    tipo,
    precio,
    pago,
    larga: larga ? 1 : 0,
    estadia_id: uid(),
    nota: textoLargo(body.nota, 500),
    foto_id: typeof body.foto_id === 'string' ? body.foto_id : null,
    entrada_en: t,
    cobro_turno_id: cobro,
    origen: u.rol === 'dueno' ? 'dueno' : 'recepcion',
    creado_por: u.id,
    creado_en: t,
  }
  const cols = Object.keys(nuevo)
  try {
    await db.batch([
      ...empresa.sentencias,
      ...(anoche ? [db.prepare('UPDATE registros SET salida_en = ? WHERE id = ?').bind(t, anoche.id)] : []),
      db.prepare(`INSERT INTO registros (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(nuevo)),
      ...(fecha === fechaDeHoy(h) ? [marcarLimpia(db, h, hab.numero)] : []),
      historial(c, {
        hostal_id: h.id,
        accion: cerrado ? 'registró (corrección de día cerrado)' : modo === 'hora' ? 'abrió alquiler por hora' : 'registró huésped',
        entidad: 'registro',
        entidad_id: id,
        detalle: { fecha, habitacion: hab.numero, huesped, empresa_id: empresa.id, tipo, precio, pago },
      }),
      subirVersion(db, h.id),
    ])
  } catch (e) {
    if (String(e).includes('UNIQUE')) fail(409, `La habitación ${hab.numero} ya tiene huésped esa noche.`)
    throw e
  }
  return c.json(await releer(db, id), 201)
})

/** Corregir un registro. Recepción solo el día de hoy (y sin cerrar); el dueño cualquier día, y queda en el historial. */
recepcionRoutes.patch('/registros/:id', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const r = await cargarRegistro(c, c.req.param('id'))
  const h = await cargarHostal(db, r.hostal_id)
  const { cerrado } = await verificarFechaEditable(db, h, u, r.fecha)
  const body = await cuerpo<Record<string, unknown>>(c)

  const fecha = u.rol === 'dueno' && esFecha(body.fecha) ? body.fecha : r.fecha
  if (fecha !== r.fecha) await verificarFechaEditable(db, h, u, fecha)
  const habitacion = typeof body.habitacion === 'string' ? body.habitacion : r.habitacion
  if (!h.habitaciones.some((x) => x.numero === habitacion)) fail(404, 'Esa habitación no existe.')
  const huesped = body.huesped === undefined ? r.huesped : nombrePropio(texto(body.huesped, 120))
  if (!huesped) fail(400, 'Escribe el nombre del huésped.')
  const tipo = body.tipo === undefined ? r.tipo : leerTipoBody(body.tipo, r.tipo)
  const pago = body.pago === undefined ? r.pago : leerPagoBody(body.pago)
  const empresa = body.empresa_id === undefined && body.empresa === undefined ? { id: r.empresa_id, sentencias: [] } : await resolverEmpresa(c, h.id, body)
  if (pago === 'credito' && !empresa.id) fail(400, 'Para crédito elige la empresa.')
  const larga = body.larga === undefined ? r.larga : Boolean(body.larga)
  let precio = body.precio === undefined ? r.precio : body.precio === null || body.precio === '' ? null : monto(body.precio, 'El precio')
  if (pago === 'credito') precio = precioLista(h, tipo)
  if (r.factura_id && (pago !== r.pago || precio !== r.precio || empresa.id !== r.empresa_id || fecha !== r.fecha)) {
    fail(409, 'Esa noche ya está facturada. Para cambiarla, primero deshaz la factura en Créditos.')
  }
  if (habitacion !== r.habitacion || fecha !== r.fecha) await verificarDisponible(db, h, habitacion, fecha, r.modo, r.id)

  // El cobro queda en el turno que lo registró.
  let cobro = r.cobro_turno_id
  if (pago !== r.pago) cobro = pago ? (u.rol === 'recepcion' ? await turnoAbiertoActual(db, h, u) : r.cobro_turno_id) : null

  const despues = {
    fecha,
    habitacion,
    huesped,
    empresa_id: empresa.id,
    tipo,
    precio,
    pago,
    larga: larga ? 1 : 0,
    nota: body.nota === undefined ? r.nota : textoLargo(body.nota, 500),
    foto_id: body.foto_id === undefined ? r.foto_id : typeof body.foto_id === 'string' ? body.foto_id : null,
    cobro_turno_id: cobro,
  }
  const antes = { ...r, larga: r.larga ? 1 : 0 } as Record<string, unknown>
  const diff = cambios(antes, despues)
  if (!Object.keys(diff).length) return c.json(r)
  const sets = Object.keys(despues)
  try {
    await db.batch([
      ...empresa.sentencias,
      db
        .prepare(`UPDATE registros SET ${sets.map((k) => `${k} = ?`).join(', ')}, editado_por = ?, editado_en = ? WHERE id = ?`)
        .bind(...Object.values(despues), u.id, ahora(), r.id),
      historial(c, {
        hostal_id: h.id,
        accion: cerrado ? 'corrigió día cerrado' : 'editó registro',
        entidad: 'registro',
        entidad_id: r.id,
        detalle: { fecha: r.fecha, habitacion: r.habitacion, huesped: r.huesped, cambios: diff },
      }),
      subirVersion(db, h.id),
    ])
  } catch (e) {
    if (String(e).includes('UNIQUE')) fail(409, `La habitación ${habitacion} ya tiene huésped esa noche.`)
    throw e
  }
  return c.json(await releer(db, r.id))
})

recepcionRoutes.post('/registros/:id/anular', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const r = await cargarRegistro(c, c.req.param('id'))
  const h = await cargarHostal(db, r.hostal_id)
  const { cerrado } = await verificarFechaEditable(db, h, u, r.fecha)
  if (r.factura_id) fail(409, 'Esa noche ya está facturada. Primero deshaz la factura en Créditos.')
  const body = await cuerpo<{ motivo?: string }>(c)
  const motivo = texto(body.motivo, 300)
  if (!motivo) fail(400, 'Escribe por qué se anula.')
  await db.batch([
    db.prepare('UPDATE registros SET anulado_en = ?, anulado_por = ?, motivo_anulacion = ? WHERE id = ?').bind(ahora(), u.id, motivo, r.id),
    historial(c, {
      hostal_id: h.id,
      accion: cerrado ? 'anuló (corrección de día cerrado)' : 'anuló registro',
      entidad: 'registro',
      entidad_id: r.id,
      detalle: { motivo, registro: r },
    }),
    subirVersion(db, h.id),
  ])
  return c.json({ ok: true })
})

/**
 * Salida: cierra un alquiler por hora (con su precio y pago) o marca que el huésped ya se fue
 * (antes de las 11:30, o antes de terminar la noche). La habitación pasa a limpieza.
 */
recepcionRoutes.post('/registros/:id/salida', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const r = await cargarRegistro(c, c.req.param('id'))
  const h = await cargarHostal(db, r.hostal_id)
  const hoy = fechaDeHoy(h)
  if (r.salida_en != null) fail(409, 'Ya se marcó la salida.')
  const body = await cuerpo<{ precio?: number | null; pago?: Pago | null; empresa?: string; empresa_id?: string }>(c)
  const t = ahora()
  const sets: Record<string, unknown> = { salida_en: t }
  let sentencias: D1PreparedStatement[] = []
  if (r.modo === 'hora') {
    // Cerrar un alquiler por hora es parte de cobrarlo: aplica la regla del día editable.
    await verificarFechaEditable(db, h, u, r.fecha)
    const pago = body.pago === undefined ? r.pago : leerPagoBody(body.pago)
    const empresa = body.empresa_id === undefined && body.empresa === undefined ? { id: r.empresa_id, sentencias: [] } : await resolverEmpresa(c, h.id, body)
    if (pago === 'credito' && !empresa.id) fail(400, 'Para crédito elige la empresa.')
    sets.precio = body.precio === undefined ? r.precio : body.precio === null ? null : monto(body.precio, 'El precio')
    sets.pago = pago
    sets.empresa_id = empresa.id
    if (pago !== r.pago) sets.cobro_turno_id = pago ? await turnoAbiertoActual(db, h, u) : null
    sentencias = empresa.sentencias
  } else if (u.rol !== 'dueno' && r.fecha !== hoy && r.fecha !== sumarDias(hoy, -1)) {
    fail(403, 'Solo se puede marcar la salida de los huéspedes de anoche o de hoy.')
  }
  const cols = Object.keys(sets)
  await db.batch([
    ...sentencias,
    db.prepare(`UPDATE registros SET ${cols.map((k) => `${k} = ?`).join(', ')}, editado_por = ?, editado_en = ? WHERE id = ?`).bind(...Object.values(sets), u.id, t, r.id),
    historial(c, {
      hostal_id: h.id,
      accion: r.modo === 'hora' ? 'cerró alquiler por hora' : 'marcó salida',
      entidad: 'registro',
      entidad_id: r.id,
      detalle: { fecha: r.fecha, habitacion: r.habitacion, huesped: r.huesped, precio: sets.precio, pago: sets.pago },
    }),
    subirVersion(db, h.id),
  ])
  return c.json(await releer(db, r.id))
})

/** «Copiar huéspedes de ayer»: los que siguen hospedados pasan a la noche de hoy (misma estadía). */
recepcionRoutes.post('/hostales/:h/copiar', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const h = await hostalDe(c, c.req.param('h'))
  const fecha = fechaDeHoy(h)
  const ayer = sumarDias(fecha, -1)
  await verificarFechaEditable(db, h, u, fecha)
  const body = await cuerpo<{ ids?: unknown; copiar_pago?: boolean }>(c)
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : []
  if (!ids.length) fail(400, 'Elige al menos un huésped.')

  const { results } = await db
    .prepare(
      `${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.anulado_en IS NULL AND (r.fecha = ? OR (r.modo = 'hora' AND r.salida_en IS NULL) OR (r.id IN (${ids.map(() => '?').join(',')})))`,
    )
    .bind(h.id, fecha, ...ids)
    .all()
  const regs = results.map(aRegistro)
  const ocupadas = new Set(regs.filter((r) => (r.fecha === fecha && r.modo === 'noche') || (r.modo === 'hora' && r.salida_en == null)).map((r) => r.habitacion))
  const estadias = await db
    .prepare(`SELECT estadia_id, COUNT(*) AS n FROM registros WHERE anulado_en IS NULL AND estadia_id IN (SELECT estadia_id FROM registros WHERE id IN (${ids.map(() => '?').join(',')})) GROUP BY estadia_id`)
    .bind(...ids)
    .all<{ estadia_id: string; n: number }>()
  const nochesDe = new Map(estadias.results.map((e) => [e.estadia_id, e.n]))

  const t = ahora()
  const cobro = await turnoAbiertoActual(db, h, u)
  const sentencias: D1PreparedStatement[] = []
  const copiados: { habitacion: string; huesped: string }[] = []
  const omitidos: { habitacion: string; huesped: string; motivo: string }[] = []
  for (const id of ids) {
    const r = regs.find((x) => x.id === id)
    if (!r || r.fecha !== ayer || r.modo !== 'noche') {
      omitidos.push({ habitacion: r?.habitacion ?? '?', huesped: r?.huesped ?? '?', motivo: 'No es un huésped de anoche.' })
      continue
    }
    if (ocupadas.has(r.habitacion)) {
      omitidos.push({ habitacion: r.habitacion, huesped: r.huesped, motivo: `La habitación ${r.habitacion} ya está ocupada hoy.` })
      continue
    }
    ocupadas.add(r.habitacion)
    const noches = (nochesDe.get(r.estadia_id) ?? 1) + 1
    let precio = r.precio
    let larga = r.larga
    const lista = precioLista(h, r.tipo)
    // Pasado el mes, el descuento de estadía larga se aplica solo (si se estaba cobrando el precio de lista).
    if (!larga && r.pago !== 'credito' && noches > 30 && (precio == null || precio === lista)) {
      larga = true
      precio = lista - h.descuento_larga
    }
    const pago = r.pago === 'credito' ? 'credito' : body.copiar_pago ? r.pago : null
    if (pago === 'credito') precio = lista
    const nuevo = uid()
    sentencias.push(
      db
        .prepare(
          `INSERT INTO registros (id, hostal_id, fecha, habitacion, modo, huesped, empresa_id, tipo, precio, pago, larga, estadia_id, nota, entrada_en, cobro_turno_id, origen, creado_por, creado_en)
           VALUES (?, ?, ?, ?, 'noche', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'copiado', ?, ?)`,
        )
        .bind(nuevo, h.id, fecha, r.habitacion, r.huesped, r.empresa_id, r.tipo, precio, pago, larga ? 1 : 0, r.estadia_id, r.nota, t, pago ? cobro : null, u.id, t),
    )
    copiados.push({ habitacion: r.habitacion, huesped: r.huesped })
  }
  if (sentencias.length) {
    await db.batch([
      ...sentencias,
      historial(c, { hostal_id: h.id, accion: 'copió huéspedes de ayer', entidad: 'registro', detalle: { fecha, copiados, omitidos } }),
      subirVersion(db, h.id),
    ])
  }
  return c.json({ copiados, omitidos })
})

/** Marcar una habitación como lista después de la limpieza. */
recepcionRoutes.post('/hostales/:h/habitaciones/:num/lista', async (c) => {
  const db = c.env.DB
  const h = await hostalDe(c, c.req.param('h'))
  const num = c.req.param('num')
  if (!h.habitaciones.some((x) => x.numero === num)) fail(404, 'Esa habitación no existe.')
  await db.batch([
    marcarLimpia(db, h, num),
    historial(c, { hostal_id: h.id, accion: 'marcó habitación lista', entidad: 'habitacion', entidad_id: num }),
    subirVersion(db, h.id),
  ])
  return c.json({ ok: true })
})

