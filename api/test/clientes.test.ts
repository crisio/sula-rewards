import { env } from 'cloudflare:test'
import { strFromU8, unzipSync, zlibSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { concat } from '../src/der'
import { decodePng } from '../src/logo'
import { pkcs8Pem, rsaKeys, selfSigned } from './certs'
import { act, call, login, newCard, nextPhone, setupProgram } from './helpers'

const SELLOS = { type: 'sellos', name: 'Café de la casa', stamps_goal: 8, reward: 'Café gratis' }

afterEach(() => {
  vi.restoreAllMocks()
})

// --- PNG de prueba: RGBA con un filtro distinto en cada fila (como los que arma el iPhone) ---

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function testPng(size: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const stride = size * 4
  const rows: Uint8Array[] = []
  const at = (y: number, i: number) => (y < 0 || i < 0 ? 0 : pixel(Math.floor(i / 4), y)[i % 4])
  for (let y = 0; y < size; y++) {
    const filter = y % 5
    const row = new Uint8Array(stride + 1)
    row[0] = filter
    for (let i = 0; i < stride; i++) {
      const x = at(y, i)
      const a = at(y, i - 4)
      const b = at(y - 1, i)
      const c = at(y - 1, i - 4)
      const p = a + b - c
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      row[i + 1] = (x - [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff
    }
    rows.push(row)
  }
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, size)
  new DataView(ihdr.buffer).setUint32(4, size)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return concat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(concat(...rows))), chunk('IEND', new Uint8Array()))
}

// Rojo arriba, transparente abajo: sobre blanco, lo de abajo queda blanco.
const logoPng = (size = 360) => testPng(size, (x, y) => (y < size / 2 ? [200, 20, 40, 255] : [x % 256, 0, 0, 0]))

const pngSize = (png: Uint8Array) => [new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20)]

describe('logo del negocio', () => {
  it('lee PNG con todos los filtros', () => {
    const { width, rgba } = decodePng(testPng(10, (x, y) => [x * 20, y * 20, (x + y) * 10, 255 - x]))
    expect(width).toBe(10)
    expect([...rgba.subarray((3 * 10 + 7) * 4, (3 * 10 + 7) * 4 + 4)]).toEqual([140, 60, 100, 248])
  })

  it('se sube, sale en el panel, en la web y en el pase de Apple Wallet, y se puede quitar', async () => {
    const { token, business, program } = await setupProgram('logo@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    const upload = (body: Uint8Array, t = token) => call(`/businesses/${business.id}/logo`, { method: 'PUT', token: t, body, headers: { 'Content-Type': 'image/png' } })

    expect((await upload(new TextEncoder().encode('no soy un png'))).data.error).toBe('El logo debe ser una imagen PNG')
    expect((await upload(logoPng(100))).data.error).toMatch(/360×360/)
    expect((await upload(logoPng(), await login('otro-logo@sps.hn'))).status).toBe(404)

    const res = await upload(logoPng())
    expect(res.status).toBe(200)
    expect(res.data.logo_url).toMatch(new RegExp(`^https://api\\.test/public/logos/${business.id}\\.png\\?v=\\d+$`))
    expect((await call('/businesses', { token })).data[0].logo_url).toBe(res.data.logo_url)
    expect((await call(`/public/cards/${cardId}`)).data.business.logo_url).toBe(res.data.logo_url)
    expect((await call(`/public/b/${business.slug}`)).data.logo_url).toBe(res.data.logo_url)

    const image = await call(new URL(res.data.logo_url).pathname)
    expect(image.res.headers.get('Content-Type')).toBe('image/png')
    const original = decodePng(new Uint8Array(await image.res.arrayBuffer()))
    expect([original.width, original.height]).toEqual([360, 360])
    expect([...original.rgba.subarray(0, 4)]).toEqual([200, 20, 40, 255])
    expect([...original.rgba.subarray(359 * 360 * 4, 359 * 360 * 4 + 4)]).toEqual([255, 255, 255, 255]) // lo transparente, blanco

    // El pase usa el logo del negocio (con esquinas redondeadas) en vez del ícono del programa
    const vars = await appleVars()
    const pass = unzipSync(new Uint8Array(await (await call(`/public/cards/${cardId}/apple`, { env: vars })).res.arrayBuffer()))
    expect(pngSize(pass['logo@3x.png'])).toEqual([90, 90])
    const logo3x = decodePng(pass['logo@3x.png'])
    expect(logo3x.rgba[3]).toBe(0) // la esquina, transparente
    expect([...logo3x.rgba.subarray((10 * 90 + 45) * 4, (10 * 90 + 45) * 4 + 4)]).toEqual([200, 20, 40, 255])

    const removed = await call(`/businesses/${business.id}/logo`, { method: 'DELETE', token })
    expect(removed.data.logo_url).toBeNull()
    expect((await call(new URL(res.data.logo_url).pathname)).status).toBe(404)
  })
})

/** Certificados de prueba para armar pases (como en wallet.test.ts). */
async function appleVars() {
  const keys = await rsaKeys()
  const cert = await selfSigned('Pass Type ID', keys)
  return {
    APPLE_PASS_TYPE_ID: 'pass.hn.sularewards.test',
    APPLE_TEAM_ID: 'ABCDE12345',
    APPLE_PASS_CERT: cert,
    APPLE_PASS_KEY: await pkcs8Pem(keys.privateKey),
    APPLE_WWDR_CERT: cert,
  }
}

describe('promociones', () => {
  it('el negocio las publica y se ven en Explorar mientras estén activas y vigentes', async () => {
    const { token, business } = await setupProgram('promo@sps.hn', SELLOS)
    const create = (json: Record<string, unknown>, t = token) => call(`/businesses/${business.id}/promotions`, { method: 'POST', token: t, json })

    expect((await create({ title: 'Ok' })).status).toBe(400)
    expect((await create({ title: '2×1 en lattes', ends_on: '2020-01-01' })).data.error).toBe('La fecha de fin ya pasó')
    expect((await create({ title: '2×1 en lattes', ends_on: '31/12/2026' })).status).toBe(400)
    expect((await create({ title: '2×1 en lattes' }, await login('ajeno-promo@sps.hn'))).status).toBe(404)

    const promo = await create({ title: '2×1 en lattes', body: 'Los martes de 2 a 5 pm', ends_on: '2099-12-31' })
    expect(promo.status).toBe(201)
    const feed = async () => (await call('/public/promotions')).data.filter((p: { business: { slug: string } }) => p.business.slug === business.slug)
    expect(await feed()).toMatchObject([{ title: '2×1 en lattes', body: 'Los martes de 2 a 5 pm', ends_on: '2099-12-31', business: { name: business.name, logo_url: null } }])
    expect((await call(`/public/b/${business.slug}`)).data.promotions).toMatchObject([{ title: '2×1 en lattes' }])

    // Vencida (se escribe directo: la API no deja poner fechas pasadas) o pausada: ya no sale
    await env.DB.prepare("INSERT INTO promotions (id, business_id, title, ends_on) VALUES ('vieja', ?, 'Vencida', '2020-01-01')").bind(business.id).run()
    expect((await feed()).map((p: { title: string }) => p.title)).toEqual(['2×1 en lattes'])
    expect((await call(`/promotions/${promo.data.id}`, { method: 'PATCH', token, json: { active: false } })).data.active).toBe(0)
    expect(await feed()).toEqual([])
    expect((await call(`/promotions/${promo.data.id}`, { method: 'PATCH', token: await login('ajeno-promo@sps.hn'), json: { active: true } })).status).toBe(404)

    // Hasta 5 activas
    for (let i = 0; i < 5; i++) expect((await create({ title: `Promo ${i}` })).status).toBe(201)
    expect((await create({ title: 'Una más' })).status).toBe(409)
    expect((await call(`/businesses/${business.id}/promotions`, { token })).data).toHaveLength(7)
    expect((await call(`/promotions/${promo.data.id}`, { method: 'DELETE', token })).status).toBe(200)
  })

  it('Explorar lista los negocios con programas abiertos', async () => {
    const { business } = await setupProgram('directorio@sps.hn', SELLOS)
    const sinProgramas = await call('/businesses', { method: 'POST', token: await login('vacio@sps.hn'), json: { name: 'Sin programas' } })
    const slugs = (await call('/public/businesses')).data.map((b: { slug: string }) => b.slug)
    expect(slugs).toContain(business.slug)
    expect(slugs).not.toContain(sinProgramas.data.slug)
  })
})

// --- Entrar con Apple y con Google: tokens firmados con una llave de prueba y sus llaves públicas simuladas ---

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function provider() {
  const keys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const kid = crypto.randomUUID()
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid, alg: 'RS256', use: 'sig' }
  const sign = async (claims: Record<string, unknown>, privateKey = keys.privateKey) => {
    const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)))
    const data = `${enc({ alg: 'RS256', kid })}.${enc({ exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), ...claims })}`
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data)))
    return `${data}.${b64url(signature)}`
  }
  return { jwk, sign }
}

const APPLE = { APPLE_SIGNIN_AUDIENCES: 'com.cristopherpineda.sularewards' }
const GOOGLE = { GOOGLE_IOS_CLIENT_ID: '1234-ios.apps.googleusercontent.com' }

function mockFetch(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const key = Object.keys(handlers).find((prefix) => url.startsWith(prefix))
    return key ? handlers[key](init) : new Response('no simulado', { status: 500 })
  })
}

describe('entrar con Apple y con Google', () => {
  it('dice qué formas de entrar están listas', async () => {
    // Como en wrangler.jsonc: Apple listo con el Bundle ID de la app; Google, hasta que haya client ID
    expect((await call('/auth/config')).data).toEqual({ apple: true, google_ios_client_id: null, google_web_client_id: null })
    expect((await call('/auth/config', { env: GOOGLE })).data.google_ios_client_id).toBe(GOOGLE.GOOGLE_IOS_CLIENT_ID)
    expect((await call('/auth/apple', { method: 'POST', json: {}, env: { APPLE_SIGNIN_AUDIENCES: '' } })).status).toBe(501)
    expect((await call('/auth/google', { method: 'POST', json: {} })).status).toBe(501)
  })

  it('Apple: crea la cuenta la primera vez y después entra a la misma', async () => {
    const apple = await provider()
    mockFetch({ 'https://appleid.apple.com/auth/keys': () => Response.json({ keys: [apple.jwk] }) })
    const claims = { iss: 'https://appleid.apple.com', aud: APPLE.APPLE_SIGNIN_AUDIENCES, sub: '001234.abcd', email: 'Ana@PrivateRelay.AppleID.com', email_verified: 'true' }

    const first = await call('/auth/apple', { method: 'POST', env: APPLE, json: { identity_token: await apple.sign(claims), full_name: 'Ana López' } })
    expect(first.status).toBe(200)
    expect(first.data.user).toMatchObject({ email: 'ana@privaterelay.appleid.com', full_name: 'Ana López', phone: null })
    expect((await call('/me', { token: first.data.token })).data.email).toBe('ana@privaterelay.appleid.com')

    // La segunda vez Apple no manda el nombre ni hace falta el correo: el «sub» lleva a la misma cuenta
    const again = await call('/auth/apple', { method: 'POST', env: APPLE, json: { identity_token: await apple.sign({ ...claims, email: undefined }) } })
    expect(again.data.user).toMatchObject({ id: first.data.user.id, full_name: 'Ana López' })

    const reject = async (extra: Record<string, unknown>) =>
      (await call('/auth/apple', { method: 'POST', env: APPLE, json: { identity_token: await apple.sign({ ...claims, ...extra }) } })).status
    expect(await reject({ aud: 'com.otra.app' })).toBe(401)
    expect(await reject({ iss: 'https://evil.example' })).toBe(401)
    expect(await reject({ exp: Math.floor(Date.now() / 1000) - 3600 })).toBe(401)
    const forged = (await apple.sign(claims)).split('.')
    forged[1] = b64url(new TextEncoder().encode(JSON.stringify({ ...claims, sub: 'otro', exp: Math.floor(Date.now() / 1000) + 600 })))
    expect((await call('/auth/apple', { method: 'POST', env: APPLE, json: { identity_token: forged.join('.') } })).status).toBe(401)
  })

  it('Google: entra a la cuenta que ya tenía ese correo; sin correo verificado, no', async () => {
    const google = await provider()
    mockFetch({ 'https://www.googleapis.com/oauth2/v3/certs': () => Response.json({ keys: [google.jwk] }) })
    const token = await login('dueno-google@sps.hn')
    const existing = (await call('/me', { token })).data
    const claims = { iss: 'https://accounts.google.com', aud: GOOGLE.GOOGLE_IOS_CLIENT_ID, sub: '1098765', email: 'dueno-google@sps.hn', email_verified: true, name: 'Dueño' }

    const res = await call('/auth/google', { method: 'POST', env: GOOGLE, json: { id_token: await google.sign(claims) } })
    expect(res.data.user.id).toBe(existing.id)
    const unverified = await call('/auth/google', { method: 'POST', env: GOOGLE, json: { id_token: await google.sign({ ...claims, sub: '222', email_verified: false }) } })
    expect(unverified.status).toBe(401)
  })

  it('al borrar la cuenta se revoca el acceso de Apple', async () => {
    const apple = await provider()
    const ec = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const vars = { ...APPLE, APPLE_TEAM_ID: '3BZ685RYJ3', APPLE_SIGNIN_KEY_ID: 'KEY123', APPLE_SIGNIN_KEY: await pkcs8Pem(ec.privateKey) }
    const fetchMock = mockFetch({
      'https://appleid.apple.com/auth/keys': () => Response.json({ keys: [apple.jwk] }),
      'https://appleid.apple.com/auth/token': () => Response.json({ refresh_token: 'r.prueba' }),
      'https://appleid.apple.com/auth/revoke': () => new Response(null, { status: 200 }),
    })
    const identity = await apple.sign({ iss: 'https://appleid.apple.com', aud: APPLE.APPLE_SIGNIN_AUDIENCES, sub: '009.borrar', email: 'borrar@icloud.com' })
    const signedIn = await call('/auth/apple', { method: 'POST', env: vars, json: { identity_token: identity, authorization_code: 'c.prueba' } })

    // El client secret es un JWT ES256 firmado con la llave .p8
    const tokenBody = new URLSearchParams(String(fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/token'))![1]!.body))
    expect(tokenBody.get('code')).toBe('c.prueba')
    const [h, p, s] = tokenBody.get('client_secret')!.split('.')
    const decode = (v: string) => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
    expect(JSON.parse(strFromU8(decode(h)))).toEqual({ alg: 'ES256', kid: 'KEY123' })
    expect(JSON.parse(strFromU8(decode(p)))).toMatchObject({ iss: '3BZ685RYJ3', sub: APPLE.APPLE_SIGNIN_AUDIENCES, aud: 'https://appleid.apple.com' })
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, decode(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true)

    expect((await call('/me', { method: 'DELETE', token: signedIn.data.token, env: vars })).status).toBe(200)
    const revoke = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/revoke'))
    expect(new URLSearchParams(String(revoke![1]!.body)).get('token')).toBe('r.prueba')
  })
})

describe('la cartera del cliente', () => {
  it('suma las tarjetas con su correo, agrega por código y no deja tomar la de otro', async () => {
    const { token: shop, program } = await setupProgram('cartera@sps.hn', SELLOS)
    const byEmail = await newCard(shop, program.id, { email: 'cliente@correo.hn' })
    const byCode = await newCard(shop, program.id)
    await act(shop, byCode, { action: 'sello', count: 2 })

    const me = await login('cliente@correo.hn')
    const wallet = await call('/wallet', { token: me })
    expect(wallet.data.map((c: { id: string }) => c.id)).toEqual([byEmail])
    expect(wallet.data[0]).toMatchObject({ program: { name: 'Café de la casa' }, business: { name: 'Negocio de cartera@sps.hn' } })
    expect(wallet.data[0].phone).toBeUndefined()

    const formatted = byCode.toLowerCase().replace(/(.{4})(?!$)/g, '$1-')
    expect((await call('/wallet/cards', { method: 'POST', token: me, json: { code: formatted } })).status).toBe(201)
    expect((await call('/wallet/cards', { method: 'POST', token: me, json: { code: `https://crisio.github.io/sula-rewards/tarjeta/${byCode}` } })).status).toBe(200)
    expect((await call('/wallet/cards', { method: 'POST', token: me, json: { code: 'ABC' } })).status).toBe(400)
    expect((await call('/wallet/cards', { method: 'POST', token: me, json: { code: 'ZZZZZZZZZZZZ' } })).status).toBe(404)
    const other = await login('otro-cliente@correo.hn')
    expect((await call('/wallet/cards', { method: 'POST', token: other, json: { code: byCode } })).status).toBe(409)

    const detail = await call(`/wallet/cards/${byCode}`, { token: me })
    expect(detail.data).toMatchObject({ stamps: 2, headline: { value: '2/8' } })
    expect(detail.data.movements.map((m: { kind: string }) => m.kind)).toEqual(['sello', 'alta'])
    expect((await call(`/wallet/cards/${byCode}`, { token: other })).status).toBe(404)

    // Quitarla de la app: sigue en el negocio
    expect((await call(`/wallet/cards/${byCode}`, { method: 'DELETE', token: me })).status).toBe(200)
    expect((await call('/wallet', { token: me })).data).toHaveLength(1)
    expect((await call(`/cards/${byCode}`, { token: shop })).data.id).toBe(byCode)
    expect((await call('/wallet', { token: other })).status).toBe(200)
  })

  it('se une a un programa con su nombre y celular del perfil', async () => {
    const { token: shop, business, program } = await setupProgram('unirse-app@sps.hn', SELLOS)
    const me = await login('nuevo-cliente@correo.hn')
    const join = () => call('/wallet/join', { method: 'POST', token: me, json: { slug: business.slug, program_id: program.id } })

    expect((await join()).data.error).toMatch(/nombre y tu celular/)
    expect((await call('/me', { method: 'PATCH', token: me, json: { phone: '12345678' } })).status).toBe(400)
    const phone = nextPhone()
    const profile = await call('/me', { method: 'PATCH', token: me, json: { full_name: 'Karla Ruiz', phone } })
    expect(profile.data).toMatchObject({ full_name: 'Karla Ruiz', phone: `+504${phone}` })

    const joined = await join()
    expect(joined.status).toBe(201)
    expect(joined.data).toMatchObject({ customer_name: 'Karla Ruiz', headline: { value: '0/8' } })
    expect((await join()).status).toBe(200) // ya era suya
    expect((await call(`/cards/${joined.data.id}`, { token: shop })).data).toMatchObject({ phone: `+504${phone}`, email: 'nuevo-cliente@correo.hn' })

    // Otra cuenta con el mismo celular no ve esa tarjeta
    const other = await login('mismo-cel@correo.hn')
    await call('/me', { method: 'PATCH', token: other, json: { full_name: 'Otra', phone } })
    const taken = await call('/wallet/join', { method: 'POST', token: other, json: { slug: business.slug, program_id: program.id } })
    expect(taken.status).toBe(409)
    expect(taken.data.error).toMatch(/Pídela en caja/)

    // Si el cliente borra su cuenta, la tarjeta sigue en el negocio
    expect((await call('/me', { method: 'DELETE', token: me })).status).toBe(200)
    const row = await env.DB.prepare('SELECT user_id FROM cards WHERE id = ?').bind(joined.data.id).first()
    expect(row).toEqual({ user_id: null })
  })
})
