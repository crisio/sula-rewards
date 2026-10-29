export interface Env {
  DB: D1Database
  APP_URL: string
  ALLOWED_ORIGINS: string
  EMAIL_MODE: 'resend' | 'smtp' | 'log'
  EMAIL_FROM: string
  // Secretos
  AUTH_SECRET: string
  RESEND_API_KEY?: string
  GMAIL_USER?: string
  GMAIL_APP_PASSWORD?: string
  /** Apple Wallet (ver docs/wallet.md): el Pass Type ID y el Team ID van en vars; el certificado y su llave, como secretos (PEM). */
  APPLE_PASS_TYPE_ID?: string
  APPLE_TEAM_ID?: string
  APPLE_PASS_CERT?: string
  APPLE_PASS_KEY?: string
  /** Certificado intermedio de Apple (WWDR G4), PEM. */
  APPLE_WWDR_CERT?: string
  /** Google Wallet (ver docs/wallet.md): el emisor va en vars; la cuenta de servicio, como secretos. */
  GOOGLE_WALLET_ISSUER_ID?: string
  GOOGLE_SA_EMAIL?: string
  GOOGLE_SA_KEY?: string
}

export interface User {
  id: string
  email: string
  full_name: string | null
}

export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } }

export type ProgramType = 'sellos' | 'puntos' | 'cashback' | 'giftcard'

export interface Business {
  id: string
  owner_id: string
  name: string
  slug: string
  category: string | null
  city: string
  created_at: string
}

export interface Program {
  id: string
  business_id: string
  type: ProgramType
  name: string
  color: string
  reward: string | null
  stamps_goal: number | null
  points_per_100: number | null
  reward_points: number | null
  cashback_bp: number | null
  active: number
  created_at: string
}

export interface Card {
  id: string
  program_id: string
  customer_name: string
  phone: string
  email: string | null
  stamps: number
  rewards: number
  points: number
  balance_cents: number
  apple_token: string
  google_saved: number
  created_at: string
  updated_at: number
}

/** Columnas del programa que viajan a la app (en la tarjeta pública y en el panel). */
export const PROGRAM_COLUMNS = 'id, business_id, type, name, color, reward, stamps_goal, points_per_100, reward_points, cashback_bp, active, created_at'
