export type ProgramType = 'sellos' | 'puntos' | 'cashback' | 'giftcard'

export interface User {
  id: string
  email: string
  full_name: string | null
}

export interface Business {
  id: string
  name: string
  slug: string
  category: string | null
  city: string
  programs?: number
  /** URL absoluta del logo (con ?v=), o null si no tiene. */
  logo_url?: string | null
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
  cards?: number
}

export interface ProgramDetail extends Program {
  business: Business
  stats: { cards: number; rewards_pending: number; balance_cents: number }
}

export interface Headline {
  label: string
  value: string
}

/** La tarjeta como la ve el cliente (GET /public/cards/:id). */
export interface CardView {
  id: string
  code: string
  customer_name: string
  stamps: number
  rewards: number
  points: number
  balance_cents: number
  created_at: string
  updated_at: number
  headline: Headline
  status: string
  program: Pick<Program, 'id' | 'type' | 'name' | 'color' | 'reward' | 'stamps_goal' | 'points_per_100' | 'reward_points' | 'cashback_bp'>
  business: Pick<Business, 'name' | 'slug' | 'city' | 'category' | 'logo_url'>
  wallet: { apple: boolean; google: boolean }
}

export type MovementKind = 'alta' | 'sello' | 'compra' | 'canje' | 'uso' | 'recarga'

export interface Movement {
  id: string
  kind: MovementKind
  stamps: number
  rewards: number
  points: number
  cents: number
  purchase_cents: number | null
  created_at: string
}

/** La tarjeta vista desde caja (GET /cards/:id). */
export interface StaffCard extends CardView {
  phone: string
  email: string | null
  movements?: Movement[]
  result?: { kind: MovementKind; stamps: number; rewards: number; points: number; cents: number }
}

export interface CardRow {
  id: string
  code: string
  customer_name: string
  phone: string
  headline: Headline
  rewards: number
  updated_at: number
}

/** Promoción del negocio; la ven todos los clientes en «Explorar» de la app. */
export interface Promotion {
  id: string
  business_id: string
  title: string
  body: string | null
  /** AAAA-MM-DD, o null si no vence. */
  ends_on: string | null
  active: 0 | 1
  created_at: string
}

export interface PublicBusiness {
  name: string
  slug: string
  city: string
  category: string | null
  logo_url?: string | null
  programs: CardView['program'][]
  /** Solo las vigentes. */
  promotions?: Pick<Promotion, 'id' | 'title' | 'body' | 'ends_on' | 'created_at'>[]
}
