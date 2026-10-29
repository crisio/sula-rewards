import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PanelBar from '../components/PanelBar'
import Qr from '../components/Qr'
import { TypeIcon } from '../components/Icons'
import { LogoMark } from '../components/Logo'
import { api } from '../lib/api'
import { useBusinesses } from '../lib/business'
import { appUrl, formatDay, todayInHonduras, TYPE_LABEL } from '../lib/format'
import { useApi } from '../lib/useApi'
import type { Business, Program, Promotion } from '../lib/types'

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

const LOGO_SIZE = 360
const MAX_LOGO_BYTES = 1_500_000

/** Recorta la imagen al centro (cuadrada) y la pasa a un PNG de 360×360, como lo pide la API. */
async function squarePng(file: File) {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  try {
    await img.decode()
  } catch {
    throw new Error('No pudimos abrir esa imagen. Prueba con una foto o un PNG.')
  } finally {
    URL.revokeObjectURL(img.src)
  }
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (!side) throw new Error('No pudimos abrir esa imagen. Prueba con una foto o un PNG.')
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = LOGO_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE)
  const png = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png')
    } catch {
      resolve(null)
    }
  })
  if (!png) throw new Error('No pudimos preparar el logo. Prueba con otra imagen.')
  if (png.size > MAX_LOGO_BYTES) throw new Error('El logo pesa demasiado (máximo 1.5 MB)')
  return png
}

/** Subir, cambiar o quitar el logo. Al cambiarlo, la API actualiza también los pases del Wallet. */
function LogoEditor({ business, onChanged }: { business: Business; onChanged: () => Promise<void> }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(run: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await run()
      await onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <button className="btn btn-ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Guardando…' : business.logo_url ? 'Cambiar logo' : 'Subir logo'}
        </button>
        {business.logo_url && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => change(() => api(`/businesses/${business.id}/logo`, { method: 'DELETE' }))}>
            Quitar logo
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // para poder elegir el mismo archivo otra vez
            if (file) {
              void change(async () =>
                api<Business>(`/businesses/${business.id}/logo`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: await squarePng(file) }),
              )
            }
          }}
        />
      </div>
      <span className="small muted">Cuadrado, se ve en la tarjeta de tus clientes y en su Wallet.</span>
      {error && <p className="notice notice-error">{error}</p>}
    </div>
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

/** Las promociones del negocio: las ven todos los clientes en «Explorar» de la app. */
function Promotions({ business }: { business: Business }) {
  const { data: promotions, error, setData } = useApi<Promotion[]>(`/businesses/${business.id}/promotions`)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const today = todayInHonduras()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const created = await api<Promotion>(`/businesses/${business.id}/promotions`, {
        method: 'POST',
        json: { title: title.trim(), body: body.trim() || undefined, ends_on: endsOn || undefined },
      })
      setData((list) => [created, ...(list ?? [])])
      setTitle('')
      setBody('')
      setEndsOn('')
    } catch (err) {
      setFormError((err as Error).message)
    }
    setBusy(false)
  }

  async function work(id: string, run: () => Promise<void>) {
    setWorking(id)
    setListError(null)
    try {
      await run()
    } catch (err) {
      setListError((err as Error).message)
    }
    setWorking(null)
  }

  const toggle = (p: Promotion) =>
    work(p.id, async () => {
      const next = await api<Promotion>(`/promotions/${p.id}`, { method: 'PATCH', json: { active: !p.active } })
      setData((list) => list?.map((x) => (x.id === p.id ? next : x)) ?? null)
    })

  const remove = (p: Promotion) => {
    if (!window.confirm(`¿Borrar la promoción «${p.title}»?`)) return
    void work(p.id, async () => {
      await api(`/promotions/${p.id}`, { method: 'DELETE' })
      setData((list) => list?.filter((x) => x.id !== p.id) ?? null)
    })
  }

  return (
    <div className="panel stack">
      <div>
        <h2>Promociones</h2>
        <p className="muted" style={{ margin: 0 }}>
          Salen en «Explorar» de la app Sula Rewards para todos los clientes. Puedes tener hasta 5 activas.
        </p>
      </div>
      <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
        <label className="field">
          <span>Título</span>
          <input className="input" required minLength={3} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="2×1 en baleadas los martes" />
        </label>
        <label className="field">
          <span>Detalle (opcional)</span>
          <textarea className="input" rows={2} maxLength={280} style={{ resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Presentando tu tarjeta en caja." />
        </label>
        <label className="field">
          <span>Vence (opcional)</span>
          <input className="input" type="date" min={today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
        {formError && <p className="notice notice-error">{formError}</p>}
        <button className="btn btn-primary" disabled={busy || title.trim().length < 3}>
          {busy ? 'Publicando…' : 'Publicar promoción'}
        </button>
      </form>
      {error && <p className="notice notice-error">{error}</p>}
      {listError && <p className="notice notice-error">{listError}</p>}
      {!promotions && !error && <p className="muted" style={{ margin: 0 }}>Cargando promociones…</p>}
      {promotions?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Todavía no tienes promociones.
        </p>
      )}
      {promotions && promotions.length > 0 && (
        <ul className="list">
          {promotions.map((p) => {
            const expired = Boolean(p.ends_on && p.ends_on < today)
            return (
              <li key={p.id} className="list-item" style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{p.title}</strong>
                  {p.body && <span style={{ display: 'block' }}>{p.body}</span>}
                  <span className="row small muted" style={{ gap: 8 }}>
                    {p.ends_on ? `Hasta el ${formatDay(p.ends_on)}` : 'Sin fecha'}
                    {expired ? <span className="badge badge-danger">Vencida</span> : !p.active && <span className="badge badge-off">Pausada</span>}
                  </span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {!expired && (
                    <button className="btn btn-ghost" disabled={working === p.id} onClick={() => toggle(p)}>
                      {p.active ? 'Pausar' : 'Reactivar'}
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} disabled={working === p.id} onClick={() => remove(p)}>
                    Borrar
                  </button>
                </span>
              </li>
            )
          })}
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
          <div className="no-print stack" style={{ gap: 12 }}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              {current.logo_url ? (
                <img className="biz-logo" src={current.logo_url} alt="" />
              ) : (
                <span className="biz-logo biz-logo-empty" aria-hidden="true">
                  {current.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
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
            </div>
            <LogoEditor key={current.id} business={current} onChanged={reload} />
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
          <div className="no-print">
            <Promotions key={current.id} business={current} />
          </div>
          <JoinPoster business={current} />
        </div>
      )}
    </main>
  )
}
