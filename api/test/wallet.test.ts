import { env } from 'cloudflare:test'
import { unzipSync, strFromU8 } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesOf, children, concat, oid, readNode, seq, setOf, smallInt, tlv, utcTime, nullValue } from '../src/der'
import { act, call, newCard, setupProgram } from './helpers'

const SELLOS = { type: 'sellos', name: 'Café de la casa', stamps_goal: 8, reward: 'Café gratis' }

const toPem = (label: string, der: ArrayBuffer | Uint8Array) =>
  `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`

/** exportKey regresa ArrayBuffer para spki/pkcs8 (JsonWebKey solo con 'jwk'). */
const exportDer = async (format: 'spki' | 'pkcs8', key: CryptoKey) => (await crypto.subtle.exportKey(format, key)) as ArrayBuffer

const rsaKeys = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>

/** Certificado X.509 autofirmado (solo para las pruebas: hace las veces del de Apple). */
async function selfSigned(cn: string, keys: CryptoKeyPair) {
  const name = seq(setOf(seq(oid('2.5.4.3'), tlv(0x0c, new TextEncoder().encode(cn)))))
  const alg = seq(oid('1.2.840.113549.1.1.11'), nullValue())
  const tbs = seq(
    tlv(0xa0, smallInt(2)),
    smallInt(7),
    alg,
    name,
    seq(utcTime(new Date('2026-01-01T00:00:00Z')), utcTime(new Date('2036-01-01T00:00:00Z'))),
    name,
    new Uint8Array(await exportDer('spki', keys.publicKey)),
  )
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, tbs))
  return toPem('CERTIFICATE', seq(tbs, alg, tlv(0x03, concat(Uint8Array.of(0), signature))))
}

async function appleEnv() {
  const keys = await rsaKeys()
  return {
    keys,
    vars: {
      APPLE_PASS_TYPE_ID: 'pass.hn.sularewards.test',
      APPLE_TEAM_ID: 'ABCDE12345',
      APPLE_PASS_CERT: await selfSigned('Pass Type ID: pass.hn.sularewards.test', keys),
      APPLE_PASS_KEY: toPem('PRIVATE KEY', await exportDer('pkcs8', keys.privateKey)),
      APPLE_WWDR_CERT: await selfSigned('WWDR de prueba', await rsaKeys()),
    },
  }
}

const sha = async (algo: string, data: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest(algo, data))].map((b) => b.toString(16).padStart(2, '0')).join('')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Apple Wallet', () => {
  it('sin certificados no ofrece el botón', async () => {
    const { token, program } = await setupProgram('sin-apple@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    expect((await call(`/public/cards/${cardId}`)).data.wallet).toEqual({ apple: false, google: false })
    expect((await call(`/public/cards/${cardId}/apple`)).status).toBe(501)
  })

  it('arma un .pkpass firmado con el estado de la tarjeta', async () => {
    const { keys, vars } = await appleEnv()
    const { token, program, business } = await setupProgram('apple@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    await act(token, cardId, { action: 'sello', count: 7 })

    const res = await call(`/public/cards/${cardId}/apple`, { env: vars })
    expect(res.status).toBe(200)
    expect(res.res.headers.get('Content-Type')).toBe('application/vnd.apple.pkpass')
    const files = unzipSync(new Uint8Array(await res.res.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['icon.png', 'icon@2x.png', 'icon@3x.png', 'manifest.json', 'pass.json', 'signature', 'strip.png', 'strip@2x.png'])

    const pass = JSON.parse(strFromU8(files['pass.json']))
    expect(pass).toMatchObject({
      passTypeIdentifier: 'pass.hn.sularewards.test',
      teamIdentifier: 'ABCDE12345',
      serialNumber: cardId,
      organizationName: business.name,
      webServiceURL: 'https://api.test/apple/',
      backgroundColor: 'rgb(79, 63, 224)',
      storeCard: { headerFields: [{ label: 'SELLOS', value: '7/8' }], secondaryFields: [{ value: 'Andrea Pérez' }, { value: 'Café gratis' }] },
      barcodes: [{ format: 'PKBarcodeFormatQR', message: cardId }],
    })
    expect(pass.authenticationToken.length).toBeGreaterThanOrEqual(16)

    // El manifest trae el SHA-1 de cada archivo
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    for (const [name, hash] of Object.entries(manifest)) expect(await sha('SHA-1', files[name])).toBe(hash)

    // La firma PKCS#7: los atributos firmados traen el SHA-256 del manifest y la firma valida con la llave del certificado
    const sig = files['signature']
    const signedData = children(sig, children(sig, readNode(sig))[1])[0]
    const signerInfo = children(sig, children(sig, children(sig, signedData).at(-1)!)[0])
    const attrsNode = signerInfo[3]
    expect(attrsNode.tag).toBe(0xa0)
    const attrs = bytesOf(sig, attrsNode).slice()
    attrs[0] = 0x31 // se firma como SET
    const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
    expect(hex(attrs)).toContain(await sha('SHA-256', files['manifest.json']))
    const signature = sig.subarray(signerInfo[5].body, signerInfo[5].end)
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, signature, attrs)).toBe(true)

    // Las imágenes son PNG del tamaño que pide Apple
    const size = (png: Uint8Array) => [new DataView(png.buffer, png.byteOffset).getUint32(16), new DataView(png.buffer, png.byteOffset).getUint32(20)]
    expect(size(files['icon@2x.png'])).toEqual([58, 58])
    expect(size(files['strip@2x.png'])).toEqual([750, 246])
  })

  it('el iPhone se registra, pregunta qué cambió y baja la versión nueva', async () => {
    const { vars } = await appleEnv()
    const { token, program } = await setupProgram('apple-ws@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    const card = await env.DB.prepare('SELECT apple_token, updated_at FROM cards WHERE id = ?').bind(cardId).first<{ apple_token: string; updated_at: number }>()
    const auth = { Authorization: `ApplePass ${card!.apple_token}` }
    const base = `/apple/v1/devices/iphone-1/registrations/${vars.APPLE_PASS_TYPE_ID}`

    expect((await call(`${base}/${cardId}`, { method: 'POST', json: { pushToken: 'tok' }, env: vars, headers: { Authorization: 'ApplePass otro-token-cualquiera' } })).status).toBe(401)
    expect((await call(`${base}/${cardId}`, { method: 'POST', json: { pushToken: 'tok' }, env: vars, headers: auth })).status).toBe(201)
    expect((await call(`${base}/${cardId}`, { method: 'POST', json: { pushToken: 'tok2' }, env: vars, headers: auth })).status).toBe(200)

    const since = card!.updated_at
    expect((await call(`${base}?passesUpdatedSince=${since}`, { env: vars })).status).toBe(204)
    await act(token, cardId, { action: 'sello' })
    const changed = await call(`${base}?passesUpdatedSince=${since}`, { env: vars })
    expect(changed.data.serialNumbers).toEqual([cardId])
    expect(Number(changed.data.lastUpdated)).toBeGreaterThan(since)

    const passUrl = `/apple/v1/passes/${vars.APPLE_PASS_TYPE_ID}/${cardId}`
    const latest = await call(passUrl, { env: vars, headers: auth })
    expect(latest.status).toBe(200)
    const pass = JSON.parse(strFromU8(unzipSync(new Uint8Array(await latest.res.arrayBuffer()))['pass.json']))
    expect(pass.storeCard.headerFields[0].value).toBe('1/8')
    expect((await call(passUrl, { env: vars, headers: { ...auth, 'If-Modified-Since': latest.res.headers.get('Last-Modified')! } })).status).toBe(304)
    expect((await call(passUrl, { env: vars })).status).toBe(401)

    expect((await call(`${base}/${cardId}`, { method: 'DELETE', env: vars, headers: auth })).status).toBe(200)
    expect((await call(`${base}?passesUpdatedSince=0`, { env: vars })).status).toBe(204)
  })
})

describe('Google Wallet', () => {
  async function googleEnv() {
    const keys = await rsaKeys()
    return {
      keys,
      vars: {
        GOOGLE_WALLET_ISSUER_ID: '3388000000012345678',
        GOOGLE_SA_EMAIL: 'wallet@sula-rewards.iam.gserviceaccount.com',
        // Como viene en el JSON de la cuenta de servicio: con «\n» escritos
        GOOGLE_SA_KEY: toPem('PRIVATE KEY', await exportDer('pkcs8', keys.privateKey)).replace(/\n/g, '\\n'),
      },
    }
  }

  it('da el enlace «Guardar en Google Wallet» con el pase firmado', async () => {
    const { keys, vars } = await googleEnv()
    const { token, program } = await setupProgram('google@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    await act(token, cardId, { action: 'sello', count: 3 })

    const res = await call(`/public/cards/${cardId}/google`, { env: vars })
    expect(res.status).toBe(200)
    const jwt = res.data.url.replace('https://pay.google.com/gp/v/save/', '')
    const [header, payload, signature] = jwt.split('.')
    const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, decode(signature), new TextEncoder().encode(`${header}.${payload}`))).toBe(true)

    const claims = JSON.parse(new TextDecoder().decode(decode(payload)))
    expect(claims).toMatchObject({ iss: vars.GOOGLE_SA_EMAIL, aud: 'google', typ: 'savetowallet', origins: ['https://crisio.github.io'] })
    expect(claims.payload.genericObjects[0]).toMatchObject({
      id: `${vars.GOOGLE_WALLET_ISSUER_ID}.${cardId}`,
      classId: `${vars.GOOGLE_WALLET_ISSUER_ID}.programa-${program.id}`,
      hexBackgroundColor: '#4f3fe0',
      header: { defaultValue: { value: '3/8' } },
      barcode: { type: 'QR_CODE', value: cardId },
      heroImage: { sourceUri: { uri: `https://api.test/public/cards/${cardId}/strip.png?v=3` } },
    })
    expect((await call(`/public/cards/${cardId}`, { env: vars })).data.wallet).toEqual({ apple: false, google: true })
  })

  it('después de guardarla, cada cambio se manda a Google', async () => {
    const { vars } = await googleEnv()
    const { token, program } = await setupProgram('google-sync@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    await call(`/public/cards/${cardId}/google`, { env: vars })

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'ya29.prueba', expires_in: 3600 })
      return Response.json({})
    })
    await call(`/cards/${cardId}/actions`, { method: 'POST', token, json: { action: 'sello' }, env: vars })

    const put = fetchMock.mock.calls.find(([input]) => String(input).includes('walletobjects'))!
    expect(String(put[0])).toBe(`https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${vars.GOOGLE_WALLET_ISSUER_ID}.${cardId}`)
    expect(put[1]!.method).toBe('PUT')
    expect(new Headers(put[1]!.headers).get('Authorization')).toBe('Bearer ya29.prueba')
    expect(JSON.parse(String(put[1]!.body)).header.defaultValue.value).toBe('1/8')
  })
})

describe('imágenes', () => {
  it('la tira de sellos y el ícono son PNG válidos', async () => {
    const { token, program } = await setupProgram('png@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    const strip = await call(`/public/cards/${cardId}/strip.png`)
    expect(strip.res.headers.get('Content-Type')).toBe('image/png')
    const bytes = new Uint8Array(await strip.res.arrayBuffer())
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]) // «PNG»
    const icon = await call(`/public/programs/${program.id}/icon.png`)
    expect(icon.status).toBe(200)
  })
})
