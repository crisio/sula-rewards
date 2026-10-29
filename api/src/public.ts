import { Hono } from 'hono'
import type { AppEnv, Business, Card, Program } from './env'
import { normalizeCardId } from './crypto'
import { fail } from './errors'
import { appleConfigured, buildPkpass, pkpassResponse } from './apple'
import { cardView, createCard, loadProgramAndBusiness, parseCustomer } from './cards'
import { googleConfigured, saveUrl } from './google'
import { programIcon, stampStrip } from './images'
import { blobBytes, logoUrl } from './logo'
import { todayInHonduras } from './promotions'

// Sin sesión: la página del negocio para unirse, la tarjeta del cliente y sus pases de Wallet.
// Quien tiene el enlace de la tarjeta (o su QR) la ve: el id es aleatorio (60 bits) y no trae teléfono ni correo.
export const publicRoutes = new Hono<AppEnv>()

async function findCard(c: { env: AppEnv['Bindings'] }, rawId: string) {
  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(normalizeCardId(rawId)).first<Card>()
  if (!card) fail(404, 'No encontramos esa tarjeta')
  return { card, ...(await loadProgramAndBusiness(c.env, card.program_id)) }
}

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin

// Página /unete/<slug> (y el negocio en «Explorar» de la app): sus programas abiertos (las gift cards se venden en caja)
// y sus promociones vigentes.
publicRoutes.get('/b/:slug', async (c) => {
  const business = await c.env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(c.req.param('slug')).first<Business>()
  if (!business) fail(404, 'No encontramos ese negocio')
  const [{ results: programs }, { results: promotions }] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, type, name, color, reward, stamps_goal, points_per_100, reward_points, cashback_bp FROM programs
       WHERE business_id = ? AND active = 1 AND type != 'giftcard' ORDER BY created_at`,
    ).bind(business.id),
    c.env.DB.prepare(
      `SELECT id, title, body, ends_on, created_at FROM promotions
       WHERE business_id = ? AND active = 1 AND (ends_on IS NULL OR ends_on >= ?) ORDER BY created_at DESC`,
    ).bind(business.id, todayInHonduras()),
  ])
  return c.json({
    name: business.name,
    slug: business.slug,
    city: business.city,
    category: business.category,
    logo_url: logoUrl(origin(c), business),
    programs,
    promotions,
  })
})

// «Explorar» en la app: las promociones vigentes de todos los negocios, las más nuevas primero.
publicRoutes.get('/promotions', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.body, p.ends_on, p.created_at, b.id AS business_id, b.name, b.slug, b.category, b.city, b.logo_version
     FROM promotions p JOIN businesses b ON b.id = p.business_id
     WHERE p.active = 1 AND (p.ends_on IS NULL OR p.ends_on >= ?) ORDER BY p.created_at DESC LIMIT 50`,
  )
    .bind(todayInHonduras())
    .all<{ id: string; title: string; body: string | null; ends_on: string | null; created_at: string; business_id: string; name: string; slug: string; category: string | null; city: string; logo_version: number | null }>()
  return c.json(
    results.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      ends_on: p.ends_on,
      created_at: p.created_at,
      business: { name: p.name, slug: p.slug, category: p.category, city: p.city, logo_url: logoUrl(origin(c), { id: p.business_id, logo_version: p.logo_version }) },
    })),
  )
})

// «Explorar»: los negocios con programas abiertos, los más nuevos primero.
publicRoutes.get('/businesses', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.name, b.slug, b.category, b.city, b.logo_version, COUNT(p.id) AS programs
     FROM businesses b JOIN programs p ON p.business_id = b.id AND p.active = 1 AND p.type != 'giftcard'
     GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100`,
  ).all<{ id: string; name: string; slug: string; category: string | null; city: string; logo_version: number | null; programs: number }>()
  return c.json(results.map(({ id, logo_version, ...b }) => ({ ...b, logo_url: logoUrl(origin(c), { id, logo_version }) })))
})

// El logo del negocio (la URL lleva ?v=, así que se puede guardar en caché para siempre).
publicRoutes.get('/logos/:file', async (c) => {
  const id = c.req.param('file').replace(/\.png$/, '')
  const row = await c.env.DB.prepare('SELECT original FROM business_logos WHERE business_id = ?').bind(id).first<{ original: unknown }>()
  if (!row) fail(404, 'Este negocio no tiene logo')
  return new Response(blobBytes(row.original), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
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
  return c.json(cardView(c.env, new URL(c.req.url).origin, card, program, business))
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
