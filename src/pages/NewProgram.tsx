import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PanelBar from '../components/PanelBar'
import WalletCard from '../components/WalletCard'
import { TypeIcon } from '../components/Icons'
import { api } from '../lib/api'
import { useBusinesses } from '../lib/business'
import { DEFAULT_COLOR, lempiras, TYPE_LABEL } from '../lib/format'
import type { Headline, Program, ProgramType } from '../lib/types'

const SWATCHES = ['#4f3fe0', '#f2820f', '#16a34a', '#2e2b38', '#d92d6b', '#0e7490', '#b45309', '#7c3aed']

const HINT: Record<ProgramType, string> = {
  sellos: 'Un sello por visita o por compra',
  puntos: 'Puntos según lo que gastan',
  cashback: 'Un % de vuelta en saldo',
  giftcard: 'Saldo de regalo para cobrar',
}

const DEFAULT_NAME: Record<ProgramType, string> = {
  sellos: 'Tarjeta de sellos',
  puntos: 'Puntos',
  cashback: 'Cashback',
  giftcard: 'Gift card',
}

export default function NewProgram() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { businesses, current } = useBusinesses()
  const business = businesses?.find((b) => b.id === params.get('negocio')) ?? current

  const [type, setType] = useState<ProgramType>('sellos')
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [stampsGoal, setStampsGoal] = useState(8)
  const [reward, setReward] = useState('')
  const [pointsPer100, setPointsPer100] = useState(10)
  const [rewardPoints, setRewardPoints] = useState(100)
  const [cashbackPct, setCashbackPct] = useState('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardColor = color ?? DEFAULT_COLOR[type]
  const cashbackBp = Math.round(Number(cashbackPct) * 100)
  const preview: Headline = {
    sellos: { label: 'Sellos', value: `3/${stampsGoal}` },
    puntos: { label: 'Puntos', value: '250' },
    cashback: { label: `Cashback ${cashbackPct || 0}%`, value: lempiras(1240) },
    giftcard: { label: 'Gift card', value: lempiras(50000) },
  }[type]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!business) return
    setBusy(true)
    setError(null)
    try {
      const program = await api<Program>(`/businesses/${business.id}/programs`, {
        method: 'POST',
        json: {
          type,
          name: name.trim() || DEFAULT_NAME[type],
          color: cardColor,
          ...(type === 'sellos' && { stamps_goal: stampsGoal, reward }),
          ...(type === 'puntos' && { points_per_100: pointsPer100, reward_points: rewardPoints, reward }),
          ...(type === 'cashback' && { cashback_bp: cashbackBp }),
        },
      })
      navigate(`/panel/programas/${program.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="page narrow">
      <PanelBar back="/panel" title="Panel" />
      <form className="stack" onSubmit={submit}>
        <h1 style={{ fontSize: 28 }}>Nuevo programa</h1>

        <div className="type-picker" role="group" aria-label="Tipo de programa">
          {(Object.keys(TYPE_LABEL) as ProgramType[]).map((t) => (
            <button
              key={t}
              type="button"
              className="type-option"
              aria-pressed={type === t}
              onClick={() => {
                setType(t)
                setColor(null)
              }}
            >
              <span style={{ color: DEFAULT_COLOR[t] }}>
                <TypeIcon type={t} size={22} />
              </span>
              <strong>{TYPE_LABEL[t]}</strong>
              <span className="small muted">{HINT[t]}</span>
            </button>
          ))}
        </div>

        <WalletCard
          type={type}
          color={cardColor}
          businessName={business?.name ?? 'Tu negocio'}
          headline={preview}
          stamps={3}
          stampsGoal={stampsGoal}
          customerName="Gabriela Mejía"
          reward={type === 'sellos' || type === 'puntos' ? reward || 'Tu premio' : null}
          logoUrl={business?.logo_url}
        />

        <div className="panel stack">
          <label className="field">
            <span>Nombre del programa</span>
            <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_NAME[type]} />
          </label>

          {type === 'sellos' && (
            <>
              <label className="field">
                <span>Sellos para el premio: {stampsGoal}</span>
                <input type="range" min={2} max={20} value={stampsGoal} onChange={(e) => setStampsGoal(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Premio</span>
                <input className="input" required maxLength={40} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Café gratis" />
              </label>
            </>
          )}

          {type === 'puntos' && (
            <>
              <label className="field">
                <span>Puntos por cada L 100 de compra</span>
                <input className="input" type="number" min={1} max={1000} required value={pointsPer100} onChange={(e) => setPointsPer100(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Puntos para el premio</span>
                <input className="input" type="number" min={1} required value={rewardPoints} onChange={(e) => setRewardPoints(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Premio</span>
                <input className="input" required maxLength={40} value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Baleada sencilla gratis" />
              </label>
              {pointsPer100 > 0 && rewardPoints > 0 && (
                <p className="small muted" style={{ margin: 0 }}>
                  Tu cliente gana el premio al gastar unos {lempiras(Math.ceil(rewardPoints / pointsPer100) * 10000)}.
                </p>
              )}
            </>
          )}

          {type === 'cashback' && (
            <label className="field">
              <span>Porcentaje de cashback</span>
              <div className="input-suffix">
                <input className="input" inputMode="decimal" required value={cashbackPct} onChange={(e) => setCashbackPct(e.target.value.replace(/[^\d.]/g, ''))} />
                <span>%</span>
              </div>
              <span className="small muted">En una compra de L 500 le regresan {lempiras(Math.floor(50000 * (cashbackBp || 0) / 10000))}.</span>
            </label>
          )}

          {type === 'giftcard' && (
            <p className="muted" style={{ margin: 0 }}>
              Las gift cards se crean en caja con el saldo que pagó el cliente, y se cobran escaneando su QR.
            </p>
          )}

          <div className="field">
            <span>Color de la tarjeta</span>
            <div className="swatches">
              {SWATCHES.map((s) => (
                <button key={s} type="button" className="swatch" style={{ background: s }} aria-label={`Color ${s}`} aria-pressed={cardColor === s} onClick={() => setColor(s)} />
              ))}
            </div>
          </div>
        </div>

        {error && <p className="notice notice-error">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy || !business}>
          {busy ? 'Creando…' : 'Crear programa'}
        </button>
      </form>
    </main>
  )
}
