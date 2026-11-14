import { Hono } from 'hono'
import { aMinutos, esHora } from '../../shared/fechas'
import { TIPOS, type TipoHabitacion } from '../../shared/reglas'
import type { AppEnv } from './env'
import { cargarAjustes, cargarHostal, cargarHostales, cambios, historial, soloDueno, subirVersion } from './db'
import { ahora, cuerpo, esPin, fail, hashPin, monto, randomSalt, texto, uid } from './util'

export const configRoutes = new Hono<AppEnv>()

const SELECT_USUARIOS = "SELECT id, nombre, rol, hostal_id, activo, bloqueado_hasta, creado_en FROM usuarios ORDER BY rol, nombre"

configRoutes.get('/config', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const [hostales, ajustes, usuarios] = await Promise.all([cargarHostales(db), cargarAjustes(db), db.prepare(SELECT_USUARIOS).all()])
  return c.json({ hostales, ajustes, usuarios: usuarios.results.map((u) => ({ ...u, activo: Boolean(u.activo) })) })
})

configRoutes.patch('/ajustes', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const body = await cuerpo<Record<string, unknown>>(c)
  const antes = await cargarAjustes(db)
  const nuevos = { ...antes }
  if (body.recepcion_ve_totales !== undefined) nuevos.recepcion_ve_totales = Boolean(body.recepcion_ve_totales)
  if (body.recepcion_ve_mes !== undefined) nuevos.recepcion_ve_mes = Boolean(body.recepcion_ve_mes)
  if (body.bloqueo_minutos !== undefined) {
    const m = Number(body.bloqueo_minutos)
    if (!Number.isInteger(m) || m < 0 || m > 240) fail(400, 'El bloqueo debe ser de 0 a 240 minutos (0 = nunca).')
    nuevos.bloqueo_minutos = m
  }
  if (body.cuentas_banco !== undefined) {
    if (!Array.isArray(body.cuentas_banco)) fail(400, 'Las cuentas deben ser una lista.')
    nuevos.cuentas_banco = [...new Set(body.cuentas_banco.map((x) => texto(x, 80)).filter(Boolean))].slice(0, 20)
  }
  const diff = cambios(antes as unknown as Record<string, unknown>, nuevos as unknown as Record<string, unknown>)
  await db.batch([
    ...Object.entries(nuevos).map(([k, v]) => db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').bind(k, JSON.stringify(v))),
    historial(c, { hostal_id: null, accion: 'cambió ajustes', entidad: 'ajustes', detalle: diff }),
  ])
  return c.json(nuevos)
})

/** Nombre, precios de lista, tarifa por hora sugerida, descuento de estadía larga y horarios de un hostal. */
configRoutes.patch('/hostales/:h', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const h = await cargarHostal(db, c.req.param('h'))
  const body = await cuerpo<Record<string, unknown>>(c)
  const nuevo = {
    nombre: body.nombre === undefined ? h.nombre : texto(body.nombre, 60) || fail(400, 'Escribe el nombre del hostal.'),
    precio_sencilla: body.precio_sencilla === undefined ? h.precio_sencilla : monto(body.precio_sencilla, 'El precio de Sencilla'),
    precio_doble: body.precio_doble === undefined ? h.precio_doble : monto(body.precio_doble, 'El precio de Doble'),
    precio_triple: body.precio_triple === undefined ? h.precio_triple : monto(body.precio_triple, 'El precio de Triple'),
    precio_hora: body.precio_hora === undefined ? h.precio_hora : body.precio_hora === null ? null : monto(body.precio_hora, 'El precio por hora'),
    descuento_larga: body.descuento_larga === undefined ? h.descuento_larga : monto(body.descuento_larga, 'El descuento'),
    hora_dia: body.hora_dia === undefined ? h.hora_dia : esHora(body.hora_dia) ? body.hora_dia : fail(400, 'La hora del turno de día no es válida.'),
    hora_noche: body.hora_noche === undefined ? h.hora_noche : esHora(body.hora_noche) ? body.hora_noche : fail(400, 'La hora del turno de noche no es válida.'),
    hora_salida: body.hora_salida === undefined ? h.hora_salida : esHora(body.hora_salida) ? body.hora_salida : fail(400, 'La hora de salida no es válida.'),
  }
  if (aMinutos(nuevo.hora_dia) >= aMinutos(nuevo.hora_noche)) fail(400, 'El turno de día debe empezar antes que el de noche.')
  if (aMinutos(nuevo.hora_salida) < aMinutos(nuevo.hora_dia)) fail(400, 'La hora de salida debe ser después de que empieza el turno de día.')
  const diff = cambios(h as unknown as Record<string, unknown>, nuevo)
  const cols = Object.keys(nuevo)
  await db.batch([
    db.prepare(`UPDATE hostales SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(nuevo), h.id),
    historial(c, { hostal_id: h.id, accion: 'cambió configuración del hostal', entidad: 'hostal', entidad_id: h.id, detalle: diff }),
    subirVersion(db, h.id),
  ])
  return c.json(await cargarHostal(db, h.id))
})

/** Tipo de cada habitación (el que se sugiere al registrar), habitaciones nuevas y desactivadas. */
configRoutes.put('/hostales/:h/habitaciones', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const h = await cargarHostal(db, c.req.param('h'))
  const body = await cuerpo<{ habitaciones?: unknown }>(c)
  if (!Array.isArray(body.habitaciones) || !body.habitaciones.length) fail(400, 'Envía la lista de habitaciones.')
  const vistas = new Set<string>()
  const sentencias: D1PreparedStatement[] = []
  body.habitaciones.slice(0, 100).forEach((x: Record<string, unknown>, i: number) => {
    const numero = texto(x.numero, 10).toUpperCase()
    if (!numero) fail(400, 'Cada habitación necesita su número.')
    if (vistas.has(numero)) fail(400, `La habitación ${numero} está repetida.`)
    vistas.add(numero)
    const tipo = TIPOS.includes(x.tipo as TipoHabitacion) ? (x.tipo as TipoHabitacion) : 'Sencilla'
    const activa = x.activa === false ? 0 : 1
    sentencias.push(
      db
        .prepare('INSERT INTO habitaciones (hostal_id, numero, tipo, orden, activa) VALUES (?, ?, ?, ?, ?) ON CONFLICT (hostal_id, numero) DO UPDATE SET tipo = excluded.tipo, orden = excluded.orden, activa = excluded.activa')
        .bind(h.id, numero, tipo, i + 1, activa),
    )
  })
  for (const hab of h.habitaciones) {
    if (!vistas.has(hab.numero)) sentencias.push(db.prepare('UPDATE habitaciones SET activa = 0 WHERE hostal_id = ? AND numero = ?').bind(h.id, hab.numero))
  }
  await db.batch([
    ...sentencias,
    historial(c, { hostal_id: h.id, accion: 'cambió habitaciones', entidad: 'hostal', entidad_id: h.id, detalle: { antes: h.habitaciones, despues: body.habitaciones } }),
    subirVersion(db, h.id),
  ])
  return c.json(await cargarHostal(db, h.id))
})

configRoutes.post('/usuarios', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const body = await cuerpo<{ nombre?: string; hostal_id?: string; pin?: string }>(c)
  const nombre = texto(body.nombre, 40)
  if (!nombre) fail(400, 'Escribe el nombre.')
  if (!esPin(body.pin)) fail(400, 'El PIN debe tener de 4 a 8 números.')
  if (typeof body.hostal_id !== 'string') fail(400, 'Elige el hostal.')
  await cargarHostal(db, body.hostal_id)
  const repetido = await db.prepare("SELECT 1 FROM usuarios WHERE hostal_id = ? AND activo = 1 AND lower(nombre) = lower(?)").bind(body.hostal_id, nombre).first()
  if (repetido) fail(409, 'Ya hay alguien con ese nombre en ese hostal.')
  const id = uid()
  const salt = randomSalt()
  await db.batch([
    db.prepare("INSERT INTO usuarios (id, nombre, rol, hostal_id, pin_hash, pin_salt, creado_en) VALUES (?, ?, 'recepcion', ?, ?, ?, ?)").bind(id, nombre, body.hostal_id, await hashPin(body.pin, salt), salt, ahora()),
    historial(c, { hostal_id: body.hostal_id, accion: 'agregó recepcionista', entidad: 'usuario', entidad_id: id, detalle: { nombre } }),
  ])
  return c.json({ id, nombre, rol: 'recepcion', hostal_id: body.hostal_id, activo: true }, 201)
})

configRoutes.patch('/usuarios/:id', async (c) => {
  soloDueno(c.get('usuario'))
  const db = c.env.DB
  const id = c.req.param('id')
  const u = await db.prepare('SELECT id, nombre, rol, hostal_id, activo FROM usuarios WHERE id = ?').bind(id).first<{ id: string; nombre: string; rol: string; hostal_id: string | null; activo: number }>()
  if (!u) fail(404, 'Ese usuario no existe.')
  const body = await cuerpo<{ nombre?: string; hostal_id?: string; pin?: string; activo?: boolean }>(c)
  const sentencias: D1PreparedStatement[] = []
  const detalle: Record<string, unknown> = {}
  const nombre = body.nombre === undefined ? u.nombre : texto(body.nombre, 40)
  if (!nombre) fail(400, 'Escribe el nombre.')
  let hostal = u.hostal_id
  if (body.hostal_id !== undefined && u.rol === 'recepcion') {
    await cargarHostal(db, body.hostal_id)
    hostal = body.hostal_id
  }
  const activo = body.activo === undefined ? u.activo : body.activo ? 1 : 0
  if (u.rol === 'dueno' && !activo) fail(400, 'No se puede desactivar al dueño.')
  if (nombre !== u.nombre) detalle.nombre = { antes: u.nombre, despues: nombre }
  if (hostal !== u.hostal_id) detalle.hostal = { antes: u.hostal_id, despues: hostal }
  if (activo !== u.activo) detalle.activo = Boolean(activo)
  sentencias.push(db.prepare('UPDATE usuarios SET nombre = ?, hostal_id = ?, activo = ? WHERE id = ?').bind(nombre, hostal, activo, id))
  if (body.pin !== undefined) {
    if (!esPin(body.pin)) fail(400, 'El PIN debe tener de 4 a 8 números.')
    const salt = randomSalt()
    sentencias.push(db.prepare('UPDATE usuarios SET pin_hash = ?, pin_salt = ?, intentos = 0, bloqueado_hasta = NULL WHERE id = ?').bind(await hashPin(body.pin, salt), salt, id))
    detalle.pin = 'cambiado'
  }
  // Al desactivar o cambiar el PIN se cierran sus sesiones abiertas.
  if (!activo || body.pin !== undefined || hostal !== u.hostal_id) {
    if (id !== c.get('usuario').id) sentencias.push(db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id))
  }
  await db.batch([...sentencias, historial(c, { hostal_id: hostal, accion: 'editó usuario', entidad: 'usuario', entidad_id: id, detalle })])
  return c.json({ id, nombre, rol: u.rol, hostal_id: hostal, activo: Boolean(activo) })
})
