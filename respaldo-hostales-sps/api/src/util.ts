import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from './env'

/** Error con mensaje para mostrar en la app (en español). */
export function fail(status: ContentfulStatusCode, message: string, extra?: Record<string, unknown>): never {
  const res = extra ? new Response(JSON.stringify({ error: message, ...extra }), { status, headers: { 'Content-Type': 'application/json' } }) : undefined
  throw new HTTPException(status, { message, res })
}

let relojDePrueba: number | null = null

/** Hora real del servidor. En las pruebas se puede fijar con fijarReloj(). */
export const ahora = () => relojDePrueba ?? Date.now()
export function fijarReloj(ms: number | null) {
  relojDePrueba = ms
}

export const uid = () => crypto.randomUUID()

export async function cuerpo<T = Record<string, unknown>>(c: Context<AppEnv>): Promise<T> {
  try {
    const data = await c.req.json()
    if (!data || typeof data !== 'object') throw new Error()
    return data as T
  } catch {
    fail(400, 'La solicitud no es válida.')
  }
}

export function texto(valor: unknown, max = 200) {
  return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

export function textoLargo(valor: unknown, max = 2000) {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : ''
}

/** Monto en centavos (entero ≥ 0, máximo L 1,000,000). */
export function monto(valor: unknown, campo = 'El monto'): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > 100_000_000) fail(400, `${campo} no es válido.`)
  return valor
}

const encoder = new TextEncoder()
const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256(text: string) {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

/** PBKDF2-SHA256 con sal: el PIN nunca se guarda tal cual. */
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000 }, key, 256)
  return toHex(bits)
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  return crypto.subtle.timingSafeEqual(encoder.encode(a), encoder.encode(b))
}

export const esPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,8}$/.test(pin)
