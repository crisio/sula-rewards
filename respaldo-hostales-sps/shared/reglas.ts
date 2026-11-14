// Tipos y reglas del negocio que usan la API y la app.

import type { TipoTurno } from './fechas'

export const TIPOS = ['Sencilla', 'Doble', 'Triple'] as const
export type TipoHabitacion = (typeof TIPOS)[number]

export const PAGOS = ['efectivo', 'tarjeta', 'transferencia', 'credito', 'otros'] as const
export type Pago = (typeof PAGOS)[number]

export const NOMBRE_PAGO: Record<Pago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  otros: 'Otros',
}

export const NOMBRE_TURNO: Record<TipoTurno, string> = { dia: 'Día', noche: 'Noche' }

/** Los precios incluyen ISV 15 % y tasa de turismo 4 %. */
export const FACTOR_IMPUESTOS = 1.19

export type Rol = 'dueno' | 'recepcion'

export interface Habitacion {
  numero: string
  tipo: TipoHabitacion
  orden: number
  activa: boolean
  limpia_en: number | null
}

export interface Hostal {
  id: string
  nombre: string
  orden: number
  precio_sencilla: number
  precio_doble: number
  precio_triple: number
  precio_hora: number | null
  descuento_larga: number
  hora_dia: string
  hora_noche: string
  hora_salida: string
  version: number
  habitaciones: Habitacion[]
}

export interface Registro {
  id: string
  hostal_id: string
  fecha: string
  habitacion: string
  modo: 'noche' | 'hora'
  huesped: string
  empresa_id: string | null
  empresa: string | null
  tipo: TipoHabitacion
  precio: number | null
  pago: Pago | null
  larga: boolean
  estadia_id: string
  nota: string
  foto_id: string | null
  entrada_en: number
  salida_en: number | null
  cobro_turno_id: string | null
  factura_id: string | null
  origen: 'recepcion' | 'copiado' | 'importado' | 'dueno'
  creado_por: string | null
  creado_por_nombre?: string | null
  creado_en: number
  editado_en: number | null
}

export interface MovimientoCaja {
  id: string
  turno_id: string
  tipo: 'entregado' | 'depositado'
  monto: number
  cuenta: string
  referencia: string
  entregado_por: string
  recibido_por: string
  foto_id: string | null
  creado_en: number
}

export interface Turno {
  id: string
  hostal_id: string
  fecha: string
  tipo: TipoTurno
  usuario_id: string | null
  usuario: string | null
  abierto_en: number
  cerrado_en: number | null
  cerrado_por: string | null
  cerrado_por_nombre?: string | null
  notas: string
  movimientos?: MovimientoCaja[]
}

export interface Tarea {
  id: string
  hostal_id: string
  texto: string
  usuario_id: string | null
  usuario: string | null
  turno: TipoTurno | null
  fecha: string | null
  creada_en: number
  hecha_en: number | null
  hecha_por: string | null
  hecha_por_nombre: string | null
  nota: string
}

export interface Empresa {
  id: string
  nombre: string
  alias: string[]
  activa: boolean
  noches?: number
}

export interface Factura {
  id: string
  hostal_id: string
  empresa_id: string
  empresa: string
  numero: string
  desde: string
  hasta: string
  noches: number
  monto: number
  creada_en: number
  pagada_en: number | null
}

export interface Ajustes {
  recepcion_ve_totales: boolean
  recepcion_ve_mes: boolean
  bloqueo_minutos: number
  cuentas_banco: string[]
}

export const AJUSTES_INICIALES: Ajustes = {
  recepcion_ve_totales: true,
  recepcion_ve_mes: false,
  bloqueo_minutos: 10,
  cuentas_banco: [],
}

export function precioLista(h: Pick<Hostal, 'precio_sencilla' | 'precio_doble' | 'precio_triple'>, tipo: TipoHabitacion) {
  return tipo === 'Triple' ? h.precio_triple : tipo === 'Doble' ? h.precio_doble : h.precio_sencilla
}

/** Quita acentos, espacios de más y mayúsculas: para comparar nombres de huéspedes y empresas. */
export function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nombre con mayúscula inicial en cada palabra: «juan  PEREZ» → «Juan Perez». */
export function nombrePropio(texto: string) {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])([a-záéíóúñü])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

/** Lo que escriben en papel o en el CSV («T/C», «Tarjeta», «crédito», «Trans.») → forma de pago. */
export function leerPago(valor: string): Pago | null | undefined {
  const v = normalizar(valor)
  if (!v || v === 'pendiente' || v === 'sin pago') return null
  if (/^(efectivo|efec|ef|cash|contado)$/.test(v)) return 'efectivo'
  if (/^(t c|tc|tarjeta|tarj|pos|t c d|tarjeta de credito|tarjeta de debito|tdc|tdd|visa|mastercard)$/.test(v)) return 'tarjeta'
  if (/^(transferencia|transf|trans|deposito|tr)$/.test(v)) return 'transferencia'
  if (/^(credito|cred|cr|cxc)$/.test(v)) return 'credito'
  if (/^(otros|otro|cortesia)$/.test(v)) return 'otros'
  return undefined
}

export function leerTipo(valor: string): TipoHabitacion | 'hora' | undefined {
  const v = normalizar(valor)
  if (/^(s|sencilla|sen|simple|individual)$/.test(v)) return 'Sencilla'
  if (/^(d|doble|dob)$/.test(v)) return 'Doble'
  if (/^(t|triple|tri)$/.test(v)) return 'Triple'
  if (/^(hora|por hora|horas|h|rato)$/.test(v)) return 'hora'
  return undefined
}

/** «L 1,400.00», «1400», «1,400» → 140000 centavos. */
export function leerPrecio(valor: string): number | null | undefined {
  const v = valor.replace(/[Ll]\.?|\s/g, '').replace(/,/g, '')
  if (!v) return null
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined
  return Math.round(Number(v) * 100)
}

/** «2026-10-01», «01/10/2026», «1/10/26», «1-10-2026» → '2026-10-01' (día/mes/año, como en Honduras). */
export function leerFecha(valor: string): string | undefined {
  const v = valor.trim()
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return armarFecha(+m[1], +m[2], +m[3])
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/)
  if (m) return armarFecha(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return undefined
}

function armarFecha(a: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  const f = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const fecha = new Date(f + 'T00:00:00Z')
  return fecha.toISOString().slice(0, 10) === f ? f : undefined
}
