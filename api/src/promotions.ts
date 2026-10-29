import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv, Business } from './env'
import { fail } from './errors'
import { text } from './rules'

// Promociones: cada negocio publica las suyas («2×1 en baleadas los martes») y todos los clientes las ven en
// «Explorar» de la app mientras estén activas y no hayan vencido.

export const MAX_ACTIVE_PROMOTIONS = 5

export interface Promotion {
  id: string
  business_id: string
  title: string
  body: string | null
  ends_on: string | null
  active: number
  created_at: string
}

/** Hoy en Honduras (UTC−6, sin horario de verano): AAAA-MM-DD. */
export const todayInHonduras = (now = Date.now()) => new Date(now - 6 * 60 * 60_000).toISOString().slice(0, 10)

function endsOn(value: unknown) {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(400, 'La fecha de fin debe ser como 2026-12-31')
  }
  if (value < todayInHonduras()) fail(400, 'La fecha de fin ya pasó')
  return value
}

const bodyText = (value: unknown) => (value ? text(value, 'el detalle', { max: 280 }) : null)

async function activeCount(c: Context<AppEnv>, businessId: string) {
  return (
    (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM promotions WHERE business_id = ? AND active = 1 AND (ends_on IS NULL OR ends_on >= ?)')
      .bind(businessId, todayInHonduras())
      .first<number>('n')) ?? 0
  )
}

export async function listPromotions(c: Context<AppEnv>, business: Business) {
  const { results } = await c.env.DB.prepare('SELECT * FROM promotions WHERE business_id = ? ORDER BY created_at DESC').bind(business.id).all<Promotion>()
  return results
}

export async function createPromotion(c: Context<AppEnv>, business: Business) {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const promotion: Promotion = {
    id: crypto.randomUUID(),
    business_id: business.id,
    title: text(body.title, 'el título de la promoción', { min: 3, max: 60 }),
    body: bodyText(body.body),
    ends_on: endsOn(body.ends_on),
    active: 1,
    created_at: new Date().toISOString(),
  }
  if ((await activeCount(c, business.id)) >= MAX_ACTIVE_PROMOTIONS) fail(409, `Puedes tener hasta ${MAX_ACTIVE_PROMOTIONS} promociones activas`)
  await c.env.DB.prepare('INSERT INTO promotions (id, business_id, title, body, ends_on, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
    .bind(promotion.id, promotion.business_id, promotion.title, promotion.body, promotion.ends_on, promotion.created_at)
    .run()
  return promotion
}

async function ownedPromotion(c: Context<AppEnv>, id: string) {
  const promotion = await c.env.DB.prepare(
    `SELECT p.* FROM promotions p JOIN businesses b ON b.id = p.business_id WHERE p.id = ? AND b.owner_id = ?`,
  )
    .bind(id, c.var.user.id)
    .first<Promotion>()
  if (!promotion) fail(404, 'No encontramos esa promoción')
  return promotion
}

export const promotionRoutes = new Hono<AppEnv>()

// Cambiar el texto, la fecha o pausarla. Solo cambia lo que viene.
promotionRoutes.patch('/:id', async (c) => {
  const promotion = await ownedPromotion(c, c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const next = {
    title: body.title === undefined ? promotion.title : text(body.title, 'el título de la promoción', { min: 3, max: 60 }),
    body: body.body === undefined ? promotion.body : bodyText(body.body),
    ends_on: body.ends_on === undefined ? promotion.ends_on : endsOn(body.ends_on),
    active: body.active === undefined ? promotion.active : body.active ? 1 : 0,
  }
  if (next.active && !promotion.active && (await activeCount(c, promotion.business_id)) >= MAX_ACTIVE_PROMOTIONS) {
    fail(409, `Puedes tener hasta ${MAX_ACTIVE_PROMOTIONS} promociones activas`)
  }
  await c.env.DB.prepare('UPDATE promotions SET title = ?, body = ?, ends_on = ?, active = ? WHERE id = ?')
    .bind(next.title, next.body, next.ends_on, next.active, promotion.id)
    .run()
  return c.json({ ...promotion, ...next })
})

promotionRoutes.delete('/:id', async (c) => {
  const promotion = await ownedPromotion(c, c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM promotions WHERE id = ?').bind(promotion.id).run()
  return c.json({ ok: true })
})
