import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { expect } from 'vitest'
import app from '../src/index'
import { fijarReloj } from '../src/util'
import { instanteHN } from '../../shared/fechas'

export async function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers)
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const ctx = createExecutionContext()
  const res = await app.fetch(new Request('https://hostales.test' + path, { ...init, headers, body }), env, ctx)
  await waitOnExecutionContext(ctx)
  const data = res.headers.get('Content-Type')?.includes('json') ? await res.json<any>() : null
  return { status: res.status, data, res }
}

/** Fija la hora del servidor en hora de Honduras: reloj('2026-11-14', '10:00'). */
export function reloj(fecha: string, hora: string) {
  fijarReloj(instanteHN(fecha, hora))
}

export async function entrarDueno() {
  const res = await call('/api/entrar', { method: 'POST', json: { dueno: true, pin: '246810' } })
  expect(res.status).toBe(200)
  return res.data.token as string
}

let seq = 0

/** Crea un recepcionista en el hostal y regresa su token. */
export async function recepcionista(dueno: string, hostal = 'prado-alto', nombre = `Recep ${++seq}`) {
  const creado = await call('/api/usuarios', { method: 'POST', token: dueno, json: { nombre, hostal_id: hostal, pin: '1234' } })
  expect(creado.status).toBe(201)
  const res = await call('/api/entrar', { method: 'POST', json: { usuario_id: creado.data.id, pin: '1234' } })
  expect(res.status).toBe(200)
  return { token: res.data.token as string, id: creado.data.id as string, nombre }
}

export const registrar = (token: string, json: Record<string, unknown>, hostal = 'prado-alto') =>
  call(`/api/hostales/${hostal}/registros`, { method: 'POST', token, json })

export const hoy = (token: string, hostal = 'prado-alto') => call(`/api/hostales/${hostal}/hoy`, { token })
