// Cálculos que se ven en recepción y en el panel del dueño: estado de cada habitación, resumen del mes,
// cuadre de caja y antigüedad de los créditos.

import { diasDelMes, diasEntre, instanteHN, rangosFechas } from './fechas'
import { FACTOR_IMPUESTOS, normalizar, type Habitacion, type Hostal, type Pago, type Registro, type Turno } from './reglas'

export type Estado = 'libre' | 'ocupada' | 'hora' | 'sale' | 'limpieza'

export interface EstadoHabitacion {
  estado: Estado
  registro?: Registro
  /** La noche de hoy ya está vendida (el huésped salió antes): no se puede vender otra vez. */
  nocheVendida?: boolean
}

/**
 * Estado de una habitación en el tablero:
 * - por hora: hay un alquiler por hora abierto;
 * - ocupada: tiene huésped esta noche;
 * - sale: el huésped de anoche todavía no llega a la hora de salida (11:30) y no se ha copiado a hoy;
 * - limpieza: alguien salió y nadie ha marcado la habitación como lista;
 * - libre.
 */
export function estadoHabitacion(
  hab: Pick<Habitacion, 'numero' | 'limpia_en'>,
  datos: { fecha: string; hoy: Registro[]; ayer: Registro[] },
  hostal: Pick<Hostal, 'hora_salida'>,
  ahora: number,
): EstadoHabitacion {
  const deEsta = (r: Registro) => r.habitacion === hab.numero
  const hoy = datos.hoy.filter(deEsta)
  const ayer = datos.ayer.filter(deEsta)

  const hora = [...hoy, ...ayer].find((r) => r.modo === 'hora' && r.salida_en == null)
  if (hora) return { estado: 'hora', registro: hora }

  const noche = hoy.find((r) => r.modo === 'noche')
  if (noche && noche.salida_en == null) return { estado: 'ocupada', registro: noche }

  const salidaHoy = instanteHN(datos.fecha, hostal.hora_salida)
  const anoche = ayer.find((r) => r.modo === 'noche')
  if (anoche && !noche && anoche.salida_en == null && ahora < salidaHoy) return { estado: 'sale', registro: anoche }

  // La salida más reciente: la de anoche (a las 11:30 o cuando marcaron que salió), una salida anticipada de hoy
  // o el cierre de un alquiler por hora.
  const salidas: { en: number; registro: Registro }[] = []
  if (anoche && !(noche && noche.estadia_id === anoche.estadia_id)) {
    salidas.push({ en: anoche.salida_en ?? salidaHoy, registro: anoche })
  }
  if (noche?.salida_en != null) salidas.push({ en: noche.salida_en, registro: noche })
  for (const r of [...hoy, ...ayer]) if (r.modo === 'hora' && r.salida_en != null) salidas.push({ en: r.salida_en, registro: r })
  const ultima = salidas.filter((s) => s.en <= ahora).sort((a, b) => b.en - a.en)[0]

  const nocheVendida = Boolean(noche)
  if (ultima && (hab.limpia_en == null || hab.limpia_en < ultima.en)) return { estado: 'limpieza', registro: ultima.registro, nocheVendida }
  return { estado: 'libre', nocheVendida }
}

/** Color estable para cada huésped (el mismo nombre, el mismo color en el calendario). */
export function colorHuesped(nombre: string) {
  const n = normalizar(nombre)
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 62% 52%)`
}

export interface ResumenMes {
  dias: number
  capacidad: number
  capacidadHastaHoy: number
  noches: number
  nochesHastaHoy: number
  ocupacion: number
  ocupacionHastaHoy: number
  porDia: Record<string, number>
  diaMasLleno: { fecha: string; noches: number } | null
  huespedes: number
  porHabitacion: { numero: string; noches: number; ingresos: number }[]
  porHuesped: { nombre: string; empresas: string[]; noches: number; horas: number; total: number; fechas: string[]; rango: string; habitaciones: string[] }[]
  ingresos: {
    vendido: number
    cobrado: number
    credito: number
    pendiente: number
    porPago: { pago: Pago | 'pendiente'; monto: number; registros: number }[]
    promedioNoche: number
    base: number
    isv: number
    turismo: number
  }
  horas: { cantidad: number; total: number }
}

export function resumenMes(registros: Registro[], habitaciones: string[], mes: string, hoy: string): ResumenMes {
  const dias = diasDelMes(mes)
  const enMes = registros.filter((r) => r.fecha.startsWith(mes))
  const noches = enMes.filter((r) => r.modo === 'noche')
  const horas = enMes.filter((r) => r.modo === 'hora')

  const mesActual = hoy.startsWith(mes)
  const diasHastaHoy = mes < hoy.slice(0, 7) ? dias : mesActual ? Number(hoy.slice(8, 10)) : 0
  const capacidad = habitaciones.length * dias
  const capacidadHastaHoy = habitaciones.length * diasHastaHoy
  const nochesHastaHoy = noches.filter((r) => r.fecha <= hoy).length

  const porDia: Record<string, number> = {}
  for (const r of noches) porDia[r.fecha] = (porDia[r.fecha] ?? 0) + 1
  let diaMasLleno: ResumenMes['diaMasLleno'] = null
  for (const [fecha, n] of Object.entries(porDia).sort()) if (!diaMasLleno || n > diaMasLleno.noches) diaMasLleno = { fecha, noches: n }

  const porHab = new Map(habitaciones.map((n) => [n, { numero: n, noches: 0, ingresos: 0 }]))
  for (const r of enMes) {
    const h = porHab.get(r.habitacion) ?? { numero: r.habitacion, noches: 0, ingresos: 0 }
    if (r.modo === 'noche') h.noches++
    h.ingresos += r.precio ?? 0
    porHab.set(r.habitacion, h)
  }

  const huespedes = new Map<string, ResumenMes['porHuesped'][number]>()
  for (const r of enMes) {
    const clave = normalizar(r.huesped)
    // «Por hora» sin nombre no es un huésped: se cuenta aparte en horas.
    if (!clave || (r.modo === 'hora' && clave === 'por hora')) continue
    const h = huespedes.get(clave) ?? { nombre: r.huesped, empresas: [], noches: 0, horas: 0, total: 0, fechas: [], rango: '', habitaciones: [] }
    if (r.modo === 'noche') {
      h.noches++
      h.fechas.push(r.fecha)
    } else h.horas++
    h.total += r.precio ?? 0
    if (r.empresa && !h.empresas.includes(r.empresa)) h.empresas.push(r.empresa)
    if (!h.habitaciones.includes(r.habitacion)) h.habitaciones.push(r.habitacion)
    huespedes.set(clave, h)
  }
  const porHuesped = [...huespedes.values()]
    .map((h) => ({ ...h, fechas: [...new Set(h.fechas)].sort(), rango: rangosFechas(h.fechas) }))
    .sort((a, b) => b.noches - a.noches || b.total - a.total || a.nombre.localeCompare(b.nombre))

  const pagos = new Map<Pago | 'pendiente', { pago: Pago | 'pendiente'; monto: number; registros: number }>()
  let vendido = 0
  for (const r of enMes) {
    const p = r.pago ?? 'pendiente'
    const fila = pagos.get(p) ?? { pago: p, monto: 0, registros: 0 }
    fila.monto += r.precio ?? 0
    fila.registros++
    pagos.set(p, fila)
    vendido += r.precio ?? 0
  }
  const monto = (p: Pago | 'pendiente') => pagos.get(p)?.monto ?? 0
  const nochesConPrecio = noches.filter((r) => r.precio != null)
  const base = vendido / FACTOR_IMPUESTOS

  return {
    dias,
    capacidad,
    capacidadHastaHoy,
    noches: noches.length,
    nochesHastaHoy,
    ocupacion: capacidad ? noches.length / capacidad : 0,
    ocupacionHastaHoy: capacidadHastaHoy ? nochesHastaHoy / capacidadHastaHoy : 0,
    porDia,
    diaMasLleno,
    huespedes: huespedes.size,
    porHabitacion: [...porHab.values()],
    porHuesped,
    ingresos: {
      vendido,
      cobrado: monto('efectivo') + monto('tarjeta') + monto('transferencia') + monto('otros'),
      credito: monto('credito'),
      pendiente: monto('pendiente'),
      porPago: [...pagos.values()].sort((a, b) => b.monto - a.monto),
      promedioNoche: nochesConPrecio.length ? Math.round(nochesConPrecio.reduce((s, r) => s + (r.precio ?? 0), 0) / nochesConPrecio.length) : 0,
      base: Math.round(base),
      isv: Math.round(base * 0.15),
      turismo: Math.round(base * 0.04),
    },
    horas: { cantidad: horas.length, total: horas.reduce((s, r) => s + (r.precio ?? 0), 0) },
  }
}

export interface CuadreTurno {
  turno: Turno
  esperado: number
  declarado: number
  diferencia: number
}

export interface Cuadre {
  fecha: string
  esperado: number
  declarado: number
  diferencia: number
  porPago: Partial<Record<Pago | 'pendiente', number>>
  turnos: CuadreTurno[]
  cerrado: boolean
  sinPago: number
}

/**
 * Cuadre de caja de un día: el efectivo que suman las habitaciones contra lo que recepción declaró
 * (entregado + depositado) al cerrar los turnos.
 */
export function cuadreDia(fecha: string, registros: Registro[], turnos: Turno[]): Cuadre {
  const delDia = registros.filter((r) => r.fecha === fecha)
  const deTurnos = turnos.filter((t) => t.fecha === fecha)
  const porPago: Cuadre['porPago'] = {}
  for (const r of delDia) {
    const p = r.pago ?? 'pendiente'
    porPago[p] = (porPago[p] ?? 0) + (r.precio ?? 0)
  }
  const efectivoDe = (rs: Registro[]) => rs.filter((r) => r.pago === 'efectivo').reduce((s, r) => s + (r.precio ?? 0), 0)
  const declaradoDe = (t: Turno) => (t.movimientos ?? []).reduce((s, m) => s + m.monto, 0)
  const cuadreTurnos = deTurnos
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'dia' ? -1 : 1))
    .map((t) => {
      const esperado = efectivoDe(registros.filter((r) => r.cobro_turno_id === t.id))
      const declarado = declaradoDe(t)
      return { turno: t, esperado, declarado, diferencia: declarado - esperado }
    })
  const esperado = efectivoDe(delDia)
  const declarado = deTurnos.reduce((s, t) => s + declaradoDe(t), 0)
  return {
    fecha,
    esperado,
    declarado,
    diferencia: declarado - esperado,
    porPago,
    turnos: cuadreTurnos,
    cerrado: deTurnos.some((t) => t.tipo === 'noche' && t.cerrado_en != null),
    sinPago: delDia.filter((r) => r.pago == null && !(r.modo === 'hora' && r.salida_en == null)).length,
  }
}

export type NivelCredito = 'ok' | 'aviso' | 'rojo'

/** Aviso para facturar a los 15 días de la primera noche; alerta roja a los 30. */
export function nivelCredito(desde: string, hoy: string): NivelCredito {
  const d = diasEntre(desde, hoy)
  return d >= 30 ? 'rojo' : d >= 15 ? 'aviso' : 'ok'
}
