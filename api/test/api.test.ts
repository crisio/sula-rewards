import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { act, call, login, newCard, nextPhone, setupProgram } from './helpers'

const SELLOS = { type: 'sellos', name: 'Café de la casa', stamps_goal: 8, reward: 'Café gratis' }
const PUNTOS = { type: 'puntos', name: 'Puntos Sabor', points_per_100: 10, reward_points: 20, reward: 'Postre gratis' }
const CASHBACK = { type: 'cashback', name: 'Cashback', cashback_bp: 500 }
const GIFTCARD = { type: 'giftcard', name: 'Tarjeta de regalo' }

describe('login con código por correo', () => {
  it('rechaza el código incorrecto, entra con el correcto y el código no sirve dos veces', async () => {
    const email = 'dueno@cafe.hn'
    expect((await call('/auth/code', { method: 'POST', json: { email: ' Dueno@Cafe.hn ' } })).status).toBe(200)
    const { devOutbox } = await import('../src/email')
    const code = devOutbox.at(-1)!.subject.slice(0, 6)

    const wrong = await call('/auth/verify', { method: 'POST', json: { email, code: code === '000000' ? '111111' : '000000' } })
    expect(wrong.status).toBe(400)

    const ok = await call('/auth/verify', { method: 'POST', json: { email, code } })
    expect(ok.status).toBe(200)
    expect((await call('/me', { token: ok.data.token })).data.email).toBe(email)
    expect((await call('/auth/verify', { method: 'POST', json: { email, code } })).status).toBe(400)
  })

  it('la cuenta de revisión de la App Store entra con su código fijo y no se le manda correo', async () => {
    const review = { REVIEW_EMAIL: 'Revision@Sula.test', REVIEW_CODE: '482915' }
    const { devOutbox } = await import('../src/email')
    const sent = devOutbox.length
    expect((await call('/auth/code', { method: 'POST', json: { email: 'revision@sula.test' }, env: review })).status).toBe(200)
    expect(devOutbox.length).toBe(sent)

    const ok = await call('/auth/verify', { method: 'POST', json: { email: 'revision@sula.test', code: '482915' }, env: review })
    expect(ok.status).toBe(200)
    expect(ok.data.user.email).toBe('revision@sula.test')

    // Los demás correos siguen recibiendo un código al azar, y sin REVIEW_CODE válido no hay código fijo
    expect((await call('/auth/code', { method: 'POST', json: { email: 'otro@sula.test' }, env: review })).status).toBe(200)
    expect(devOutbox.length).toBe(sent + 1)
    await env.DB.prepare('DELETE FROM auth_codes').run()
    await call('/auth/code', { method: 'POST', json: { email: 'revision@sula.test' }, env: { ...review, REVIEW_CODE: '123' } })
    expect(devOutbox.length).toBe(sent + 2)
  })

  it('el panel exige sesión', async () => {
    expect((await call('/businesses')).status).toBe(401)
    expect((await call('/cards/ABCD/actions', { method: 'POST', json: {} })).status).toBe(401)
  })
})

describe('negocios y programas', () => {
  it('crea el negocio con su enlace público y no repite el slug', async () => {
    const a = await login('a@sps.hn')
    const b = await login('b@sps.hn')
    const first = await call('/businesses', { method: 'POST', token: a, json: { name: 'Baleadas Doña Tere' } })
    expect(first.data).toMatchObject({ name: 'Baleadas Doña Tere', slug: 'baleadas-dona-tere', city: 'San Pedro Sula' })
    const second = await call('/businesses', { method: 'POST', token: b, json: { name: 'Baleadas doña Tere' } })
    expect(second.status).toBe(201)
    expect(second.data.slug).toMatch(/^baleadas-dona-tere-\d{3}$/)
  })

  it('valida cada tipo de programa', async () => {
    const token = await login('valida@sps.hn')
    const { data: business } = await call('/businesses', { method: 'POST', token, json: { name: 'Valida' } })
    const create = (json: unknown) => call(`/businesses/${business.id}/programs`, { method: 'POST', token, json })
    expect((await create({ type: 'membresia', name: 'X' })).status).toBe(400)
    expect((await create({ ...SELLOS, stamps_goal: 1 })).data.error).toMatch(/entre 2 y 20/)
    expect((await create({ ...SELLOS, reward: '' })).data.error).toBe('Escribe el premio')
    expect((await create({ ...CASHBACK, cashback_bp: 9000 })).status).toBe(400)
    expect((await create({ ...SELLOS, color: 'rojo' })).status).toBe(400)

    const ok = await create(SELLOS)
    expect(ok.data).toMatchObject({ type: 'sellos', stamps_goal: 8, color: '#4f3fe0', points_per_100: null })
    const list = await call(`/businesses/${business.id}/programs`, { token })
    expect(list.data).toMatchObject([{ id: ok.data.id, cards: 0 }])
  })

  it('cada negocio solo ve lo suyo', async () => {
    const { token, business, program } = await setupProgram('mio@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    const other = await login('ajeno@sps.hn')
    expect((await call(`/businesses/${business.id}/programs`, { token: other })).status).toBe(404)
    expect((await call(`/programs/${program.id}/cards`, { token: other })).status).toBe(404)
    expect((await call(`/cards/${cardId}`, { token: other })).status).toBe(404)
    expect((await act(other, cardId, { action: 'sello' })).status).toBe(404)
  })
})

describe('página pública para unirse', () => {
  it('muestra los programas abiertos (sin gift cards) y crea la tarjeta', async () => {
    const { token, business, program } = await setupProgram('unete@sps.hn', SELLOS)
    await call(`/businesses/${business.id}/programs`, { method: 'POST', token, json: GIFTCARD })

    const page = await call(`/public/b/${business.slug}`)
    expect(page.data.programs.map((p: { type: string }) => p.type)).toEqual(['sellos'])

    const phone = '+504 9876-5432'
    const join = await call(`/public/b/${business.slug}/join`, { method: 'POST', json: { program_id: program.id, customer_name: 'Andrea Pérez', phone } })
    expect(join.status).toBe(201)
    expect(join.data.id).toMatch(/^[0-9A-Z]{12}$/)

    const card = await call(`/public/cards/${join.data.id}`)
    expect(card.data).toMatchObject({ customer_name: 'Andrea Pérez', headline: { label: 'SELLOS', value: '0/8' }, business: { name: business.name } })
    expect(card.data.phone).toBeUndefined()
    expect(card.data.status).toBe('Te faltan 8 sellos para: Café gratis')

    // El mismo número no saca otra tarjeta (ni ve la de alguien más)
    const again = await call(`/public/b/${business.slug}/join`, { method: 'POST', json: { program_id: program.id, customer_name: 'Otra', phone: '98765432' } })
    expect(again.status).toBe(409)
    expect(again.data.error).toMatch(/Pídela en caja/)

    expect((await call(`/public/b/${business.slug}/join`, { method: 'POST', json: { program_id: program.id, customer_name: 'Ana', phone: '12345678' } })).status).toBe(400)
  })
})

describe('sellos', () => {
  it('al completar la meta suma un premio y vuelve a empezar; el canje lo descuenta', async () => {
    const { token, program } = await setupProgram('sellos@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)

    const one = await act(token, cardId, { action: 'sello' })
    expect(one.data).toMatchObject({ stamps: 1, rewards: 0, headline: { value: '1/8' } })

    await act(token, cardId, { action: 'sello', count: 6 })
    const full = await act(token, cardId, { action: 'sello' })
    expect(full.data).toMatchObject({ stamps: 0, rewards: 1, result: { stamps: 1, rewards: 1 }, status: '¡Ganaste un premio! Café gratis' })

    // Pasarse de la meta en un solo movimiento: el sobrante cuenta para la siguiente
    const over = await act(token, cardId, { action: 'sello', count: 10 })
    expect(over.data).toMatchObject({ stamps: 2, rewards: 2 })

    expect((await act(token, cardId, { action: 'canje' })).data.rewards).toBe(1)
    expect((await act(token, cardId, { action: 'canje' })).data.rewards).toBe(0)
    const none = await act(token, cardId, { action: 'canje' })
    expect(none.status).toBe(409)
    expect(none.data.error).toMatch(/no tiene premios/)

    expect((await act(token, cardId, { action: 'sello', count: 11 })).status).toBe(400)
    expect((await act(token, cardId, { action: 'compra', amount_cents: 1000 })).status).toBe(400)

    // Los enteros se guardan como enteros (nada de 0.125 premios)
    const row = await env.DB.prepare('SELECT typeof(stamps) AS s, typeof(rewards) AS r FROM cards WHERE id = ?').bind(cardId).first()
    expect(row).toEqual({ s: 'integer', r: 'integer' })

    const detail = await call(`/cards/${cardId}`, { token })
    expect(detail.data.movements.map((m: { kind: string; stamps: number; rewards: number }) => [m.kind, m.stamps, m.rewards])).toEqual([
      ['canje', 0, -1],
      ['canje', 0, -1],
      ['sello', 10, 1],
      ['sello', 1, 1],
      ['sello', 6, 0],
      ['sello', 1, 0],
      ['alta', 0, 0],
    ])
  })

  it('el código se puede escribir a mano en caja, con guiones y minúsculas', async () => {
    const { token, program } = await setupProgram('codigo@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    const typed = cardId.toLowerCase().replace(/(.{4})(?!$)/g, '$1-')
    expect((await call(`/cards/${typed}`, { token })).data.id).toBe(cardId)
  })

  it('un programa pausado no acepta movimientos', async () => {
    const { token, program } = await setupProgram('pausa@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    await call(`/programs/${program.id}`, { method: 'PATCH', token, json: { active: false } })
    expect((await act(token, cardId, { action: 'sello' })).status).toBe(409)
  })
})

describe('puntos', () => {
  it('suma puntos por cada L 100 y canjea el premio si alcanza', async () => {
    const { token, program } = await setupProgram('puntos@sps.hn', PUNTOS)
    const cardId = await newCard(token, program.id)

    const buy = await act(token, cardId, { action: 'compra', amount_cents: 25_099 }) // L 250.99 → 25 puntos
    expect(buy.data).toMatchObject({ points: 25, result: { points: 25 }, headline: { label: 'PUNTOS', value: '25' }, status: '¡Ya puedes canjear! Postre gratis' })

    expect((await act(token, cardId, { action: 'canje' })).data.points).toBe(5)
    const short = await act(token, cardId, { action: 'canje' })
    expect(short.status).toBe(409)
    expect(short.data.error).toBe('Le faltan puntos: el premio cuesta 20')

    expect((await act(token, cardId, { action: 'compra', amount_cents: 0 })).status).toBe(400)
    expect((await act(token, cardId, { action: 'compra', amount_cents: 12.5 })).status).toBe(400)
  })
})

describe('cashback', () => {
  it('devuelve el % de cada compra como saldo y no deja usar más de lo que hay', async () => {
    const { token, program } = await setupProgram('cashback@sps.hn', CASHBACK)
    const cardId = await newCard(token, program.id)

    const buy = await act(token, cardId, { action: 'compra', amount_cents: 24_800 }) // 5 % de L 248.00
    expect(buy.data).toMatchObject({ balance_cents: 1240, headline: { label: 'CASHBACK 5%', value: 'L 12.40' } })

    expect((await act(token, cardId, { action: 'uso', amount_cents: 2000 })).status).toBe(409)
    expect((await act(token, cardId, { action: 'uso', amount_cents: 1000 })).data.balance_cents).toBe(240)
  })
})

describe('gift cards', () => {
  it('sale de caja con saldo, se consume y se recarga', async () => {
    const { token, program } = await setupProgram('gift@sps.hn', GIFTCARD)
    const cardId = await newCard(token, program.id, { initial_cents: 50_000 })

    const pub = await call(`/public/cards/${cardId}`)
    expect(pub.data.headline).toEqual({ label: 'GIFT CARD', value: 'L 500.00' })

    expect((await act(token, cardId, { action: 'uso', amount_cents: 12_550 })).data.balance_cents).toBe(37_450)
    expect((await act(token, cardId, { action: 'recarga', amount_cents: 10_000 })).data.headline.value).toBe('L 474.50')
    expect((await act(token, cardId, { action: 'recarga', amount_cents: 100_000_000 })).status).toBe(409)
    expect((await act(token, cardId, { action: 'sello' })).status).toBe(400)
  })
})

describe('buscar clientes', () => {
  it('por nombre, por teléfono o por código', async () => {
    const { token, program } = await setupProgram('buscar@sps.hn', SELLOS)
    const phone = nextPhone()
    const id = await newCard(token, program.id, { customer_name: 'Marvin Castillo', phone })
    await newCard(token, program.id, { customer_name: 'Gabriela Mejía' })

    const names = async (q: string) => (await call(`/programs/${program.id}/cards?q=${encodeURIComponent(q)}`, { token })).data.map((c: { customer_name: string }) => c.customer_name)
    expect(await names('marvin')).toEqual(['Marvin Castillo'])
    expect(await names(phone.slice(-4))).toEqual(['Marvin Castillo'])
    expect(await names(id.toLowerCase())).toEqual(['Marvin Castillo'])
    expect(await names('')).toEqual(['Gabriela Mejía', 'Marvin Castillo'])
  })
})

describe('borrar la cuenta', () => {
  it('borra la cuenta con sus negocios, programas, tarjetas y movimientos, y no toca lo de otros', async () => {
    const { token, business, program } = await setupProgram('borrar@sps.hn', SELLOS)
    const cardId = await newCard(token, program.id)
    await act(token, cardId, { action: 'sello' })
    const other = await setupProgram('se-queda@sps.hn', SELLOS)
    const otherCard = await newCard(other.token, other.program.id)

    expect((await call('/me', { method: 'DELETE' })).status).toBe(401)
    const res = await call('/me', { method: 'DELETE', token })
    expect(res.status).toBe(200)
    expect(res.data).toEqual({ ok: true })

    expect((await call('/me', { token })).status).toBe(401)
    const count = async (sql: string, id: string) => (await env.DB.prepare(sql).bind(id).first<number>('n')) ?? 0
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', 'borrar@sps.hn')).toBe(0)
    expect(await count('SELECT COUNT(*) AS n FROM businesses WHERE id = ?', business.id)).toBe(0)
    expect(await count('SELECT COUNT(*) AS n FROM programs WHERE id = ?', program.id)).toBe(0)
    expect(await count('SELECT COUNT(*) AS n FROM cards WHERE id = ?', cardId)).toBe(0)
    expect(await count('SELECT COUNT(*) AS n FROM movements WHERE card_id = ?', cardId)).toBe(0)
    expect((await call(`/public/cards/${cardId}`)).status).toBe(404)
    expect((await call(`/public/b/${business.slug}`)).status).toBe(404)

    // El otro negocio sigue igual
    expect((await call(`/cards/${otherCard}`, { token: other.token })).data.id).toBe(otherCard)

    // Con el mismo correo se puede volver a entrar: es una cuenta nueva, sin negocios
    const again = await login('borrar@sps.hn')
    expect((await call('/businesses', { token: again })).data).toEqual([])
  })
})
