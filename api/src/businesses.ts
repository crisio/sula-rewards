import { Hono } from 'hono'
import { PROGRAM_COLUMNS, type AppEnv, type Business, type Program } from './env'
import { ownedBusiness } from './access'
import { fail } from './errors'
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
  return c.json(results)
})

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
    if (meta.changes) return c.json(await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(id).first<Business>(), 201)
  }
  fail(409, 'No pudimos reservar el enlace de tu negocio. Prueba con otro nombre.')
})

businessRoutes.patch('/:id', async (c) => {
  const business = await ownedBusiness(c, c.req.param('id'))
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const name = body.name === undefined ? business.name : text(body.name, 'el nombre del negocio', { min: 2, max: 50 })
  const category = body.category === undefined ? business.category : body.category ? text(body.category, 'el giro', { max: 30 }) : null
  await c.env.DB.prepare('UPDATE businesses SET name = ?, category = ? WHERE id = ?').bind(name, category, business.id).run()
  return c.json({ ...business, name, category })
})

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
