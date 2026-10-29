import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { expect } from 'vitest'
import app from '../src/index'
import { devOutbox } from '../src/email'
import type { Env } from '../src/env'

const BASE = 'https://api.test'
const ORIGIN = 'https://crisio.github.io'

export async function call(path: string, init: RequestInit & { token?: string; json?: unknown; env?: Partial<Env> } = {}) {
  const headers = new Headers(init.headers)
  headers.set('Origin', ORIGIN)
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const ctx = createExecutionContext()
  const res = await app.fetch(new Request(BASE + path, { ...init, headers, body }), { ...env, ...init.env }, ctx)
  await waitOnExecutionContext(ctx)
  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json<any>() : null
  return { status: res.status, data, res }
}

const lastCodeFor = (email: string) => {
  const mail = [...devOutbox].reverse().find((m) => m.to === email)
  return mail?.subject.match(/^(\d{6})/)?.[1]
}

/** Entra (o crea la cuenta) con el código del correo y regresa el token. */
export async function login(email: string) {
  await env.DB.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run() // evita el límite de 1 min
  expect((await call('/auth/code', { method: 'POST', json: { email } })).status).toBe(200)
  const { data } = await call('/auth/verify', { method: 'POST', json: { email, code: lastCodeFor(email) } })
  return data.token as string
}

let phoneSeq = 30000000

/** Un celular hondureño distinto en cada llamada. */
export const nextPhone = () => String(++phoneSeq)

/** Comercio con un programa del tipo pedido, listo para dar de alta clientes. */
export async function setupProgram(email: string, program: Record<string, unknown>) {
  const token = await login(email)
  const business = await call('/businesses', { method: 'POST', token, json: { name: `Negocio de ${email}`, category: 'Cafetería' } })
  expect(business.status).toBe(201)
  const created = await call(`/businesses/${business.data.id}/programs`, { method: 'POST', token, json: program })
  expect(created.status).toBe(201)
  return { token, business: business.data, program: created.data }
}

export async function newCard(token: string, programId: string, extra: Record<string, unknown> = {}) {
  const res = await call(`/programs/${programId}/cards`, { method: 'POST', token, json: { customer_name: 'Andrea Pérez', phone: nextPhone(), ...extra } })
  expect(res.status).toBe(201)
  return res.data.id as string
}

export const act = (token: string, cardId: string, json: Record<string, unknown>) => call(`/cards/${cardId}/actions`, { method: 'POST', token, json })
