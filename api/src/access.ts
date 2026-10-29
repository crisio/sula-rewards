import type { Context } from 'hono'
import { PROGRAM_COLUMNS, type AppEnv, type Business, type Card, type Program } from './env'
import { normalizeCardId } from './crypto'
import { fail } from './errors'

// Cada comercio solo ve lo suyo: todo pasa por aquí, y lo ajeno responde 404 (ni se sabe si existe).

export async function ownedBusiness(c: Context<AppEnv>, businessId: string) {
  const business = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ? AND owner_id = ?').bind(businessId, c.var.user.id).first<Business>()
  if (!business) fail(404, 'No encontramos ese negocio')
  return business
}

export async function ownedProgram(c: Context<AppEnv>, programId: string) {
  const program = await c.env.DB.prepare(
    `SELECT ${PROGRAM_COLUMNS.split(', ').map((col) => `p.${col}`).join(', ')}
     FROM programs p JOIN businesses b ON b.id = p.business_id
     WHERE p.id = ? AND b.owner_id = ?`,
  )
    .bind(programId, c.var.user.id)
    .first<Program>()
  if (!program) fail(404, 'No encontramos ese programa')
  return program
}

export async function ownedCard(c: Context<AppEnv>, rawId: string) {
  const card = await c.env.DB.prepare(
    `SELECT k.* FROM cards k JOIN programs p ON p.id = k.program_id JOIN businesses b ON b.id = p.business_id
     WHERE k.id = ? AND b.owner_id = ?`,
  )
    .bind(normalizeCardId(rawId), c.var.user.id)
    .first<Card>()
  if (!card) fail(404, 'No encontramos esa tarjeta en tu negocio')
  return card
}
