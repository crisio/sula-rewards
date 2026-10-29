import type { ProgramType } from './types'

export const TYPE_LABEL: Record<ProgramType, string> = {
  sellos: 'Sellos',
  puntos: 'Puntos',
  cashback: 'Cashback',
  giftcard: 'Gift card',
}

export const DEFAULT_COLOR: Record<ProgramType, string> = {
  sellos: '#4f3fe0',
  puntos: '#f2820f',
  cashback: '#16a34a',
  giftcard: '#2e2b38',
}

/** L 1,234.50 */
export const lempiras = (cents: number) =>
  `L ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Lo que escribe el cajero («1,250.5», «L 80») → centavos, o null si no es un monto. */
export function parseLempiras(value: string) {
  const clean = value.replace(/[L\s,]/gi, '')
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null
  const cents = Math.round(Number(clean) * 100)
  return cents > 0 ? cents : null
}

/** +50498765432 → 9876-5432 */
export const formatPhone = (phone: string) => phone.replace(/^\+504/, '').replace(/^(\d{4})(\d{4})$/, '$1-$2')

/** Enlace de WhatsApp a ese número (Honduras), con el mensaje ya escrito. */
export const whatsappUrl = (phone: string, message: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`

const dateTime = new Intl.DateTimeFormat('es-HN', {
  timeZone: 'America/Tegucigalpa',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

/** Hoy en Honduras (UTC−6, sin horario de verano): AAAA-MM-DD, como lo cuenta la API. */
export const todayInHonduras = () => new Date(Date.now() - 6 * 60 * 60_000).toISOString().slice(0, 10)

// Las fechas sin hora (AAAA-MM-DD) se leen y se escriben en UTC para que no se corran un día.
const day = new Intl.DateTimeFormat('es-HN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const dayYear = new Intl.DateTimeFormat('es-HN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** 2026-12-31 → «31 dic» (con el año si no es este). */
export const formatDay = (date: string) =>
  (date.slice(0, 4) === todayInHonduras().slice(0, 4) ? day : dayYear).format(new Date(`${date}T00:00:00Z`))

/** URL absoluta de una ruta de la app (respeta /sula-rewards/ en GitHub Pages). */
export const appUrl = (path: string) => new URL(import.meta.env.BASE_URL.replace(/\/?$/, '/') + path.replace(/^\//, ''), location.origin).toString()
