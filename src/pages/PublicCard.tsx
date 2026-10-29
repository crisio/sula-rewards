import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Qr from '../components/Qr'
import WalletCard from '../components/WalletCard'
import { AppleIcon, GoogleWalletIcon } from '../components/Icons'
import { LogoMark } from '../components/Logo'
import { api, apiUrl } from '../lib/api'
import { rememberCard } from '../lib/myCards'
import { useApi } from '../lib/useApi'
import type { CardView } from '../lib/types'

const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)

/** La tarjeta del cliente: el QR para caja y los botones para guardarla en el Wallet. */
export default function PublicCard() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { data: card, error } = useApi<CardView>(`/public/cards/${encodeURIComponent(id ?? '')}`)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)

  useEffect(() => {
    if (card) rememberCard({ id: card.id, business: card.business.name, color: card.program.color })
  }, [card])

  async function saveToGoogle() {
    if (!card) return
    setGoogleBusy(true)
    setWalletError(null)
    try {
      const { url } = await api<{ url: string }>(`/public/cards/${card.id}/google`)
      location.href = url
    } catch (err) {
      setWalletError((err as Error).message)
      setGoogleBusy(false)
    }
  }

  if (error) {
    return (
      <main className="page narrow" style={{ paddingTop: 48 }}>
        <p className="notice notice-error">{error}</p>
        <Link to="/">Ir al inicio</Link>
      </main>
    )
  }
  if (!card) return <p className="muted center" style={{ paddingTop: 80 }}>Cargando tu tarjeta…</p>

  const p = card.program
  // En iPhone, Apple primero; en Android, Google primero.
  const apple = card.wallet.apple && (
    <a key="apple" className="wallet-btn wallet-apple" href={apiUrl(`/public/cards/${card.id}/apple`)}>
      <AppleIcon /> Agregar a Apple Wallet
    </a>
  )
  const google = card.wallet.google && (
    <button key="google" className="wallet-btn wallet-google" disabled={googleBusy} onClick={saveToGoogle}>
      <GoogleWalletIcon /> {googleBusy ? 'Abriendo…' : 'Guardar en Google Wallet'}
    </button>
  )

  return (
    <main className="page narrow" style={{ paddingTop: 24 }}>
      <div className="stack">
        {params.get('nueva') && <p className="notice notice-success">¡Listo, {card.customer_name.split(' ')[0]}! Guarda tu tarjeta para tenerla siempre a la mano.</p>}
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

        {(apple || google) && <div className="stack" style={{ gap: 10 }}>{isApple() ? [apple, google] : [google, apple]}</div>}
        {walletError && <p className="notice notice-error">{walletError}</p>}

        <div className="qr-box">
          <Qr value={card.id} alt={`QR de tu tarjeta ${card.code}`} />
          <span className="qr-code">{card.code}</span>
          <span className="small" style={{ color: '#6b6880' }}>
            Muéstralo en caja para sumar
          </span>
        </div>

        {!card.wallet.apple && !card.wallet.google && (
          <p className="small muted center" style={{ margin: 0 }}>
            Guarda esta página en tus favoritos o agrégala a tu pantalla de inicio para encontrar tu tarjeta.
          </p>
        )}

        <Link to="/" className="row small muted" style={{ justifyContent: 'center', textDecoration: 'none' }}>
          <LogoMark size={20} /> Sula Rewards
        </Link>
      </div>
    </main>
  )
}
