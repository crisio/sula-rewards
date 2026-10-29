import type { Card, Program, ProgramType } from './env'
import { fail } from './errors'

// Las reglas de cada tipo de programa: qué se configura, cuánto se gana y cómo se ve en la tarjeta.

export const PROGRAM_TYPES: ProgramType[] = ['sellos', 'puntos', 'cashback', 'giftcard']

export const DEFAULT_COLOR: Record<ProgramType, string> = {
  sellos: '#4f3fe0',
  puntos: '#f2820f',
  cashback: '#16a34a',
  giftcard: '#2e2b38',
}

/** Tope del saldo de una tarjeta y de cada compra: L 1,000,000. */
export const MAX_CENTS = 100_000_000

/** L 1,234.50 */
export const lempiras = (cents: number) =>
  `L ${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** 500 puntos básicos → «5», 250 → «2.5». */
export const percent = (bp: number) => String(Math.round(bp) / 100)

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export function text(value: unknown, field: string, { min = 1, max = 60 } = {}) {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (s.length < min) fail(400, `Escribe ${field}`)
  if (s.length > max) fail(400, `${field[0].toUpperCase()}${field.slice(1)} es muy largo (máximo ${max} caracteres)`)
  return s
}

export function int(value: unknown, field: string, min: number, max: number) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) fail(400, `${field} debe ser un número entero entre ${min.toLocaleString('en-US')} y ${max.toLocaleString('en-US')}`)
  return n
}

/** Monto en centavos (entero), entre 1 centavo y L 1,000,000. */
export const cents = (value: unknown, field = 'El monto') => int(value, field, 1, MAX_CENTS)

/** Celular o teléfono de Honduras (8 dígitos, con o sin +504) → +504XXXXXXXX. */
export function normalizePhone(value: unknown) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('504')) digits = digits.slice(3)
  if (!/^[23789]\d{7}$/.test(digits)) fail(400, 'Escribe un número de Honduras de 8 dígitos')
  return `+504${digits}`
}

export function color(value: unknown, type: ProgramType) {
  if (value === undefined || value === null || value === '') return DEFAULT_COLOR[type]
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(400, 'El color debe ser como #4f3fe0')
  return value.toLowerCase()
}

export type ProgramFields = Pick<Program, 'type' | 'name' | 'color' | 'reward' | 'stamps_goal' | 'points_per_100' | 'reward_points' | 'cashback_bp'>

/** Valida lo que manda el panel al crear un programa. Cada tipo exige solo sus campos. */
export function parseProgram(body: Record<string, unknown>): ProgramFields {
  const type = body.type as ProgramType
  if (!PROGRAM_TYPES.includes(type)) fail(400, 'Elige el tipo de programa: sellos, puntos, cashback o gift card')
  const base = { type, name: text(body.name, 'el nombre del programa', { min: 2, max: 40 }), color: color(body.color, type) }
  const none = { reward: null, stamps_goal: null, points_per_100: null, reward_points: null, cashback_bp: null }
  switch (type) {
    case 'sellos':
      return { ...base, ...none, stamps_goal: int(body.stamps_goal, 'Los sellos para el premio', 2, 20), reward: text(body.reward, 'el premio', { max: 40 }) }
    case 'puntos':
      return {
        ...base,
        ...none,
        points_per_100: int(body.points_per_100, 'Los puntos por cada L 100', 1, 1000),
        reward_points: int(body.reward_points, 'Los puntos del premio', 1, 1_000_000),
        reward: text(body.reward, 'el premio', { max: 40 }),
      }
    case 'cashback':
      return { ...base, ...none, cashback_bp: int(body.cashback_bp, 'El cashback (en centésimas de %)', 10, 5000) }
    case 'giftcard':
      return { ...base, ...none }
  }
}

export const pointsFor = (program: Program, purchaseCents: number) => Math.floor((purchaseCents * (program.points_per_100 ?? 0)) / 10_000)
export const cashbackFor = (program: Program, purchaseCents: number) => Math.floor((purchaseCents * (program.cashback_bp ?? 0)) / 10_000)

/** Lo grande de la tarjeta, como en el Wallet: «SELLOS 7/8», «PUNTOS 1,250», «CASHBACK 5% L 12.40». */
export function headline(program: Program, card: Pick<Card, 'stamps' | 'points' | 'balance_cents'>) {
  switch (program.type) {
    case 'sellos':
      return { label: 'SELLOS', value: `${card.stamps}/${program.stamps_goal}` }
    case 'puntos':
      return { label: 'PUNTOS', value: card.points.toLocaleString('en-US') }
    case 'cashback':
      return { label: `CASHBACK ${percent(program.cashback_bp ?? 0)}%`, value: lempiras(card.balance_cents) }
    case 'giftcard':
      return { label: 'GIFT CARD', value: lempiras(card.balance_cents) }
  }
}

/** Una línea para el cliente: cuánto le falta o qué ya puede canjear. */
export function status(program: Program, card: Pick<Card, 'stamps' | 'rewards' | 'points' | 'balance_cents'>) {
  switch (program.type) {
    case 'sellos': {
      if (card.rewards > 0) return `¡Ganaste ${card.rewards === 1 ? 'un premio' : `${card.rewards} premios`}! ${program.reward}`
      const left = (program.stamps_goal ?? 0) - card.stamps
      return `Te ${left === 1 ? 'falta' : 'faltan'} ${plural(left, 'sello', 'sellos')} para: ${program.reward}`
    }
    case 'puntos': {
      const left = (program.reward_points ?? 0) - card.points
      return left <= 0 ? `¡Ya puedes canjear! ${program.reward}` : `Te ${left === 1 ? 'falta' : 'faltan'} ${plural(left, 'punto', 'puntos')} para: ${program.reward}`
    }
    case 'cashback':
      return `Ganas ${percent(program.cashback_bp ?? 0)}% de cada compra para usarlo en tu próxima visita`
    case 'giftcard':
      return card.balance_cents > 0 ? 'Úsala en caja: muestra el código' : 'Sin saldo'
  }
}

/** El id de la tarjeta en grupos de 4 para dictarlo o escribirlo en caja: K7M2-Q9XD-3F8A. */
export const formatCardId = (id: string) => id.match(/.{1,4}/g)!.join('-')
