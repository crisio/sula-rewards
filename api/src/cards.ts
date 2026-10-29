import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv, Business, Card, Env, Program, ProgramType } from './env'
import { ownedCard } from './access'
import { normalizeEmail } from './auth'
import { randomCardId, randomToken } from './crypto'
import { fail } from './errors'
import { appleConfigured } from './apple'
import { googleConfigured, syncGoogle } from './google'
import { cashbackFor, cents, formatCardId, headline, int, lempiras, MAX_CENTS, normalizePhone, pointsFor, status, text } from './rules'

export interface CustomerInput {
  customer_name: string
  phone: string
  email: string | null
}

export function parseCustomer(body: Record<string, unknown>): CustomerInput {
  return {
    customer_name: text(body.customer_name, 'el nombre', { min: 2, max: 60 }),
    phone: normalizePhone(body.phone),
    email: body.email ? normalizeEmail(body.email) : null,
  }
}

/** Crea la tarjeta de un cliente en un programa (desde caja o desde la página pública /unete). */
export async function createCard(env: Env, program: Program, customer: CustomerInput, opts: { initialCents?: number; byUser?: string } = {}) {
  const now = Date.now()
  const card: Card = {
    id: randomCardId(),
    program_id: program.id,
    ...customer,
    stamps: 0,
    rewards: 0,
    points: 0,
    balance_cents: opts.initialCents ?? 0,
    apple_token: randomToken(),
    google_saved: 0,
    created_at: new Date(now).toISOString(),
    updated_at: now,
  }
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cards (id, program_id, customer_name, phone, email, balance_cents, apple_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(card.id, card.program_id, card.customer_name, card.phone, card.email, card.balance_cents, card.apple_token, card.created_at, card.updated_at),
      env.DB.prepare(`INSERT INTO movements (id, card_id, kind, cents, by_user) VALUES (?, ?, 'alta', ?, ?)`).bind(
        crypto.randomUUID(),
        card.id,
        card.balance_cents,
        opts.byUser ?? null,
      ),
    ])
  } catch (err) {
    if (/UNIQUE constraint failed: cards\.program_id/.test(String(err))) fail(409, 'Ese número ya tiene tarjeta en este programa')
    throw err
  }
  return card
}

/** Lo que ve cualquiera con el enlace de la tarjeta (el cliente). Sin teléfono ni correo. */
export function cardView(env: Env, card: Card, program: Program, business: Business) {
  return {
    id: card.id,
    code: formatCardId(card.id),
    customer_name: card.customer_name,
    stamps: card.stamps,
    rewards: card.rewards,
    points: card.points,
    balance_cents: card.balance_cents,
    created_at: card.created_at,
    updated_at: card.updated_at,
    headline: headline(program, card),
    status: status(program, card),
    program: {
      id: program.id,
      type: program.type,
      name: program.name,
      color: program.color,
      reward: program.reward,
      stamps_goal: program.stamps_goal,
      points_per_100: program.points_per_100,
      reward_points: program.reward_points,
      cashback_bp: program.cashback_bp,
    },
    business: { name: business.name, slug: business.slug, city: business.city, category: business.category },
    wallet: { apple: appleConfigured(env), google: googleConfigured(env) },
  }
}

export async function loadProgramAndBusiness(env: Env, programId: string) {
  const program = await env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(programId).first<Program>()
  const business = program && (await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(program.business_id).first<Business>())
  if (!program || !business) fail(404, 'No encontramos esa tarjeta')
  return { program, business }
}

/** Después de cada cambio: la tarjeta guardada en Google Wallet se actualiza sola (Apple pregunta por su cuenta). */
export function afterCardChange(c: Context<AppEnv>, card: Card, program: Program, business: Business) {
  if (card.google_saved && googleConfigured(c.env)) {
    c.executionCtx.waitUntil(syncGoogle(c.env, new URL(c.req.url).origin, card, program, business))
  }
}

type Action = 'sello' | 'compra' | 'canje' | 'uso' | 'recarga'

const ACTIONS: Record<ProgramType, Action[]> = {
  sellos: ['sello', 'canje'],
  puntos: ['compra', 'canje'],
  cashback: ['compra', 'uso'],
  giftcard: ['recarga', 'uso'],
}

/**
 * Un movimiento en SQL. Parámetros de las dos sentencias: ?1 id del movimiento, ?2 tipo, ?3 monto de la compra,
 * ?4 cajero, ?5 tarjeta, ?6 cantidad, ?7 tope o costo, ?8 ahora. `where` se evalúa sobre la tarjeta tal como está.
 */
interface Op {
  where: string
  delta: { stamps?: string; rewards?: string; points?: string; cents?: string }
  set: string
  n: number
  k: number
  purchase: number | null
  error: string
}

function plan(program: Program, action: Action, body: Record<string, unknown>): Op {
  const none = { n: 0, k: 0, purchase: null, error: '' }
  switch (action) {
    case 'sello':
      // Al completar la meta, los sellos vuelven a empezar y se suma un premio por canjear.
      return {
        ...none,
        where: '1',
        delta: { stamps: '?6', rewards: '(stamps + ?6) / ?7' },
        set: 'rewards = rewards + (stamps + ?6) / ?7, stamps = (stamps + ?6) % ?7',
        n: body.count === undefined ? 1 : int(body.count, 'Los sellos', 1, 10),
        k: program.stamps_goal!,
      }
    case 'canje':
      return program.type === 'sellos'
        ? { ...none, where: 'rewards >= 1', delta: { rewards: '-1' }, set: 'rewards = rewards - 1', error: 'Esta tarjeta todavía no tiene premios para canjear' }
        : {
            ...none,
            where: 'points >= ?7',
            delta: { points: '-?7' },
            set: 'points = points - ?7',
            k: program.reward_points!,
            error: `Le faltan puntos: el premio cuesta ${program.reward_points!.toLocaleString('en-US')}`,
          }
    case 'compra': {
      const purchase = cents(body.amount_cents, 'El monto de la compra')
      return program.type === 'puntos'
        ? { ...none, where: '1', delta: { points: '?6' }, set: 'points = points + ?6', n: pointsFor(program, purchase), purchase }
        : {
            where: 'balance_cents + ?6 <= ?7',
            delta: { cents: '?6' },
            set: 'balance_cents = balance_cents + ?6',
            n: cashbackFor(program, purchase),
            k: MAX_CENTS,
            purchase,
            error: `El saldo no puede pasar de ${lempiras(MAX_CENTS)}`,
          }
    }
    case 'uso':
      return {
        ...none,
        where: 'balance_cents >= ?6',
        delta: { cents: '-?6' },
        set: 'balance_cents = balance_cents - ?6',
        n: cents(body.amount_cents),
        error: 'No le alcanza el saldo',
      }
    case 'recarga':
      return {
        ...none,
        where: 'balance_cents + ?6 <= ?7',
        delta: { cents: '?6' },
        set: 'balance_cents = balance_cents + ?6',
        n: cents(body.amount_cents, 'La recarga'),
        k: MAX_CENTS,
        error: `El saldo no puede pasar de ${lempiras(MAX_CENTS)}`,
      }
  }
}

/** D1 exige tantos valores como el parámetro numerado más alto de cada sentencia. */
const usedParams = (sql: string, params: unknown[]) => params.slice(0, Math.max(...[...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]))))

/** D1 manda los números de JavaScript como REAL: sin esto, (stamps + 1) / 8 da 0.125 premios. */
const asIntegers = (sql: string) => sql.replace(/\?([67])\b/g, 'CAST(?$1 AS INTEGER)')

export const cardRoutes = new Hono<AppEnv>()

// La tarjeta vista desde caja: con teléfono, correo y los últimos movimientos.
cardRoutes.get('/:id', async (c) => {
  const card = await ownedCard(c, c.req.param('id'))
  const { program, business } = await loadProgramAndBusiness(c.env, card.program_id)
  const { results: movements } = await c.env.DB.prepare(
    `SELECT id, kind, stamps, rewards, points, cents, purchase_cents, created_at FROM movements
     WHERE card_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30`,
  )
    .bind(card.id)
    .all()
  return c.json({ ...cardView(c.env, card, program, business), phone: card.phone, email: card.email, movements })
})

// Sumar un sello, registrar una compra, canjear, usar saldo o recargar. El movimiento y el cambio van juntos.
cardRoutes.post('/:id/actions', async (c) => {
  const card = await ownedCard(c, c.req.param('id'))
  const { program, business } = await loadProgramAndBusiness(c.env, card.program_id)
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const action = body.action as Action
  if (!ACTIONS[program.type].includes(action)) fail(400, 'Esa acción no aplica a este programa')
  if (!program.active) fail(409, 'Este programa está pausado')

  const op = plan(program, action, body)
  const d = op.delta
  const insert = asIntegers(`INSERT INTO movements (id, card_id, kind, stamps, rewards, points, cents, purchase_cents, by_user)
    SELECT ?1, id, ?2, ${d.stamps ?? 0}, ${d.rewards ?? 0}, ${d.points ?? 0}, ${d.cents ?? 0}, ?3, ?4 FROM cards WHERE id = ?5 AND ${op.where}`)
  // Solo cambia la tarjeta si el movimiento entró (changes() = 1): las condiciones se revisan una vez, sin carreras.
  const update = asIntegers(`UPDATE cards SET ${op.set}, updated_at = ?8 WHERE id = ?5 AND changes() = 1 RETURNING *`)
  const params = [crypto.randomUUID(), action, op.purchase, c.var.user.id, card.id, op.n, op.k, Date.now()]
  const [, updated] = await c.env.DB.batch<Card>([
    c.env.DB.prepare(insert).bind(...usedParams(insert, params)),
    c.env.DB.prepare(update).bind(...usedParams(update, params)),
  ])
  const next = updated.results[0]
  if (!next) fail(409, op.error)

  afterCardChange(c, next, program, business)
  return c.json({
    ...cardView(c.env, next, program, business),
    phone: next.phone,
    email: next.email,
    result: {
      kind: action,
      stamps: action === 'sello' ? op.n : 0,
      rewards: next.rewards - card.rewards,
      points: next.points - card.points,
      cents: next.balance_cents - card.balance_cents,
    },
  })
})
