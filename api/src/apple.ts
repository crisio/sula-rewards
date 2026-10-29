import { Hono } from 'hono'
import { strToU8, zipSync } from 'fflate'
import type { AppEnv, Business, Card, Env, Program } from './env'
import { safeEqual } from './crypto'
import { signDetached } from './der'
import { programIcon, stampStrip } from './images'
import { formatCardId, headline, status } from './rules'

// Apple Wallet: el pase (.pkpass) de cada tarjeta y el servicio web con el que el iPhone pregunta si cambió.
// Formato: https://developer.apple.com/documentation/walletpasses — configuración en docs/wallet.md.

export const appleConfigured = (env: Env) =>
  Boolean(env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID && env.APPLE_PASS_CERT && env.APPLE_PASS_KEY && env.APPLE_WWDR_CERT)

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

/** Enlace a la página de la tarjeta en la app (GitHub Pages). */
export const cardUrl = (env: Env, cardId: string) => new URL(`tarjeta/${cardId}`, env.APP_URL).toString()

export function passJson(env: Env, apiOrigin: string, card: Card, program: Program, business: Business) {
  const head = headline(program, card)
  const url = cardUrl(env, card.id)
  return {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_PASS_TYPE_ID,
    teamIdentifier: env.APPLE_TEAM_ID,
    serialNumber: card.id,
    authenticationToken: card.apple_token,
    // El iPhone le agrega «v1/devices/…» y «v1/passes/…» (rutas de appleRoutes).
    webServiceURL: `${apiOrigin}/apple/`,
    organizationName: business.name,
    description: `${program.name} de ${business.name}`,
    logoText: business.name,
    backgroundColor: rgb(program.color),
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(255, 255, 255)',
    storeCard: {
      headerFields: [{ key: 'valor', label: head.label, value: head.value, changeMessage: `${program.name}: %@` }],
      secondaryFields: [
        { key: 'cliente', label: 'CLIENTE', value: card.customer_name },
        ...(program.reward ? [{ key: 'premio', label: 'PREMIO', value: program.reward, textAlignment: 'PKTextAlignmentRight' }] : []),
      ],
      backFields: [
        { key: 'estado', label: program.name, value: status(program, card) },
        { key: 'codigo', label: 'Código de la tarjeta', value: formatCardId(card.id) },
        { key: 'web', label: 'Tu tarjeta en la web', value: url, attributedValue: `<a href="${url}">Abrir mi tarjeta</a>` },
        { key: 'comercio', label: business.name, value: `${business.city}, Honduras` },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: card.id, messageEncoding: 'iso-8859-1', altText: formatCardId(card.id) }],
  }
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** El .pkpass: un zip con pass.json, las imágenes, manifest.json (SHA-1 de cada archivo) y su firma. */
export async function buildPkpass(env: Env, apiOrigin: string, card: Card, program: Program, business: Business) {
  const files: Record<string, Uint8Array> = {
    'pass.json': strToU8(JSON.stringify(passJson(env, apiOrigin, card, program, business))),
    'icon.png': programIcon(program.color, 29),
    'icon@2x.png': programIcon(program.color, 58),
    'icon@3x.png': programIcon(program.color, 87),
  }
  if (program.type === 'sellos') {
    files['strip.png'] = stampStrip(program.color, program.stamps_goal!, card.stamps, 1)
    files['strip@2x.png'] = stampStrip(program.color, program.stamps_goal!, card.stamps, 2)
  }
  const manifest: Record<string, string> = {}
  for (const [name, data] of Object.entries(files)) manifest[name] = toHex(await crypto.subtle.digest('SHA-1', data))
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  files['signature'] = await signDetached(files['manifest.json'], env.APPLE_PASS_CERT!, env.APPLE_PASS_KEY!, env.APPLE_WWDR_CERT!)
  return zipSync(files)
}

export function pkpassResponse(pass: Uint8Array, card: Card) {
  return new Response(pass, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="tarjeta-${card.id}.pkpass"`,
      'Last-Modified': new Date(card.updated_at).toUTCString(),
      'Cache-Control': 'no-store',
    },
  })
}

// Servicio web de Apple Wallet. El iPhone se registra al guardar el pase y pide la versión nueva cuando el
// usuario actualiza (o, cuando haya push por APNs, al recibir el aviso; ver docs/wallet.md).
export const appleRoutes = new Hono<AppEnv>()

async function authorizedCard(env: Env, passType: string, serial: string, header: string | undefined) {
  if (!appleConfigured(env) || passType !== env.APPLE_PASS_TYPE_ID) return null
  const token = header?.match(/^ApplePass (.+)$/)?.[1]
  const card = token ? await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(serial).first<Card>() : null
  return card && safeEqual(card.apple_token, token!) ? card : null
}

appleRoutes.post('/v1/devices/:device/registrations/:passType/:serial', async (c) => {
  const card = await authorizedCard(c.env, c.req.param('passType'), c.req.param('serial'), c.req.header('Authorization'))
  if (!card) return c.body(null, 401)
  const { pushToken } = await c.req.json<{ pushToken?: string }>().catch(() => ({ pushToken: undefined }))
  if (!pushToken) return c.body(null, 400)
  const device = c.req.param('device')
  const existed = await c.env.DB.prepare('SELECT 1 FROM apple_registrations WHERE device_id = ? AND card_id = ?').bind(device, card.id).first()
  await c.env.DB.prepare(
    `INSERT INTO apple_registrations (device_id, card_id, push_token) VALUES (?1, ?2, ?3)
     ON CONFLICT (device_id, card_id) DO UPDATE SET push_token = ?3`,
  )
    .bind(device, card.id, pushToken)
    .run()
  // 201 = registro nuevo; 200 = ya estaba
  return c.body(null, existed ? 200 : 201)
})

appleRoutes.delete('/v1/devices/:device/registrations/:passType/:serial', async (c) => {
  const card = await authorizedCard(c.env, c.req.param('passType'), c.req.param('serial'), c.req.header('Authorization'))
  if (!card) return c.body(null, 401)
  await c.env.DB.prepare('DELETE FROM apple_registrations WHERE device_id = ? AND card_id = ?').bind(c.req.param('device'), card.id).run()
  return c.body(null, 200)
})

// ¿Qué pases de este teléfono cambiaron desde la última vez? (el «tag» es el updated_at más reciente, en ms)
appleRoutes.get('/v1/devices/:device/registrations/:passType', async (c) => {
  if (!appleConfigured(c.env) || c.req.param('passType') !== c.env.APPLE_PASS_TYPE_ID) return c.body(null, 404)
  const since = Number(c.req.query('passesUpdatedSince') ?? 0) || 0
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.updated_at FROM apple_registrations r JOIN cards k ON k.id = r.card_id
     WHERE r.device_id = ? AND k.updated_at > ?`,
  )
    .bind(c.req.param('device'), since)
    .all<{ id: string; updated_at: number }>()
  if (!results.length) return c.body(null, 204)
  return c.json({ serialNumbers: results.map((r) => r.id), lastUpdated: String(Math.max(...results.map((r) => r.updated_at))) })
})

appleRoutes.get('/v1/passes/:passType/:serial', async (c) => {
  const card = await authorizedCard(c.env, c.req.param('passType'), c.req.param('serial'), c.req.header('Authorization'))
  if (!card) return c.body(null, 401)
  const since = Date.parse(c.req.header('If-Modified-Since') ?? '')
  // Last-Modified va en segundos: se compara contra el segundo del último cambio.
  if (since && Math.floor(card.updated_at / 1000) * 1000 <= since) return c.body(null, 304)
  const program = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(card.program_id).first<Program>()
  const business = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(program!.business_id).first<Business>()
  return pkpassResponse(await buildPkpass(c.env, new URL(c.req.url).origin, card, program!, business!), card)
})

appleRoutes.post('/v1/log', async (c) => {
  const { logs } = await c.req.json<{ logs?: string[] }>().catch(() => ({ logs: [] }))
  for (const line of logs ?? []) console.log('[Apple Wallet]', line)
  return c.body(null, 200)
})
