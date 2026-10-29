import type { Business, Card, Env, Program } from './env'
import { importRsaKey } from './der'
import { cardUrl } from './apple'
import { formatCardId, headline, status } from './rules'

// Google Wallet: pase genérico con el color del programa. El enlace «Guardar en Google Wallet» lleva el pase
// firmado (JWT); después, cada cambio de la tarjeta se manda a la API de Google y el teléfono se actualiza solo.
// https://developers.google.com/wallet/generic — configuración en docs/wallet.md.

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY)

const localized = (value: string) => ({ defaultValue: { language: 'es', value } })

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const objectId = (env: Env, card: Card) => `${env.GOOGLE_WALLET_ISSUER_ID}.${card.id}`
export const classId = (env: Env, program: Program) => `${env.GOOGLE_WALLET_ISSUER_ID}.programa-${program.id}`

export function genericObject(env: Env, apiOrigin: string, card: Card, program: Program, business: Business) {
  const head = headline(program, card)
  return {
    id: objectId(env, card),
    classId: classId(env, program),
    state: 'ACTIVE',
    hexBackgroundColor: program.color,
    logo: { sourceUri: { uri: `${apiOrigin}/public/programs/${program.id}/icon.png` }, contentDescription: localized(business.name) },
    cardTitle: localized(business.name),
    subheader: localized(head.label),
    header: localized(head.value),
    textModulesData: [
      { id: 'cliente', header: 'Cliente', body: card.customer_name },
      { id: 'estado', header: program.name, body: status(program, card) },
    ],
    barcode: { type: 'QR_CODE', value: card.id, alternateText: formatCardId(card.id) },
    // La versión en la URL hace que Google vuelva a bajar la imagen cuando cambian los sellos.
    ...(program.type === 'sellos' && {
      heroImage: { sourceUri: { uri: `${apiOrigin}/public/cards/${card.id}/strip.png?v=${card.stamps}` }, contentDescription: localized(head.value) },
    }),
    linksModuleData: { uris: [{ id: 'tarjeta', uri: cardUrl(env, card.id), description: 'Ver mi tarjeta' }] },
  }
}

async function signJwt(env: Env, payload: Record<string, unknown>) {
  const encode = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)))
  const data = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`
  const key = await importRsaKey(env.GOOGLE_SA_KEY!)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data))
  return `${data}.${b64url(new Uint8Array(signature))}`
}

/** Enlace «Guardar en Google Wallet»: crea la clase del programa y el pase de la tarjeta al guardarlo. */
export async function saveUrl(env: Env, apiOrigin: string, card: Card, program: Program, business: Business) {
  const jwt = await signJwt(env, {
    iss: env.GOOGLE_SA_EMAIL,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [new URL(env.APP_URL).origin],
    payload: {
      genericClasses: [{ id: classId(env, program) }],
      genericObjects: [genericObject(env, apiOrigin, card, program, business)],
    },
  })
  return `https://pay.google.com/gp/v/save/${jwt}`
}

let cachedToken: { value: string; expiresAt: number } | null = null

/** Token de OAuth de la cuenta de servicio (dura 1 h; se reusa mientras le queden más de 5 minutos). */
async function accessToken(env: Env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60_000) return cachedToken.value
  const now = Math.floor(Date.now() / 1000)
  const assertion = await signJwt(env, {
    iss: env.GOOGLE_SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json<{ access_token: string; expires_in: number }>()
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

/** Manda el estado actual de la tarjeta a Google Wallet. Si el cliente nunca la guardó (404), no pasa nada. */
export async function syncGoogle(env: Env, apiOrigin: string, card: Card, program: Program, business: Business) {
  try {
    const object = genericObject(env, apiOrigin, card, program, business)
    const res = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(object.id)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(object),
    })
    if (!res.ok && res.status !== 404) console.error('Google Wallet', res.status, (await res.text()).slice(0, 300))
  } catch (err) {
    console.error('Google Wallet', err)
  }
}
