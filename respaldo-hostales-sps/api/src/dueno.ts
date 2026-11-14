import { Hono } from 'hono'
import { cuadreDia, estadoHabitacion, nivelCredito } from '../../shared/calculos'
import { diasDelMes, esFecha, esMes, instanteHN, sumarDias, turnoDeHora } from '../../shared/fechas'
import type { Factura, Turno } from '../../shared/reglas'
import type { AppEnv } from './env'
import {
  aRegistro,
  aTurno,
  cargarAjustes,
  cargarHostal,
  cargarHostales,
  conMovimientos,
  fechaDeHoy,
  historial,
  SELECT_REGISTRO,
  SELECT_TURNO,
  soloDueno,
  subirVersion,
  verificarHostal,
} from './db'
import { ahora, cuerpo, fail, texto } from './util'

export const duenoRoutes = new Hono<AppEnv>()

type Alerta = { nivel: 'rojo' | 'aviso' | 'info'; texto: string; ir?: string }

const nombreTurno = (t: Pick<Turno, 'tipo'>) => (t.tipo === 'dia' ? 'día' : 'noche')

/** Creditos pendientes de facturar, agrupados por hostal y empresa. */
async function creditosPendientes(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT r.hostal_id, r.empresa_id, e.nombre AS empresa, COUNT(*) AS noches, COALESCE(SUM(r.precio), 0) AS monto, MIN(r.fecha) AS desde, MAX(r.fecha) AS hasta
       FROM registros r JOIN empresas e ON e.id = r.empresa_id
       WHERE r.pago = 'credito' AND r.anulado_en IS NULL AND r.factura_id IS NULL
       GROUP BY r.hostal_id, r.empresa_id ORDER BY desde`,
    )
    .all<{ hostal_id: string; empresa_id: string; empresa: string; noches: number; monto: number; desde: string; hasta: string }>()
  return results
}

/** Panel de hoy: cómo está cada hostal ahora mismo y qué hay que atender. */
duenoRoutes.get('/dueno/hoy', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const t = ahora()
  const [hostales, creditos] = await Promise.all([cargarHostales(db), creditosPendientes(db)])

  const resumen = await Promise.all(
    hostales.map(async (h) => {
      const fecha = fechaDeHoy(h)
      const ayer = sumarDias(fecha, -1)
      const [regs, turnosRes, dias, tareas] = await Promise.all([
        db.prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.anulado_en IS NULL AND (r.fecha IN (?, ?) OR (r.modo = 'hora' AND r.salida_en IS NULL))`).bind(h.id, fecha, ayer).all(),
        db.prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND (t.cerrado_en IS NULL OR t.fecha >= ?) ORDER BY t.abierto_en`).bind(h.id, ayer).all(),
        db.prepare('SELECT * FROM dias WHERE hostal_id = ? AND fecha IN (?, ?)').bind(h.id, ayer, fecha).all<{ fecha: string; cerrado_en: number | null; revisado_en: number | null }>(),
        db.prepare('SELECT COUNT(*) AS n FROM tareas WHERE hostal_id = ? AND hecha_en IS NULL').bind(h.id).first<{ n: number }>(),
      ])
      const registros = regs.results.map(aRegistro)
      const turnos = await conMovimientos(db, turnosRes.results.map(aTurno))
      const hoy = registros.filter((r) => r.fecha === fecha)
      const datos = { fecha, hoy, ayer: registros.filter((r) => r.fecha !== fecha) }
      const conteo = { libre: 0, ocupada: 0, hora: 0, sale: 0, limpieza: 0 }
      for (const hab of h.habitaciones.filter((x) => x.activa)) conteo[estadoHabitacion(hab, datos, h, t).estado]++

      const slot = turnoDeHora(t, h.hora_dia, h.hora_noche)
      const abiertos = turnos.filter((x) => x.cerrado_en == null)
      const actual = abiertos.find((x) => x.fecha === slot.fecha && x.tipo === slot.tipo) ?? abiertos.at(-1) ?? null
      const alertas: Alerta[] = []

      for (const x of abiertos) {
        const fin = x.tipo === 'dia' ? instanteHN(x.fecha, h.hora_noche) : instanteHN(sumarDias(x.fecha, 1), h.hora_dia)
        if (t > fin + 30 * 60_000) alertas.push({ nivel: 'aviso', texto: `El turno de ${nombreTurno(x)} del ${x.fecha.slice(8)}/${x.fecha.slice(5, 7)} (${x.usuario ?? '—'}) sigue sin cerrar.` })
      }
      const diaAyer = dias.results.find((d) => d.fecha === ayer)
      if (!diaAyer?.cerrado_en && t > instanteHN(fecha, h.hora_dia) + 60 * 60_000) alertas.push({ nivel: 'aviso', texto: 'El día de ayer no se ha cerrado.' })
      const sinPago = hoy.filter((r) => r.pago == null && (r.modo === 'noche' || r.salida_en != null))
      if (sinPago.length) alertas.push({ nivel: 'aviso', texto: `Sin forma de pago: hab. ${sinPago.map((r) => r.habitacion).join(', ')}.` })
      for (const r of registros.filter((x) => x.modo === 'hora' && x.salida_en == null && t - x.entrada_en > 6 * 3600_000)) {
        alertas.push({ nivel: 'aviso', texto: `Hab. ${r.habitacion}: alquiler por hora abierto hace ${Math.floor((t - r.entrada_en) / 3600_000)} h.` })
      }
      const cuadreAyer = cuadreDia(ayer, registros, turnos)
      if (diaAyer?.cerrado_en && cuadreAyer.diferencia !== 0 && !diaAyer.revisado_en) {
        alertas.push({ nivel: 'rojo', texto: `Diferencia de caja ayer: ${cuadreAyer.diferencia > 0 ? 'sobran' : 'faltan'} L ${(Math.abs(cuadreAyer.diferencia) / 100).toLocaleString('en-US')}.`, ir: 'caja' })
      }
      for (const cr of creditos.filter((x) => x.hostal_id === h.id)) {
        const nivel = nivelCredito(cr.desde, fecha)
        if (nivel !== 'ok') alertas.push({ nivel: nivel === 'rojo' ? 'rojo' : 'aviso', texto: `${cr.empresa}: ${cr.noches} noches a crédito sin facturar desde el ${cr.desde.slice(8)}/${cr.desde.slice(5, 7)}.`, ir: 'creditos' })
      }
      if (tareas?.n) alertas.push({ nivel: 'info', texto: `${tareas.n} ${tareas.n === 1 ? 'tarea pendiente' : 'tareas pendientes'}.`, ir: 'tareas' })

      return {
        id: h.id,
        nombre: h.nombre,
        fecha,
        version: h.version,
        habitaciones: h.habitaciones.filter((x) => x.activa).length,
        conteo,
        vendido_hoy: hoy.reduce((s, r) => s + (r.precio ?? 0), 0),
        turno_actual: actual,
        turnos_hoy: turnos.filter((x) => x.fecha === fecha),
        dia_cerrado: dias.results.some((d) => d.fecha === fecha && d.cerrado_en != null),
        ayer: { fecha: ayer, cerrado: Boolean(diaAyer?.cerrado_en), revisado: Boolean(diaAyer?.revisado_en), cuadre: { esperado: cuadreAyer.esperado, declarado: cuadreAyer.declarado, diferencia: cuadreAyer.diferencia } },
        alertas,
      }
    }),
  )
  return c.json({ ahora: t, hostales: resumen })
})

/** Versiones de todos los hostales (para que el panel del dueño se actualice solo). */
duenoRoutes.get('/dueno/version', async (c) => {
  soloDueno(c.get('usuario'))
  const { results } = await c.env.DB.prepare('SELECT id, version FROM hostales').all<{ id: string; version: number }>()
  return c.json({ version: results.map((h) => `${h.id}:${h.version}`).join(','), ahora: ahora() })
})

/** Todo el mes de un hostal: registros, turnos con su caja y días cerrados. */
duenoRoutes.get('/hostales/:h/mes', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  verificarHostal(u, c.req.param('h'))
  if (u.rol !== 'dueno' && !(await cargarAjustes(db)).recepcion_ve_mes) fail(403, 'Solo el dueño puede ver el mes.')
  const h = await cargarHostal(db, c.req.param('h'))
  const mes = c.req.query('mes') ?? fechaDeHoy(h).slice(0, 7)
  if (!esMes(mes)) fail(400, 'Mes no válido.')
  const desde = `${mes}-01`
  const hasta = `${mes}-${String(diasDelMes(mes)).padStart(2, '0')}`
  const [regs, turnos, dias] = await Promise.all([
    db.prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.fecha BETWEEN ? AND ? AND r.anulado_en IS NULL ORDER BY r.fecha, r.habitacion`).bind(h.id, desde, hasta).all(),
    db.prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND t.fecha BETWEEN ? AND ? ORDER BY t.fecha, t.abierto_en`).bind(h.id, desde, hasta).all(),
    db.prepare('SELECT d.*, u.nombre AS revisado_por_nombre FROM dias d LEFT JOIN usuarios u ON u.id = d.revisado_por WHERE d.hostal_id = ? AND d.fecha BETWEEN ? AND ?').bind(h.id, desde, hasta).all(),
  ])
  return c.json({
    mes,
    hoy: fechaDeHoy(h),
    hostal: h,
    registros: regs.results.map(aRegistro),
    turnos: u.rol === 'dueno' ? await conMovimientos(db, turnos.results.map(aTurno)) : [],
    dias: dias.results,
  })
})

/** Cuentas por cobrar a crédito: lo pendiente de facturar y las facturas por cobrar. */
duenoRoutes.get('/creditos', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const [hostales, pendientes, regs, facturas] = await Promise.all([
    cargarHostales(db),
    creditosPendientes(db),
    db.prepare(`${SELECT_REGISTRO} WHERE r.pago = 'credito' AND r.anulado_en IS NULL AND r.factura_id IS NULL ORDER BY r.fecha, r.habitacion`).all(),
    db
      .prepare('SELECT f.*, e.nombre AS empresa FROM facturas f JOIN empresas e ON e.id = f.empresa_id ORDER BY f.pagada_en IS NOT NULL, f.creada_en DESC LIMIT 300')
      .all<Factura>(),
  ])
  const hoyDe = Object.fromEntries(hostales.map((h) => [h.id, fechaDeHoy(h)]))
  return c.json({
    pendientes: pendientes.map((p) => ({ ...p, nivel: nivelCredito(p.desde, hoyDe[p.hostal_id]), hoy: hoyDe[p.hostal_id] })),
    registros: regs.results.map(aRegistro),
    facturas: facturas.results,
  })
})

/** Marcar como facturado: las noches a crédito pendientes de una empresa (hasta una fecha) pasan a una factura. */
duenoRoutes.post('/facturas', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const body = await cuerpo<{ hostal_id?: string; empresa_id?: string; hasta?: string; numero?: string }>(c)
  if (typeof body.hostal_id !== 'string' || typeof body.empresa_id !== 'string') fail(400, 'Falta el hostal o la empresa.')
  const hasta = esFecha(body.hasta) ? body.hasta : '9999-12-31'
  const filtro = `hostal_id = ? AND empresa_id = ? AND pago = 'credito' AND anulado_en IS NULL AND factura_id IS NULL AND fecha <= ?`
  const pendientes = await db.prepare(`SELECT COUNT(*) AS n FROM registros WHERE ${filtro}`).bind(body.hostal_id, body.empresa_id, hasta).first<{ n: number }>()
  if (!pendientes?.n) fail(400, 'No hay noches a crédito pendientes de facturar.')
  const id = crypto.randomUUID()
  const numero = texto(body.numero, 40)
  await db.batch([
    db
      .prepare("INSERT INTO facturas (id, hostal_id, empresa_id, numero, desde, hasta, noches, monto, creada_en, creada_por) VALUES (?, ?, ?, ?, '', '', 0, 0, ?, ?)")
      .bind(id, body.hostal_id, body.empresa_id, numero, ahora(), c.get('usuario').id),
    db.prepare(`UPDATE registros SET factura_id = ? WHERE ${filtro}`).bind(id, body.hostal_id, body.empresa_id, hasta),
    db
      .prepare(
        `UPDATE facturas SET
           noches = (SELECT COUNT(*) FROM registros WHERE factura_id = ?1),
           monto = (SELECT COALESCE(SUM(precio), 0) FROM registros WHERE factura_id = ?1),
           desde = (SELECT MIN(fecha) FROM registros WHERE factura_id = ?1),
           hasta = (SELECT MAX(fecha) FROM registros WHERE factura_id = ?1)
         WHERE id = ?1`,
      )
      .bind(id),
    historial(c, { hostal_id: body.hostal_id, accion: 'marcó facturado', entidad: 'factura', entidad_id: id, detalle: { empresa_id: body.empresa_id, numero, hasta } }),
    subirVersion(db, body.hostal_id),
  ])
  const f = await db.prepare('SELECT f.*, e.nombre AS empresa FROM facturas f JOIN empresas e ON e.id = f.empresa_id WHERE f.id = ?').bind(id).first<Factura>()
  return c.json(f, 201)
})

duenoRoutes.patch('/facturas/:id', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const f = await db.prepare('SELECT * FROM facturas WHERE id = ?').bind(c.req.param('id')).first<Factura>()
  if (!f) fail(404, 'Esa factura no existe.')
  const body = await cuerpo<{ pagada?: boolean; numero?: string }>(c)
  const pagada = body.pagada === undefined ? f.pagada_en : body.pagada ? (f.pagada_en ?? ahora()) : null
  const numero = body.numero === undefined ? f.numero : texto(body.numero, 40)
  await db.batch([
    db.prepare('UPDATE facturas SET pagada_en = ?, pagada_por = ?, numero = ? WHERE id = ?').bind(pagada, pagada ? c.get('usuario').id : null, numero, f.id),
    historial(c, {
      hostal_id: f.hostal_id,
      accion: body.pagada === undefined ? 'editó factura' : body.pagada ? 'marcó factura pagada' : 'marcó factura sin pagar',
      entidad: 'factura',
      entidad_id: f.id,
      detalle: { numero, monto: f.monto },
    }),
  ])
  return c.json({ ...f, pagada_en: pagada, numero })
})

/** Deshacer una factura: sus noches vuelven a «pendiente de facturar». */
duenoRoutes.delete('/facturas/:id', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const f = await db.prepare('SELECT * FROM facturas WHERE id = ?').bind(c.req.param('id')).first<Factura>()
  if (!f) fail(404, 'Esa factura no existe.')
  if (f.pagada_en) fail(409, 'Esa factura ya está pagada. Primero márcala sin pagar.')
  await db.batch([
    db.prepare('UPDATE registros SET factura_id = NULL WHERE factura_id = ?').bind(f.id),
    db.prepare('DELETE FROM facturas WHERE id = ?').bind(f.id),
    historial(c, { hostal_id: f.hostal_id, accion: 'deshizo factura', entidad: 'factura', entidad_id: f.id, detalle: f }),
    subirVersion(db, f.hostal_id),
  ])
  return c.json({ ok: true })
})

/** Historial de cambios: quién, qué y cuándo. */
duenoRoutes.get('/historial', async (c) => {
  soloDueno(c.get('usuario'))
  const q = c.req.query()
  const where: string[] = []
  const params: unknown[] = []
  if (q.hostal) {
    where.push('hostal_id = ?')
    params.push(q.hostal)
  }
  if (q.usuario) {
    where.push('usuario_id = ?')
    params.push(q.usuario)
  }
  if (q.entidad_id) {
    where.push('entidad_id = ?')
    params.push(q.entidad_id)
  }
  if (q.antes && /^\d+$/.test(q.antes)) {
    where.push('id < ?')
    params.push(Number(q.antes))
  }
  const limite = Math.min(Number(q.limite) || 100, 300)
  const { results } = await c.env.DB.prepare(`SELECT * FROM historial ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limite}`)
    .bind(...params)
    .all<Record<string, unknown>>()
  return c.json({
    eventos: results.map((e) => {
      let detalle: unknown = {}
      try {
        detalle = JSON.parse(e.detalle as string)
      } catch {
        /* vacío */
      }
      return { ...e, detalle }
    }),
  })
})
