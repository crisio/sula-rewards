import { Hono } from 'hono'
import type { Context } from 'hono'
import { PROGRAM_COLUMNS, type AppEnv, type Business, type Card, type Program } from './env'
import { ownedBusiness } from './access'
import { fail } from './errors'
import { googleConfigured, syncGoogle } from './google'
import { businessJson, processLogo, toBlob } from './logo'
import { createPromotion, listPromotions } from './promotions'
import { parseProgram, text } from './rules'

const MAX_BUSINESSES = 5
const MAX_PROGRAMS = 10

/** «Café Guamilito #2» → «cafe-guamilito-2», para la página pública /unete/<slug>. */
export const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'negocio'

export const businessRoutes = new Hono<AppEnv>()

businessRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, (SELECT COUNT(*) FROM programs p WHERE p.business_id = b.id) AS programs
     FROM businesses b WHERE b.owner_id = ? ORDER BY b.created_at`,
  )
    .bind(c.var.user.id)
    .all<Business & { programs: number }>()
  return c.json(results.map((b) => businessJson(origin(c), b)))
})

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin

businessRoutes.post('/', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const name = text(body.name, 'el nombre del negocio', { min: 2, max: 50 })
  const category = body.category ? text(body.category, 'el giro', { max: 30 }) : null
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM businesses WHERE owner_id = ?').bind(c.var.user.id).first<number>('n')
  if ((count ?? 0) >= MAX_BUSINESSES) fail(409, `Puedes tener hasta ${MAX_BUSINESSES} negocios`)

  const id = crypto.randomUUID()
  const base = slugify(name)
  // Si el slug ya existe (otro «Café Central»), se le agrega un número.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.floor(100 + Math.random() * 900)}`
    const { meta } = await c.env.DB.prepare(
      `INSERT INTO businesses (id, owner_id, name, slug, category) VALUES (?, ?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING`,
    )
      .bind(id, c.var.user.id, name, slug, category)
      .run()
    if (meta.changes) return c.json(businessJson(origin(c), (await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(id).first<Business>())!), 201)
  }
  fail(409, 'No pudimos reservar el enlace de tu negocio. Prueba con otro nombre.')
})

businessRoutes.patch('/:id', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const name = body.name === undefined ? business.name : text(body.name, 'el nombre del negocio', { min: 2, max: 50 })
  const category = body.category === undefined ? business.category : body.category ? text(body.category, 'el giro', { max: 30 }) : null
  await c.env.DB.prepare('UPDATE businesses SET name = ?, category = ? WHERE id = ?').bind(name, category, business.id).run()
  return c.json(businessJson(origin(c), { ...business, name, category }))
})

/**
 * Después de cambiar el logo: los pases de Apple Wallet lo bajan la próxima vez que el iPhone pregunte (cambia su
 * updated_at) y los de Google Wallet se actualizan ya.
 */
async function refreshPasses(c: Context<AppEnv>, business: Business) {
  await c.env.DB.prepare('UPDATE cards SET updated_at = ? WHERE program_id IN (SELECT id FROM programs WHERE business_id = ?)')
    .bind(Date.now(), business.id)
    .run()
  if (!googleConfigured(c.env)) return
  const { results } = await c.env.DB.prepare(
    `SELECT k.* FROM cards k JOIN programs p ON p.id = k.program_id WHERE p.business_id = ? AND k.google_saved = 1 LIMIT 200`,
  )
    .bind(business.id)
    .all<Card>()
  const programs = new Map<string, Program | null>()
  c.executionCtx.waitUntil(
    (async () => {
      for (const card of results) {
        if (!programs.has(card.program_id)) {
          programs.set(card.program_id, await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(card.program_id).first<Program>())
        }
        const program = programs.get(card.program_id)
        if (program) await syncGoogle(c.env, origin(c), card, program, business)
      }
    })(),
  )
}

// El logo: un PNG cuadrado de 360×360 (la app y el panel lo recortan). Se guarda en la base con sus versiones del pase.
businessRoutes.put('/:id/logo', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  const logo = processLogo(new Uint8Array(await c.req.arrayBuffer()))
  const version = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO business_logos (business_id, original, pass_1x, pass_2x, pass_3x) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (business_id) DO UPDATE SET original = ?2, pass_1x = ?3, pass_2x = ?4, pass_3x = ?5`,
    ).bind(business.id, toBlob(logo.original), toBlob(logo.pass1x), toBlob(logo.pass2x), toBlob(logo.pass3x)),
    c.env.DB.prepare('UPDATE businesses SET logo_version = ? WHERE id = ?').bind(version, business.id),
  ])
  const updated = { ...business, logo_version: version }
  await refreshPasses(c, updated)
  return c.json(businessJson(origin(c), updated))
})

businessRoutes.delete('/:id/logo', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM business_logos WHERE business_id = ?').bind(business.id),
    c.env.DB.prepare('UPDATE businesses SET logo_version = NULL WHERE id = ?').bind(business.id),
  ])
  const updated = { ...business, logo_version: null }
  await refreshPasses(c, updated)
  return c.json(businessJson(origin(c), updated))
})

// Promociones del negocio (se cambian y se borran en /promotions/:id).
businessRoutes.get('/:id/promotions', async (c) => c.json(await listPromotions(c, await ownedBusiness(c, c.req.param('id')))))

businessRoutes.post('/:id/promotions', async (c) => c.json(await createPromotion(c, await ownedBusiness(c, c.req.param('id'))), 201))

// Programas del negocio, con cuántos clientes tiene cada uno.
businessRoutes.get('/:id/programs', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT ${PROGRAM_COLUMNS}, (SELECT COUNT(*) FROM cards k WHERE k.program_id = programs.id) AS cards
     FROM programs WHERE business_id = ? ORDER BY created_at`,
  )
    .bind(business.id)
    .all<Program & { cards: number }>()
  return c.json(results)
})

businessRoutes.post('/:id/programs', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  const fields = parseProgram(await c.req.json<Record<string, unknown>>().catch(() => ({})))
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM programs WHERE business_id = ?').bind(business.id).first<number>('n')
  if ((count ?? 0) >= MAX_PROGRAMS) fail(409, `Puedes tener hasta ${MAX_PROGRAMS} programas por negocio`)

  const program: Program = { id: crypto.randomUUID(), business_id: business.id, ...fields, active: 1, created_at: new Date().toISOString() }
  await c.env.DB.prepare(
    `INSERT INTO programs (id, business_id, type, name, color, reward, stamps_goal, points_per_100, reward_points, cashback_bp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      program.id,
      program.business_id,
      program.type,
      program.name,
      program.color,
      program.reward,
      program.stamps_goal,
      program.points_per_100,
      program.reward_points,
      program.cashback_bp,
      program.created_at,
    )
    .run()
  return c.json(program, 201)
})
