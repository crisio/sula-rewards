import type { ProgramType } from '../lib/types'

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" {...common} strokeWidth={3} aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** Ícono de cada tipo de programa (taza, estrella, moneda, regalo). */
export function TypeIcon({ type, size = 18 }: { type: ProgramType; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', ...common, 'aria-hidden': true }
  switch (type) {
    case 'sellos':
      return (
        <svg {...props}>
          <path d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
          <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M7 3v2M11 3v2" />
        </svg>
      )
    case 'puntos':
      return (
        <svg {...props}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />
        </svg>
      )
    case 'cashback':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9.5c0-1.1 1.3-2 3-2s3 .9 3 2-1.3 1.8-3 2.2-3 1.1-3 2.3 1.3 2 3 2 3-.9 3-2M12 5.5v2M12 16.5v2" />
        </svg>
      )
    case 'giftcard':
      return (
        <svg {...props}>
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M12 8v13M3 12h18M12 8c-2-3-6-3-6-1s4 1 6 1zm0 0c2-3 6-3 6-1s-4 1-6 1z" />
        </svg>
      )
  }
}

export const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.8zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" />
  </svg>
)

export const GoogleWalletIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="5" width="20" height="5" rx="2" fill="#4285f4" />
    <rect x="2" y="8.5" width="20" height="5" rx="2" fill="#34a853" />
    <rect x="2" y="12" width="20" height="5" rx="2" fill="#fbbc04" />
    <rect x="2" y="15" width="20" height="5" rx="2" fill="#ea4335" />
  </svg>
)
