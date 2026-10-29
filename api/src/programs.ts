import { Hono } from 'hono'
import type { AppEnv, Business, Card } from './env'
import { ownedProgram } from './access'
import { normalizeCardId } from './crypto'
import { createCard, parseCustomer } from './cards'
import { businessJson } from './logo'
import { fail } from './errors'
import { cents, color, formatCardId, headline, text } from './rules'

export const programRoutes = new Hono<AppEnv>()

programRoutes.get('/:id', async (c) => {
  const program = await ownedProgram(c, c.req.param('id'))
  const business = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(program.business_id).first<Business>()
  const stats = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cards, COALESCE(SUM(rewards), 0) AS rewards_pending, COALESCE(SUM(balance_cents), 0) AS balance_cents
     FROM cards WHERE program_id = ?`,
  )
    .bind(program.id)
    .first()
  return c.json({ ...program, business: businessJson(new URL(c.req.url).origin, business!), stats })
})

// Lo que se puede cambiar sin afectar las tarjetas que ya existen (la meta de sellos o el % no se tocan).
programRoutes.patch('/:id', async (c) => {
  const program = await ownedProgram(c, c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const next = {
    name: body.name === undefined ? program.name : text(body.name, 'el nombre del programa', { min: 2, max: 40 }),
    color: body.color === undefined ? program.color : color(body.color, program.type),
    reward: body.reward === undefined || !program.reward ? program.reward : text(body.reward, 'el premio', { max: 40 }),
    active: body.active === undefined ? program.active : body.active ? 1 : 0,
  }
  await c.env.DB.prepare('UPDATE programs SET name = ?, color = ?, reward = ?, active = ? WHERE id = ?')
    .bind(next.name, next.color, next.reward, next.active, program.id)
    .run()
  return c.json({ ...program, ...next })
})

// Clientes del programa: los más recientes primero, o buscando por nombre, teléfono o código.
programRoutes.get('/:id/cards', async (c) => {
  const program = await ownedProgram(c, c.req.param('id'))
  const q = (c.req.query('q') ?? '').trim().slice(0, 60)
  const digits = q.replace(/\D/g, '')
  let where = ''
  const params: unknown[] = [program.id]
  if (q) {
    where = 'AND (customer_name LIKE ?2 OR id = ?3' + (digits.length >= 3 ? ' OR phone LIKE ?4)' : ')')
    params.push(`%${q.replace(/[%_]/g, '')}%`, normalizeCardId(q))
    if (digits.length >= 3) params.push(`%${digits}%`)
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE program_id = ?1 ${where} ORDER BY updated_at DESC, rowid DESC LIMIT 50`,
  )
    .bind(...params)
    .all<Card>()
  return c.json(
    results.map((card) => ({
      id: card.id,
      code: formatCardId(card.id),
      customer_name: card.customer_name,
      phone: card.phone,
      headline: headline(program, card),
      rewards: card.rewards,
      updated_at: card.updated_at,
    })),
  )
})

// Alta desde caja. La gift card puede salir con saldo (lo que pagó el cliente).
programRoutes.post('/:id/cards', async (c) => {
  const program = await ownedProgram(c, c.req.param('id'))
  if (!program.active) fail(409, 'Este programa está pausado')
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const initialCents = program.type === 'giftcard' && body.initial_cents ? cents(body.initial_cents, 'El saldo inicial') : 0
  const card = await createCard(c.env, program, parseCustomer(body), { initialCents, byUser: c.var.user.id })
  return c.json({ id: card.id, code: formatCardId(card.id) }, 201)
})
