import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv, Business, Card, Program } from './env'
import { normalizeCardId } from './crypto'
import { cardView, createCard } from './cards'
import { fail } from './errors'

// La cartera del cliente en la app: sus tarjetas de todos los negocios. Una tarjeta entra a su cuenta si la abre con su
// código o su QR (el código es el mismo secreto que su enlace), si se une desde la app, o si el negocio la dio de alta
// con el mismo correo con el que entra. El celular no sirve para reclamarla: nadie lo ha verificado.

export const walletRoutes = new Hono<AppEnv>()

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin

/** Programa y negocio de cada tarjeta, pidiendo cada uno una sola vez. */
async function withPrograms(c: Context<AppEnv>, cards: Card[]) {
  const programs = new Map<string, { program: Program; business: Business } | null>()
  for (const card of cards) {
    if (programs.has(card.program_id)) continue
    const program = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(card.program_id).first<Program>()
    const business = program && (await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(program.business_id).first<Business>())
    programs.set(card.program_id, program && business ? { program, business } : null)
  }
  return cards.flatMap((card) => {
    const found = programs.get(card.program_id)
    return found ? [cardView(c.env, origin(c), card, found.program, found.business)] : []
  })
}

async function myCard(c: Context<AppEnv>, rawId: string) {
  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').bind(normalizeCardId(rawId), c.var.user.id).first<Card>()
  if (!card) fail(404, 'No encontramos esa tarjeta en tu cuenta')
  return card
}

// Mis tarjetas. Antes, se suman las que el negocio dio de alta con mi correo.
walletRoutes.get('/', async (c) => {
  await c.env.DB.prepare('UPDATE cards SET user_id = ? WHERE user_id IS NULL AND email = ?').bind(c.var.user.id, c.var.user.email).run()
  const { results } = await c.env.DB.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY updated_at DESC').bind(c.var.user.id).all<Card>()
  return c.json(await withPrograms(c, results))
})

// Una tarjeta con su historial.
walletRoutes.get('/cards/:id', async (c) => {
  const card = await myCard(c, c.req.param('id'))
  const [view] = await withPrograms(c, [card])
  if (!view) fail(404, 'Esa tarjeta ya no existe')
  const { results: movements } = await c.env.DB.prepare(
    `SELECT id, kind, stamps, rewards, points, cents, purchase_cents, created_at FROM movements
     WHERE card_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 30`,
  )
    .bind(card.id)
    .all()
  return c.json({ ...view, movements })
})

// Agregar una tarjeta con su código (escrito o del QR, o un enlace /tarjeta/<código>).
walletRoutes.post('/cards', async (c) => {
  const body = await c.req.json<{ code?: unknown }>().catch(() => ({}) as { code?: unknown })
  const raw = String(body.code ?? '')
  const code = normalizeCardId(raw.includes('/tarjeta/') ? raw.split('/tarjeta/')[1].split(/[/?#]/)[0] : raw)
  if (!/^[0-9A-Z]{12}$/.test(code)) fail(400, 'El código de la tarjeta tiene 12 letras y números, como K7M2-Q9XD-3F8A')
  const card = await c.env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(code).first<Card>()
  if (!card) fail(404, 'No encontramos esa tarjeta. Revisa el código.')
  if (card.user_id && card.user_id !== c.var.user.id) fail(409, 'Esa tarjeta ya está guardada en otra cuenta')
  if (!card.user_id) await c.env.DB.prepare('UPDATE cards SET user_id = ? WHERE id = ?').bind(c.var.user.id, card.id).run()
  const [view] = await withPrograms(c, [{ ...card, user_id: c.var.user.id }])
  return c.json(view, card.user_id ? 200 : 201)
})

// Quitarla de la app (sigue existiendo en el negocio).
walletRoutes.delete('/cards/:id', async (c) => {
  const card = await myCard(c, c.req.param('id'))
  await c.env.DB.prepare('UPDATE cards SET user_id = NULL WHERE id = ?').bind(card.id).run()
  return c.json({ ok: true })
})

// Unirse a un programa desde la app, con el nombre y el celular de su perfil.
walletRoutes.post('/join', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>)
  const user = c.var.user
  if (!user.full_name || !user.phone) fail(400, 'Primero agrega tu nombre y tu celular en Perfil')
  const program = await c.env.DB.prepare(
    `SELECT p.* FROM programs p JOIN businesses b ON b.id = p.business_id
     WHERE b.slug = ? AND p.id = ? AND p.active = 1 AND p.type != 'giftcard'`,
  )
    .bind(String(body.slug ?? ''), String(body.program_id ?? ''))
    .first<Program>()
  if (!program) fail(404, 'Ese programa ya no está disponible')
  // Si ya tenía tarjeta con su número y es suya (en su cuenta o con su mismo correo), se le regresa esa.
  const existing = await c.env.DB.prepare('SELECT * FROM cards WHERE program_id = ? AND phone = ?').bind(program.id, user.phone).first<Card>()
  if (existing && (existing.user_id === user.id || (!existing.user_id && existing.email === user.email))) {
    if (!existing.user_id) await c.env.DB.prepare('UPDATE cards SET user_id = ? WHERE id = ?').bind(user.id, existing.id).run()
    const [view] = await withPrograms(c, [{ ...existing, user_id: user.id }])
    return c.json(view, 200)
  }
  try {
    const card = await createCard(c.env, program, { customer_name: user.full_name, phone: user.phone, email: user.email }, { userId: user.id })
    const [view] = await withPrograms(c, [card])
    return c.json(view, 201)
  } catch (err) {
    // Igual que en /unete: con solo un número no se ve la tarjeta de nadie. La pide en caja o la agrega con su código.
    if ((err as { status?: number }).status === 409) fail(409, 'Ese número ya tiene tarjeta aquí. Pídela en caja y agrégala con su código.')
    throw err
  }
})
