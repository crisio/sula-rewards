import type { CSSProperties } from 'react'
import type { Headline, ProgramType } from '../lib/types'
import { CheckIcon, TypeIcon } from './Icons'

export interface WalletCardProps {
  type: ProgramType
  color: string
  businessName: string
  headline: Headline
  customerName?: string
  reward?: string | null
  /** Solo sellos: cuántos lleva y la meta. */
  stamps?: number
  stampsGoal?: number | null
  /** En la pila del Wallet solo se ve la parte de arriba. */
  compact?: boolean
}

/** La tarjeta como se ve en Apple Wallet o Google Wallet. */
export default function WalletCard(props: WalletCardProps) {
  const { type, color, businessName, headline, customerName, reward, stamps = 0, stampsGoal, compact } = props
  const goal = stampsGoal ?? 0
  const perRow = goal > 10 ? Math.ceil(goal / 2) : goal
  return (
    <div className={`wcard${compact ? ' compact' : ''}`} style={{ '--card': color } as CSSProperties} role="img" aria-label={`${businessName}: ${headline.label} ${headline.value}`}>
      <div className="wcard-head">
        <div className="wcard-brand">
          <span className="wcard-icon">
            <TypeIcon type={type} />
          </span>
          <span>{businessName}</span>
        </div>
        <div>
          <div className="wcard-label" style={{ textAlign: 'right' }}>
            {headline.label}
          </div>
          <div className="wcard-value">{headline.value}</div>
        </div>
      </div>
      {!compact && type === 'sellos' && goal > 0 && (
        <div className="wcard-stamps" style={{ '--per-row': perRow } as CSSProperties}>
          {Array.from({ length: goal }, (_, i) => (
            <span key={i} className={`stamp${i < stamps ? ' filled' : ''}`}>
              {i < stamps && <CheckIcon />}
            </span>
          ))}
        </div>
      )}
      {!compact && (customerName || reward) && (
        <div className="wcard-foot">
          <div>
            {customerName && (
              <>
                <span className="wcard-label">Cliente</span>
                <strong>{customerName}</strong>
              </>
            )}
          </div>
          <div>
            {reward && (
              <>
                <span className="wcard-label">Premio</span>
                <strong>{reward}</strong>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
