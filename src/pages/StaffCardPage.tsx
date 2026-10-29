import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import PanelBar from '../components/PanelBar'
import WalletCard from '../components/WalletCard'
import { api } from '../lib/api'
import { appUrl, formatDateTime, formatPhone, lempiras, parseLempiras, whatsappUrl } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { Movement, StaffCard } from '../lib/types'

type Action = 'sello' | 'compra' | 'canje' | 'uso' | 'recarga'

function describe(m: Movement) {
  switch (m.kind) {
    case 'alta':
      return m.cents ? `Tarjeta creada con ${lempiras(m.cents)}` : 'Tarjeta creada'
    case 'sello':
      return `+${m.stamps} ${m.stamps === 1 ? 'sello' : 'sellos'}${m.rewards ? ` · ¡${m.rewards === 1 ? 'premio' : `${m.rewards} premios`}!` : ''}`
    case 'compra':
      return `Compra de ${lempiras(m.purchase_cents ?? 0)} · ${m.points ? `+${m.points.toLocaleString('en-US')} puntos` : `+${lempiras(m.cents)}`}`
    case 'canje':
      return m.points ? `Canjeó premio (−${(-m.points).toLocaleString('en-US')} puntos)` : 'Canjeó premio'
    case 'uso':
      return `Usó ${lempiras(-m.cents)}`
    case 'recarga':
      return `Recarga de ${lempiras(m.cents)}`
  }
}

/** Mensaje corto después de cada movimiento. */
function feedback(card: StaffCard) {
  const r = card.result!
  if (r.kind === 'sello') return r.rewards > 0 ? `¡Premio desbloqueado! ${card.program.reward}` : `Sello agregado: ${card.headline.value}`
  if (r.kind === 'canje') return 'Premio canjeado'
  if (r.kind === 'compra') return r.points ? `+${r.points.toLocaleString('en-US')} puntos` : `+${lempiras(r.cents)} de cashback`
  if (r.kind === 'uso') return `Cobrado: ${lempiras(-r.cents)}. Queda ${lempiras(card.balance_cents)}`
  return `Recarga lista: ${lempiras(card.balance_cents)}`
}

function AmountForm({ label, button, onSubmit, busy, preview }: { label: string; button: string; onSubmit: (cents: number) => Promise<boolean>; busy: boolean; preview?: (cents: number) => string }) {
  const [value, setValue] = useState('')
  const cents = parseLempiras(value)
  return (
    <form
      className="stack"
      style={{ gap: 8 }}
      onSubmit={async (e: FormEvent) => {
        e.preventDefault()
        if (cents && (await onSubmit(cents))) setValue('')
      }}
    >
      <label className="field">
        <span>{label}</span>
        <div className="input-prefix">
          <span>L</span>
          <input className="input" inputMode="decimal" placeholder="0.00" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </label>
      {cents && preview && <span className="small muted">{preview(cents)}</span>}
      <button className="btn btn-primary" disabled={busy || !cents}>
        {button}
      </button>
    </form>
  )
}

export default function StaffCardPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data: card, error, setData, reload } = useApi<StaffCard>(`/cards/${encodeURIComponent(id ?? '')}`)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function run(action: Action, extra: Record<string, unknown> = {}) {
    if (!card) return false
    setBusy(true)
    setActionError(null)
    try {
      const next = await api<StaffCard>(`/cards/${card.id}/actions`, { method: 'POST', json: { action, ...extra } })
      setData({ ...next, movements: card.movements })
      setToast(feedback(next))
      void reload() // trae el historial con el movimiento nuevo
      setBusy(false)
      return true
    } catch (err) {
      setActionError((err as Error).message)
      setBusy(false)
      return false
    }
  }

  if (error) {
    return (
      <main className="page narrow">
        <PanelBar back="/panel" title="Panel" />
        <p className="notice notice-error">{error}</p>
      </main>
    )
  }
  if (!card) {
    return (
      <main className="page narrow">
        <PanelBar back="/panel" title="Panel" />
        <p className="muted">Cargando…</p>
      </main>
    )
  }

  const p = card.program
  const link = appUrl(`tarjeta/${card.id}`)
  const message = `¡Hola ${card.customer_name.split(' ')[0]}! Esta es tu tarjeta de ${card.business.name}. Guárdala en tu Wallet: ${link}`

  return (
    <main className="page narrow">
      <PanelBar back={`/panel/programas/${p.id}`} title={p.name} />
      <div className="stack">
        {params.get('nueva') && <p className="notice notice-success">Tarjeta creada. Mándasela por WhatsApp para que la guarde en su Wallet.</p>}
        <WalletCard
          type={p.type}
          color={p.color}
          businessName={card.business.name}
          headline={card.headline}
          stamps={card.stamps}
          stampsGoal={p.stamps_goal}
          customerName={card.customer_name}
          reward={p.reward}
          logoUrl={card.business.logo_url}
        />
        <p className="center" style={{ margin: 0, fontWeight: 600 }}>
          {card.status}
        </p>

        <div className="panel stack">
          {p.type === 'sellos' && (
            <>
              <button className="btn btn-primary btn-big btn-block" disabled={busy} onClick={() => run('sello')}>
                +1 sello
              </button>
              <div className="row">
                {[2, 3].map((n) => (
                  <button key={n} className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => run('sello', { count: n })}>
                    +{n} sellos
                  </button>
                ))}
              </div>
              {card.rewards > 0 && (
                <button className="btn btn-big btn-block" style={{ background: p.color, color: '#fff' }} disabled={busy} onClick={() => run('canje')}>
                  Canjear premio: {p.reward}
                </button>
              )}
            </>
          )}

          {p.type === 'puntos' && (
            <>
              <AmountForm
                label="Monto de la compra"
                button="Sumar puntos"
                busy={busy}
                preview={(cents) => `= ${Math.floor((cents * (p.points_per_100 ?? 0)) / 10000).toLocaleString('en-US')} puntos`}
                onSubmit={(cents) => run('compra', { amount_cents: cents })}
              />
              <button className="btn btn-ghost btn-block" disabled={busy || card.points < (p.reward_points ?? 0)} onClick={() => run('canje')}>
                Canjear {p.reward} ({p.reward_points?.toLocaleString('en-US')} puntos)
              </button>
            </>
          )}

          {p.type === 'cashback' && (
            <>
              <AmountForm
                label="Monto de la compra"
                button="Registrar compra"
                busy={busy}
                preview={(cents) => `Gana ${lempiras(Math.floor((cents * (p.cashback_bp ?? 0)) / 10000))} de cashback`}
                onSubmit={(cents) => run('compra', { amount_cents: cents })}
              />
              {card.balance_cents > 0 && (
                <AmountForm label={`Pagar con su saldo (tiene ${lempiras(card.balance_cents)})`} button="Usar saldo" busy={busy} onSubmit={(cents) => run('uso', { amount_cents: cents })} />
              )}
            </>
          )}

          {p.type === 'giftcard' && (
            <>
              <AmountForm label={`Cobrar con la gift card (tiene ${lempiras(card.balance_cents)})`} button="Cobrar" busy={busy} onSubmit={(cents) => run('uso', { amount_cents: cents })} />
              <AmountForm label="Recargar saldo" button="Recargar" busy={busy} onSubmit={(cents) => run('recarga', { amount_cents: cents })} />
            </>
          )}

          {actionError && <p className="notice notice-error">{actionError}</p>}
        </div>

        <div className="panel stack">
          <h2>Cliente</h2>
          <p style={{ margin: 0 }}>
            {card.customer_name} · {formatPhone(card.phone)}
            <br />
            <span className="small muted">Código {card.code}</span>
          </p>
          <div className="row">
            <a className="btn btn-primary" href={whatsappUrl(card.phone, message)} target="_blank" rel="noreferrer">
              Mandar tarjeta por WhatsApp
            </a>
            <a className="btn btn-ghost" href={link} target="_blank" rel="noreferrer">
              Ver como cliente
            </a>
          </div>
        </div>

        {card.movements && card.movements.length > 0 && (
          <div className="panel stack">
            <h2>Movimientos</h2>
            <ul className="list">
              {card.movements.map((m) => (
                <li key={m.id} className="list-item">
                  <span>{describe(m)}</span>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(m.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  )
}
