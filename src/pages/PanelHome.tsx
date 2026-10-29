import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PanelBar from '../components/PanelBar'
import Qr from '../components/Qr'
import { TypeIcon } from '../components/Icons'
import { LogoMark } from '../components/Logo'
import { api } from '../lib/api'
import { useBusinesses } from '../lib/business'
import { appUrl, TYPE_LABEL } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { Business, Program } from '../lib/types'

const CATEGORIES = ['Cafetería', 'Restaurante', 'Baleadas', 'Panadería', 'Salón de belleza', 'Barbería', 'Farmacia', 'Boutique', 'Supermercado', 'Gimnasio', 'Otro']

function CreateBusiness({ onCreated }: { onCreated: (b: Business) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api<Business>('/businesses', { method: 'POST', json: { name, category: category || undefined } }))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div>
        <h2>¿Cómo se llama tu negocio?</h2>
        <p className="muted" style={{ margin: 0 }}>
          Así aparece en la tarjeta de tus clientes.
        </p>
      </div>
      <label className="field">
        <span>Nombre</span>
        <input className="input" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder="Café Guamilito" />
      </label>
      <label className="field">
        <span>Giro</span>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Elige uno (opcional)</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {error && <p className="notice notice-error">{error}</p>}
      <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
        {busy ? 'Creando…' : 'Crear mi negocio'}
      </button>
    </form>
  )
}

function FindCard() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) navigate(`/panel/tarjetas/${encodeURIComponent(code.trim())}`)
      }}
    >
      <input
        className="input"
        style={{ flex: 1, minWidth: 180, textTransform: 'uppercase' }}
        aria-label="Código de la tarjeta"
        placeholder="Código: K7M2-Q9XD-3F8A"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button className="btn btn-ghost">Abrir</button>
    </form>
  )
}

function Programs({ business }: { business: Business }) {
  const { data: programs, error } = useApi<Program[]>(`/businesses/${business.id}/programs`)
  if (error) return <p className="notice notice-error">{error}</p>
  if (!programs) return <p className="muted">Cargando programas…</p>
  return (
    <div className="panel stack">
      <div className="row spread">
        <h2>Tus programas</h2>
        <Link className="btn btn-primary" to={`/panel/programas/nuevo?negocio=${business.id}`}>
          + Nuevo programa
        </Link>
      </div>
      {programs.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Todavía no tienes programas. Crea el primero: por ejemplo, 8 sellos y el noveno café gratis.
        </p>
      ) : (
        <ul className="list">
          {programs.map((p) => (
            <li key={p.id}>
              <Link className="list-item" to={`/panel/programas/${p.id}`}>
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="wcard-icon" style={{ background: p.color, color: '#fff' }}>
                    <TypeIcon type={p.type} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="small muted">
                      {TYPE_LABEL[p.type]} · {p.cards ?? 0} {p.cards === 1 ? 'cliente' : 'clientes'}
                      {!p.active && ' · pausado'}
                    </span>
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** El QR para que los clientes se unan, y el cartel para imprimirlo. */
function JoinPoster({ business }: { business: Business }) {
  const url = appUrl(`unete/${business.slug}`)
  const [copied, setCopied] = useState(false)
  return (
    <>
      <div className="panel stack no-print">
        <div>
          <h2>Cartel para el mostrador</h2>
          <p className="muted" style={{ margin: 0 }}>
            Tus clientes escanean este QR, ponen su nombre y celular, y guardan su tarjeta.
          </p>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="qr-box" style={{ width: 180 }}>
            <Qr value={url} alt={`QR para unirse a ${business.name}`} size={320} />
          </div>
          <div className="stack" style={{ flex: 1, minWidth: 200 }}>
            <a className="small" href={url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
              {url}
            </a>
            <div className="row">
              <button className="btn btn-primary" onClick={() => window.print()}>
                Imprimir cartel
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => setCopied(true))
                }}
              >
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="print-only">
        <LogoMark size={64} />
        <h1>{business.name}</h1>
        <p style={{ fontSize: 24, margin: 0 }}>Escanea, únete y gana premios en cada visita</p>
        <Qr value={url} alt="" size={800} />
        <p style={{ fontSize: 18, margin: 0 }}>Tu tarjeta se guarda en Apple Wallet o Google Wallet</p>
      </div>
    </>
  )
}

export default function PanelHome() {
  const { businesses, current, choose, error, reload } = useBusinesses()

  return (
    <main className="page narrow">
      <PanelBar />
      {error && <p className="notice notice-error">{error}</p>}
      {!businesses && !error && <p className="muted">Cargando…</p>}
      {businesses && !current && (
        <CreateBusiness
          onCreated={(b) => {
            choose(b.id)
            void reload()
          }}
        />
      )}
      {current && (
        <div className="stack">
          <div className="no-print">
            {businesses!.length > 1 ? (
              <select className="input" aria-label="Negocio" value={current.id} onChange={(e) => choose(e.target.value)}>
                {businesses!.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <h1 style={{ fontSize: 28 }}>{current.name}</h1>
            )}
            <p className="muted" style={{ margin: 0 }}>
              {[current.category, current.city].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="panel stack no-print">
            <Link className="btn btn-primary btn-big btn-block" to="/panel/escanear">
              Escanear tarjeta
            </Link>
            <FindCard />
          </div>
          <div className="no-print">
            <Programs business={current} />
          </div>
          <JoinPoster business={current} />
        </div>
      )}
    </main>
  )
}
