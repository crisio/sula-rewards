import { Link } from 'react-router-dom'

/** Cuatro puntos, uno por tipo de programa: sellos, puntos, cashback y gift cards. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" style={{ fill: 'var(--ink)' }} />
      <circle cx="22" cy="22" r="9" style={{ fill: 'var(--sellos)' }} />
      <circle cx="42" cy="22" r="9" style={{ fill: 'var(--puntos)' }} />
      <circle cx="22" cy="42" r="9" style={{ fill: 'var(--cashback)' }} />
      <circle cx="42" cy="42" r="9" style={{ fill: 'var(--bg)' }} />
    </svg>
  )
}

export default function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Sula Rewards, inicio">
      <LogoMark />
      <span>
        Sula Rewards
        <small>Sellos · Puntos · Cashback</small>
      </span>
    </Link>
  )
}
