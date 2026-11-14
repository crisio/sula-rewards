import { Hono } from 'hono'
import { esFecha, siguienteTurno, turnoDeHora } from '../../shared/fechas'
import type { Pago } from '../../shared/reglas'
import type { AppEnv } from './env'
import { aRegistro, aTurno, cargarAjustes, cargarHostal, conMovimientos, historial, SELECT_REGISTRO, SELECT_TURNO, soloDueno, subirVersion, verificarHostal } from './db'
import { ahora, cuerpo, fail, monto, texto, textoLargo, uid } from './util'

export const turnoRoutes = new Hono<AppEnv>()

const cargarTurno = async (db: D1Database, id: string) => {
  const f = await db.prepare(`${SELECT_TURNO} WHERE t.id = ?`).bind(id).first()
  if (!f) fail(404, 'Ese turno no existe.')
  return (await conMovimientos(db, [aTurno(f)]))[0]
}

/**
 * El turno de quien entra a recepción: si ya tiene uno abierto, ese; si no, el que corresponde a la hora
 * (día 7–19, noche 19–7). Si el turno de la hora ya se cerró, o si es de otra persona y pide empezar el
 * suyo, se abre el siguiente.
 */
turnoRoutes.post('/hostales/:h/turnos/actual', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  verificarHostal(u, c.req.param('h'))
  if (u.rol !== 'recepcion') return c.json({ turno: null })
  const h = await cargarHostal(db, c.req.param('h'))
  const body = await cuerpo<{ siguiente?: boolean }>(c).catch(() => ({}) as { siguiente?: boolean })

  const mio = await db.prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND t.usuario_id = ? AND t.cerrado_en IS NULL ORDER BY t.abierto_en DESC LIMIT 1`).bind(h.id, u.id).first()
  if (mio) return c.json({ turno: aTurno(mio) })

  const buscar = (fecha: string, tipo: string) => db.prepare(`${SELECT_TURNO} WHERE t.hostal_id = ? AND t.fecha = ? AND t.tipo = ?`).bind(h.id, fecha, tipo).first()
  let slot = turnoDeHora(ahora(), h.hora_dia, h.hora_noche)
  let existente = await buscar(slot.fecha, slot.tipo)
  if (existente && (existente.cerrado_en != null || body.siguiente)) {
    slot = siguienteTurno(slot)
    existente = await buscar(slot.fecha, slot.tipo)
  }
  if (existente) {
    const t = aTurno(existente)
    if (t.cerrado_en != null) return c.json({ turno: null, mensaje: 'Los turnos de ahora ya se cerraron.' })
    return c.json({ turno: t })
  }
  const id = uid()
  try {
    await db.batch([
      db.prepare('INSERT INTO turnos (id, hostal_id, fecha, tipo, usuario_id, abierto_en) VALUES (?, ?, ?, ?, ?, ?)').bind(id, h.id, slot.fecha, slot.tipo, u.id, ahora()),
      historial(c, { hostal_id: h.id, accion: `abrió turno de ${slot.tipo === 'dia' ? 'día' : 'noche'}`, entidad: 'turno', entidad_id: id, detalle: slot }),
      subirVersion(db, h.id),
    ])
  } catch (e) {
    // Otro teléfono lo abrió al mismo tiempo.
    if (!String(e).includes('UNIQUE')) throw e
  }
  const t = await buscar(slot.fecha, slot.tipo)
  return c.json({ turno: aTurno(t!) })
})

/** Resumen para cerrar el turno: lo cobrado, lo que falta y el efectivo que se espera. */
turnoRoutes.get('/turnos/:id', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const turno = await cargarTurno(db, c.req.param('id'))
  verificarHostal(u, turno.hostal_id)
  const [regs, abiertas, ajustes] = await Promise.all([
    db.prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.anulado_en IS NULL AND (r.fecha = ? OR r.cobro_turno_id = ?) ORDER BY r.habitacion`).bind(turno.hostal_id, turno.fecha, turno.id).all(),
    db.prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.modo = 'hora' AND r.salida_en IS NULL AND r.anulado_en IS NULL`).bind(turno.hostal_id).all(),
    cargarAjustes(db),
  ])
  const registros = regs.results.map(aRegistro)
  const cobrados = registros.filter((r) => r.cobro_turno_id === turno.id)
  const porPago: Partial<Record<Pago, number>> = {}
  for (const r of cobrados) if (r.pago) porPago[r.pago] = (porPago[r.pago] ?? 0) + (r.precio ?? 0)
  const verTotales = u.rol === 'dueno' || ajustes.recepcion_ve_totales
  return c.json({
    turno,
    registros: registros.filter((r) => r.fecha === turno.fecha),
    cobrados: cobrados.length,
    sin_pago: registros.filter((r) => r.fecha === turno.fecha && r.pago == null && !(r.modo === 'hora' && r.salida_en == null)),
    horas_abiertas: abiertas.results.map(aRegistro),
    ver_totales: verTotales,
    por_pago: verTotales ? porPago : null,
    efectivo_esperado: verTotales ? (porPago.efectivo ?? 0) : null,
    cuentas_banco: ajustes.cuentas_banco,
  })
})

turnoRoutes.post('/turnos/:id/cerrar', async (c) => {
  const u = c.get('usuario')
  const db = c.env.DB
  const turno = await cargarTurno(db, c.req.param('id'))
  verificarHostal(u, turno.hostal_id)
  if (turno.cerrado_en != null) fail(409, 'Ese turno ya está cerrado.')
  const body = await cuerpo<{ notas?: string; movimientos?: unknown; confirmar?: boolean }>(c)

  const sinPago = (
    await db.prepare(`${SELECT_REGISTRO} WHERE r.hostal_id = ? AND r.fecha = ? AND r.anulado_en IS NULL AND r.pago IS NULL AND NOT (r.modo = 'hora' AND r.salida_en IS NULL)`).bind(turno.hostal_id, turno.fecha).all()
  ).results.map(aRegistro)
  if (sinPago.length && !body.confirmar) {
    const lista = sinPago.map((r) => r.habitacion).join(', ')
    fail(409, `Hay ${sinPago.length === 1 ? 'una habitación' : `${sinPago.length} habitaciones`} sin forma de pago: ${lista}.`, { sin_pago: sinPago })
  }

  const movs = Array.isArray(body.movimientos) ? body.movimientos.slice(0, 20) : []
  const t = ahora()
  const sentencias: D1PreparedStatement[] = []
  const resumen: unknown[] = []
  for (const m of movs as Record<string, unknown>[]) {
    const tipo = m.tipo === 'depositado' ? 'depositado' : m.tipo === 'entregado' ? 'entregado' : fail(400, 'Cada movimiento es «entregado» o «depositado».')
    const valor = monto(m.monto, 'El monto')
    if (valor <= 0) fail(400, 'El monto debe ser mayor que cero.')
    const cuenta = texto(m.cuenta, 80)
    const recibido = texto(m.recibido_por, 80)
    if (tipo === 'depositado' && !cuenta) fail(400, 'Escribe la cuenta del depósito.')
    if (tipo === 'entregado' && !recibido) fail(400, 'Escribe quién recibió el efectivo.')
    const fila = {
      id: uid(),
      turno_id: turno.id,
      tipo,
      monto: valor,
      cuenta,
      referencia: texto(m.referencia, 80),
      entregado_por: texto(m.entregado_por, 80) || u.nombre,
      recibido_por: recibido,
      foto_id: typeof m.foto_id === 'string' ? m.foto_id : null,
      creado_en: t,
    }
    resumen.push(fila)
    sentencias.push(db.prepare(`INSERT INTO caja_movimientos (${Object.keys(fila).join(', ')}) VALUES (${Object.keys(fila).map(() => '?').join(', ')})`).bind(...Object.values(fila)))
  }
  const notas = textoLargo(body.notas, 2000)
  sentencias.push(db.prepare('UPDATE turnos SET cerrado_en = ?, cerrado_por = ?, notas = ? WHERE id = ? AND cerrado_en IS NULL').bind(t, u.id, notas, turno.id))
  // Al cerrar el turno de noche se cierra el día: después solo el dueño puede corregirlo.
  if (turno.tipo === 'noche') {
    sentencias.push(
      db
        .prepare('INSERT INTO dias (hostal_id, fecha, cerrado_en, cerrado_por) VALUES (?, ?, ?, ?) ON CONFLICT (hostal_id, fecha) DO UPDATE SET cerrado_en = excluded.cerrado_en, cerrado_por = excluded.cerrado_por')
        .bind(turno.hostal_id, turno.fecha, t, u.id),
    )
  }
  await db.batch([
    ...sentencias,
    historial(c, {
      hostal_id: turno.hostal_id,
      accion: `cerró turno de ${turno.tipo === 'dia' ? 'día' : 'noche'}`,
      entidad: 'turno',
      entidad_id: turno.id,
      detalle: { fecha: turno.fecha, notas, movimientos: resumen, sin_pago: sinPago.map((r) => r.habitacion) },
    }),
    subirVersion(db, turno.hostal_id),
  ])
  return c.json(await cargarTurno(db, turno.id))
})

/** El dueño puede reabrir un turno que se cerró por error. */
turnoRoutes.post('/turnos/:id/reabrir', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const turno = await cargarTurno(db, c.req.param('id'))
  if (turno.cerrado_en == null) fail(409, 'Ese turno está abierto.')
  await db.batch([
    db.prepare('DELETE FROM caja_movimientos WHERE turno_id = ?').bind(turno.id),
    db.prepare('UPDATE turnos SET cerrado_en = NULL, cerrado_por = NULL WHERE id = ?').bind(turno.id),
    ...(turno.tipo === 'noche' ? [db.prepare('UPDATE dias SET cerrado_en = NULL, cerrado_por = NULL WHERE hostal_id = ? AND fecha = ?').bind(turno.hostal_id, turno.fecha)] : []),
    historial(c, { hostal_id: turno.hostal_id, accion: 'reabrió turno', entidad: 'turno', entidad_id: turno.id, detalle: { turno } }),
    subirVersion(db, turno.hostal_id),
  ])
  return c.json(await cargarTurno(db, turno.id))
})

/** El dueño cierra un día a mano (por ejemplo, si nadie cerró el turno de noche). */
turnoRoutes.post('/hostales/:h/dias/:fecha/cerrar', async (c) => {
  soloDueno(c.get('usuario'))
  const h = await cargarHostal(c.env.DB, c.req.param('h'))
  const fecha = c.req.param('fecha')
  if (!esFecha(fecha)) fail(400, 'Fecha no válida.')
  const db = c.env.DB
  await db.batch([
    db
      .prepare('INSERT INTO dias (hostal_id, fecha, cerrado_en, cerrado_por) VALUES (?, ?, ?, ?) ON CONFLICT (hostal_id, fecha) DO UPDATE SET cerrado_en = excluded.cerrado_en, cerrado_por = excluded.cerrado_por')
      .bind(h.id, fecha, ahora(), c.get('usuario').id),
    historial(c, { hostal_id: h.id, accion: 'cerró el día', entidad: 'dia', entidad_id: fecha }),
    subirVersion(db, h.id),
  ])
  return c.json({ ok: true })
})

/** El dueño marca revisado el cuadre de caja de un día (con una nota). */
turnoRoutes.post('/hostales/:h/dias/:fecha/revisar', async (c) => {
  soloDueno(c.get('usuario'))
  const h = await cargarHostal(c.env.DB, c.req.param('h'))
  const fecha = c.req.param('fecha')
  if (!esFecha(fecha)) fail(400, 'Fecha no válida.')
  const body = await cuerpo<{ nota?: string; revisado?: boolean }>(c)
  const revisado = body.revisado !== false
  const nota = textoLargo(body.nota, 500)
  const db = c.env.DB
  await db.batch([
    db
      .prepare(
        'INSERT INTO dias (hostal_id, fecha, revisado_en, revisado_por, nota) VALUES (?, ?, ?, ?, ?) ON CONFLICT (hostal_id, fecha) DO UPDATE SET revisado_en = excluded.revisado_en, revisado_por = excluded.revisado_por, nota = excluded.nota',
      )
      .bind(h.id, fecha, revisado ? ahora() : null, revisado ? c.get('usuario').id : null, nota),
    historial(c, { hostal_id: h.id, accion: revisado ? 'revisó el cuadre' : 'quitó revisión del cuadre', entidad: 'dia', entidad_id: fecha, detalle: { nota } }),
  ])
  return c.json({ ok: true })
})
