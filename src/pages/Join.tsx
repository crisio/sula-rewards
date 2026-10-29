import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import WalletCard from '../components/WalletCard'
import { api } from '../lib/api'
import { formatDay, lempiras } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { CardView, Headline, PublicBusiness } from '../lib/types'

function startHeadline(p: CardView['program']): Headline {
  switch (p.type) {
    case 'sellos':
      return { label: 'Sellos', value: `0/${p.stamps_goal}` }
    case 'puntos':
      return { label: 'Puntos', value: '0' }
    case 'cashback':
      return { label: `Cashback ${(p.cashback_bp ?? 0) / 100}%`, value: lempiras(0) }
    case 'giftcard':
      return { label: 'Gift card', value: lempiras(0) }
  }
}

function pitch(p: CardView['program']) {
  switch (p.type) {
    case 'sellos':
      return `Junta ${p.stamps_goal} sellos y llévate: ${p.reward}`
    case 'puntos':
      return `Gana ${p.points_per_100} puntos por cada L 100. Con ${p.reward_points?.toLocaleString('en-US')}: ${p.reward}`
    case 'cashback':
      return `Te regresamos ${(p.cashback_bp ?? 0) / 100}% de cada compra para tu próxima visita`
    case 'giftcard':
      return ''
  }
}

/** Página pública /unete/<negocio>: la abre el QR del mostrador. */
export default function Join() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: business, error } = useApi<PublicBusiness>(`/public/b/${encodeURIComponent(slug ?? '')}`)
  const [chosen, setChosen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const program = business?.programs.find((p) => p.id === chosen) ?? business?.programs[0]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!program) return
    setBusy(true)
    setFormError(null)
    try {
      const card = await api<{ id: string }>(`/public/b/${business!.slug}/join`, { method: 'POST', json: { program_id: program.id, customer_name: name, phone } })
      navigate(`/tarjeta/${card.id}?nueva=1`, { replace: true })
    } catch (err) {
      setFormError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page narrow" style={{ paddingTop: 24 }}>
      {error && <p className="notice notice-error">{error}</p>}
      {!business && !error && <p className="muted center">Cargando…</p>}
      {business && (
        <div className="stack">
          <div className="center stack" style={{ gap: 4, justifyItems: 'center' }}>
            {business.logo_url ? <img className="biz-logo" src={business.logo_url} alt="" style={{ marginBottom: 4 }} /> : <LogoMark size={40} />}
            <h1 style={{ fontSize: 30 }}>{business.name}</h1>
            <span className="muted">{[business.category, business.city].filter(Boolean).join(' · ')}</span>
          </div>

          {!program ? (
            <p className="panel muted center">Este negocio todavía no tiene programas abiertos.</p>
          ) : (
            <>
              {business.programs.length > 1 && (
                <div className="type-picker" role="group" aria-label="Programa">
                  {business.programs.map((p) => (
                    <button key={p.id} type="button" className="type-option" aria-pressed={p.id === program.id} onClick={() => setChosen(p.id)}>
                      <strong>{p.name}</strong>
                    </button>
                  ))}
                </div>
              )}
              <WalletCard
                type={program.type}
                color={program.color}
                businessName={business.name}
                headline={startHeadline(program)}
                stamps={0}
                stampsGoal={program.stamps_goal}
                customerName={name.trim() || 'Tu nombre'}
                reward={program.reward}
                logoUrl={business.logo_url}
              />
              <p className="center" style={{ margin: 0, fontWeight: 600 }}>
                {pitch(program)}
              </p>
              <form className="panel stack" onSubmit={submit}>
                <h2>Únete gratis</h2>
                <label className="field">
                  <span>Tu nombre</span>
                  <input className="input" required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gabriela Mejía" />
                </label>
                <label className="field">
                  <span>Tu celular</span>
                  <div className="input-prefix">
                    <span>+504</span>
                    <input className="input" required inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876-5432" />
                  </div>
                </label>
                {formError && <p className="notice notice-error">{formError}</p>}
                <button className="btn btn-primary btn-big" disabled={busy}>
                  {busy ? 'Creando tu tarjeta…' : 'Crear mi tarjeta'}
                </button>
                <p className="small muted" style={{ margin: 0 }}>
                  {business.name} guarda tu nombre y celular solo para tu tarjeta de cliente.
                </p>
              </form>
            </>
          )}

          {business.promotions && business.promotions.length > 0 && (
            <div className="panel stack" style={{ gap: 12 }}>
              <h2>Promociones</h2>
              <ul className="list">
                {business.promotions.map((promo) => (
                  <li key={promo.id} className="list-item" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                    <strong>{promo.title}</strong>
                    {promo.body && <span style={{ display: 'block' }}>{promo.body}</span>}
                    {promo.ends_on && <span className="small muted">Hasta el {formatDay(promo.ends_on)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
