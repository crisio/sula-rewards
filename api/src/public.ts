import { Hono } from 'hono'
import type { AppEnv, Business, Card, Program } from './env'
import { normalizeCardId } from './crypto'
import { fail } from './errors'
import { appleConfigured, buildPkpass, pkpassResponse } from './apple'
import { cardView, createCard, loadProgramAndBusiness, parseCustomer } from './cards'
import { googleConfigured, saveUrl } from './google'
import { programIcon, stampStrip } from './images'

// Sin sesión: la página del negocio para unirse, la tarjeta del cliente y sus pases de Wallet.
// Quien tiene el enlace de la tarjeta (o su QR) la ve: el id es aleatorio (60 bits) y no trae teléfono ni correo.
export const publicRoutes = new Hono<AppEnv>()

async function findCard(c: { env: AppEnv['Bindings'] }, rawId: string) {
  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(normalizeCardId(rawId)).first<Card>()
  if (!card) fail(404, 'No encontramos esa tarjeta')
  return { card, ...(await loadProgramAndBusiness(c.env, card.program_id)) }
}

// Página /unete/<slug>: el negocio y sus programas abiertos (las gift cards se venden en caja).
publicRoutes.get('/b/:slug', async (c) => {
  const business = await c.env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(c.req.param('slug')).first<Business>()
  if (!business) fail(404, 'No encontramos ese negocio')
  const { results } = await c.env.DB.prepare(
    `SELECT id, type, name, color, reward, stamps_goal, points_per_100, reward_points, cashback_bp FROM programs
     WHERE business_id = ? AND active = 1 AND type != 'giftcard' ORDER BY created_at`,
  )
    .bind(business.id)
    .all()
  return c.json({ name: business.name, slug: business.slug, city: business.city, category: business.category, programs: results })
})

publicRoutes.post('/b/:slug/join', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const program = await c.env.DB.prepare(
    `SELECT p.* FROM programs p JOIN businesses b ON b.id = p.business_id
     WHERE b.slug = ? AND p.id = ? AND p.active = 1 AND p.type != 'giftcard'`,
  )
    .bind(c.req.param('slug'), String(body.program_id ?? ''))
    .first<Program>()
  if (!program) fail(404, 'Ese programa ya no está disponible')
  try {
    const card = await createCard(c.env, program, parseCustomer(body))
    return c.json({ id: card.id }, 201)
  } catch (err) {
    // Nadie ve la tarjeta de otro con solo saber su número: la recupera en caja.
    if ((err as { status?: number }).status === 409) fail(409, 'Ese número ya tiene tarjeta aquí. Pídela en caja con tu número.')
    throw err
  }
})

publicRoutes.get('/cards/:id', async (c) => {
  const { card, program, business } = await findCard(c, c.req.param('id'))
  return c.json(cardView(c.env, card, program, business))
})

publicRoutes.get('/cards/:id/apple', async (c) => {
  if (!appleConfigured(c.env)) fail(501, 'Apple Wallet todavía no está configurado')
  const { card, program, business } = await findCard(c, c.req.param('id'))
  return pkpassResponse(await buildPkpass(c.env, new URL(c.req.url).origin, card, program, business), card)
})

publicRoutes.get('/cards/:id/google', async (c) => {
  if (!googleConfigured(c.env)) fail(501, 'Google Wallet todavía no está configurado')
  const { card, program, business } = await findCard(c, c.req.param('id'))
  // Desde aquí cada cambio se manda a Google (ver afterCardChange).
  if (!card.google_saved) await c.env.DB.prepare('UPDATE cards SET google_saved = 1 WHERE id = ?').bind(card.id).run()
  return c.json({ url: await saveUrl(c.env, new URL(c.req.url).origin, card, program, business) })
})

// Imagen de los sellos para Google Wallet (Apple la lleva dentro del .pkpass).
publicRoutes.get('/cards/:id/strip.png', async (c) => {
  const { card, program } = await findCard(c, c.req.param('id'))
  if (program.type !== 'sellos') fail(404, 'Esta tarjeta no tiene sellos')
  return new Response(stampStrip(program.color, program.stamps_goal!, card.stamps, 2), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
  })
})

publicRoutes.get('/programs/:id/icon.png', async (c) => {
  const program = await c.env.DB.prepare('SELECT color FROM programs WHERE id = ?').bind(c.req.param('id')).first<{ color: string }>()
  if (!program) fail(404, 'No encontramos ese programa')
  return new Response(programIcon(program.color, 192), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  })
})
