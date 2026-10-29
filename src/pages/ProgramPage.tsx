import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PanelBar from '../components/PanelBar'
import { TypeIcon } from '../components/Icons'
import { api } from '../lib/api'
import { formatPhone, lempiras, parseLempiras, TYPE_LABEL } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { CardRow, ProgramDetail } from '../lib/types'

function rules(p: ProgramDetail) {
  switch (p.type) {
    case 'sellos':
      return `${p.stamps_goal} sellos = ${p.reward}`
    case 'puntos':
      return `${p.points_per_100} puntos por cada L 100 · ${p.reward_points?.toLocaleString('en-US')} puntos = ${p.reward}`
    case 'cashback':
      return `${(p.cashback_bp ?? 0) / 100}% de cada compra regresa como saldo`
    case 'giftcard':
      return 'Saldo de regalo que se cobra en caja'
  }
}

function NewCustomer({ program }: { program: ProgramDetail }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isGift = program.type === 'giftcard'

  async function submit(e: FormEvent) {
    e.preventDefault()
    const initialCents = isGift ? parseLempiras(amount) : null
    if (isGift && !initialCents) return setError('Escribe el saldo de la gift card')
    setBusy(true)
    setError(null)
    try {
      const card = await api<{ id: string }>(`/programs/${program.id}/cards`, {
        method: 'POST',
        json: { customer_name: name, phone, ...(initialCents && { initial_cents: initialCents }) },
      })
      navigate(`/panel/tarjetas/${card.id}?nueva=1`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>{isGift ? 'Vender gift card' : 'Nuevo cliente'}</h2>
      <label className="field">
        <span>Nombre</span>
        <input className="input" required maxLength={60} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gabriela Mejía" />
      </label>
      <label className="field">
        <span>Celular</span>
        <div className="input-prefix">
          <span>+504</span>
          <input className="input" required inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876-5432" />
        </div>
      </label>
      {isGift && (
        <label className="field">
          <span>Saldo</span>
          <div className="input-prefix">
            <span>L</span>
            <input className="input" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" />
          </div>
        </label>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Creando…' : 'Crear tarjeta'}
      </button>
    </form>
  )
}

function Customers({ programId }: { programId: string }) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  // Busca 300 ms después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  const { data: cards, error } = useApi<CardRow[]>(`/programs/${programId}/cards${query ? `?q=${encodeURIComponent(query)}` : ''}`)

  return (
    <div className="panel stack">
      <h2>Clientes</h2>
      <input className="input" type="search" aria-label="Buscar cliente" placeholder="Buscar por nombre, celular o código" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="notice notice-error">{error}</p>}
      {cards && cards.length === 0 && <p className="muted">{query ? 'Nadie con esa búsqueda.' : 'Todavía no hay clientes.'}</p>}
      {cards && cards.length > 0 && (
        <ul className="list">
          {cards.map((card) => (
            <li key={card.id}>
              <Link className="list-item" to={`/panel/tarjetas/${card.id}`}>
                <span>
                  <strong>{card.customer_name}</strong>
                  <span className="small muted">
                    {formatPhone(card.phone)} · {card.code}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <strong>{card.headline.value}</strong>
                  {card.rewards > 0 && <span className="badge">🎁 {card.rewards}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ProgramPage() {
  const { id } = useParams()
  const { data: program, error, setData } = useApi<ProgramDetail>(`/programs/${id}`)
  const [toggling, setToggling] = useState(false)

  async function toggleActive() {
    if (!program) return
    setToggling(true)
    try {
      const next = await api<ProgramDetail>(`/programs/${program.id}`, { method: 'PATCH', json: { active: !program.active } })
      setData({ ...program, active: next.active })
    } catch {
      // se queda como estaba
    }
    setToggling(false)
  }

  return (
    <main className="page narrow">
      <PanelBar back="/panel" title="Panel" />
      {error && <p className="notice notice-error">{error}</p>}
      {program && (
        <div className="stack">
          <div className="panel stack" style={{ gap: 12 }}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="wcard-icon" style={{ background: program.color, color: '#fff', width: 44, height: 44 }}>
                <TypeIcon type={program.type} size={24} />
              </span>
              <div>
                <h1 style={{ fontSize: 24 }}>{program.name}</h1>
                <span className="small muted">
                  {TYPE_LABEL[program.type]} · {program.business.name}
                </span>
              </div>
            </div>
            <p style={{ margin: 0 }}>{rules(program)}</p>
            <div className="row" style={{ gap: 24 }}>
              <span className="stat">
                <b>{program.stats.cards}</b>
                <span className="small muted">clientes</span>
              </span>
              {program.type === 'sellos' && (
                <span className="stat">
                  <b>{program.stats.rewards_pending}</b>
                  <span className="small muted">premios por canjear</span>
                </span>
              )}
              {(program.type === 'cashback' || program.type === 'giftcard') && (
                <span className="stat">
                  <b>{lempiras(program.stats.balance_cents)}</b>
                  <span className="small muted">saldo de clientes</span>
                </span>
              )}
            </div>
            <div className="row spread">
              <span className="small muted">{program.active ? 'Activo' : 'Pausado: no acepta clientes ni movimientos'}</span>
              <button className="btn btn-ghost" disabled={toggling} onClick={toggleActive}>
                {program.active ? 'Pausar' : 'Reactivar'}
              </button>
            </div>
          </div>
          {!!program.active && <NewCustomer program={program} />}
          <Customers programId={program.id} />
        </div>
      )}
    </main>
  )
}
