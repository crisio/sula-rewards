import { NOMBRE_PAGO, type Pago } from '../../shared/reglas'

const entero = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 140000 → «L 1,400»; 140050 → «L 1,400.50». */
export function lempiras(centavos: number | null | undefined) {
  if (centavos == null) return '—'
  const signo = centavos < 0 ? '−' : ''
  const abs = Math.abs(centavos)
  return `${signo}L ${abs % 100 === 0 ? entero.format(abs / 100) : decimal.format(abs / 100)}`
}

/** Para escribir en un campo: 140000 → «1,400». */
export function aTextoMonto(centavos: number | null | undefined) {
  if (centavos == null) return ''
  return centavos % 100 === 0 ? entero.format(centavos / 100) : decimal.format(centavos / 100)
}

/** «1,400.50» → 140050; vacío → null; inválido → undefined. */
export function leerMonto(texto: string): number | null | undefined {
  const v = texto.replace(/[Ll\s,]/g, '')
  if (!v) return null
  if (!/^\d+(\.\d{0,2})?$/.test(v)) return undefined
  return Math.round(Number(v) * 100)
}

export const porcentaje = (x: number) => `${Math.round(x * 1000) / 10}%`

export const nombrePago = (p: Pago | null | 'pendiente') => (p == null || p === 'pendiente' ? 'Sin pago' : NOMBRE_PAGO[p])

/** «1 h 20 min» */
export function duracion(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(min / 60)
  return h ? `${h} h ${min % 60} min` : `${min} min`
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
