// Fechas y horas en Honduras (UTC−6, sin horario de verano). Todo se calcula con la hora real del servidor.

export const HN_OFFSET_MS = -6 * 3600_000
const DIA_MS = 86_400_000

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export type TipoTurno = 'dia' | 'noche'

/** Fecha ('AAAA-MM-DD') y minutos del día en Honduras para un instante. */
export function partesHN(ms: number) {
  const d = new Date(ms + HN_OFFSET_MS)
  return { fecha: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

export function aMinutos(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function esHora(valor: unknown): valor is string {
  return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor)
}

export function esFecha(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const d = new Date(valor + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

export function esMes(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor)
}

export function sumarDias(fecha: string, n: number) {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Días entre dos fechas (b − a). */
export function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DIA_MS)
}

/** Instante (ms) de una hora local de Honduras en una fecha. */
export function instanteHN(fecha: string, hhmm: string) {
  return Date.parse(fecha + 'T00:00:00Z') + aMinutos(hhmm) * 60_000 - HN_OFFSET_MS
}

/**
 * Día de trabajo: cambia cuando empieza el turno de día. Quien llega a las 2 a.m. duerme «la noche de ayer»
 * y sale a las 11:30; quien llega a las 8 a.m. ya es la noche de hoy.
 */
export function fechaTrabajo(ms: number, horaDia: string) {
  const p = partesHN(ms)
  return p.minutos < aMinutos(horaDia) ? sumarDias(p.fecha, -1) : p.fecha
}

/** El turno que corresponde a un instante: día [hora_dia, hora_noche) y noche [hora_noche, hora_dia del día siguiente). */
export function turnoDeHora(ms: number, horaDia: string, horaNoche: string): { fecha: string; tipo: TipoTurno } {
  const p = partesHN(ms)
  const dia = aMinutos(horaDia)
  const noche = aMinutos(horaNoche)
  if (p.minutos >= dia && p.minutos < noche) return { fecha: p.fecha, tipo: 'dia' }
  return { fecha: p.minutos < dia ? sumarDias(p.fecha, -1) : p.fecha, tipo: 'noche' }
}

export function siguienteTurno(t: { fecha: string; tipo: TipoTurno }): { fecha: string; tipo: TipoTurno } {
  return t.tipo === 'dia' ? { fecha: t.fecha, tipo: 'noche' } : { fecha: sumarDias(t.fecha, 1), tipo: 'dia' }
}

export function diasDelMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

export function fechasDelMes(mes: string) {
  return Array.from({ length: diasDelMes(mes) }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
}

export function sumarMeses(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function nombreMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

/** «sábado 14 nov» */
export function fechaCorta(fecha: string, conDia = true) {
  const d = new Date(fecha + 'T00:00:00Z')
  const base = `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`
  return conDia ? `${DIAS[d.getUTCDay()]} ${base}` : base
}

/** «viernes 13 de noviembre de 2026» */
export function fechaLarga(fecha: string) {
  const d = new Date(fecha + 'T00:00:00Z')
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/** «3:05 p.m.» en hora de Honduras. */
export function horaHN(ms: number) {
  const { minutos } = partesHN(ms)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

/** «20:28» en hora de Honduras. */
export function hora24HN(ms: number) {
  const { minutos } = partesHN(ms)
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/** «07:00» → «7:00 a.m.» */
export function horaBonita(hhmm: string) {
  const min = aMinutos(hhmm)
  const h = Math.floor(min / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

/**
 * Agrupa fechas en rangos: ['2026-10-01', …, '2026-10-05', '2026-10-09', …] → «1–5, 9–31 oct».
 * Si cruzan de mes: «28 sep–3 oct, 9 oct».
 */
export function rangosFechas(fechas: string[]) {
  const unicas = [...new Set(fechas)].sort()
  if (!unicas.length) return ''
  const rangos: [string, string][] = []
  for (const f of unicas) {
    const ultimo = rangos.at(-1)
    if (ultimo && sumarDias(ultimo[1], 1) === f) ultimo[1] = f
    else rangos.push([f, f])
  }
  const dia = (f: string) => String(Number(f.slice(8, 10)))
  const mes = (f: string) => MESES_CORTOS[Number(f.slice(5, 7)) - 1]
  const mismoMes = unicas[0].slice(0, 7) === unicas.at(-1)!.slice(0, 7)
  if (mismoMes) {
    return rangos.map(([a, b]) => (a === b ? dia(a) : `${dia(a)}–${dia(b)}`)).join(', ') + ' ' + mes(unicas[0])
  }
  return rangos
    .map(([a, b]) => {
      if (a === b) return `${dia(a)} ${mes(a)}`
      return a.slice(0, 7) === b.slice(0, 7) ? `${dia(a)}–${dia(b)} ${mes(a)}` : `${dia(a)} ${mes(a)}–${dia(b)} ${mes(b)}`
    })
    .join(', ')
}
