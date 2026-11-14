import type { Rol } from '../../shared/reglas'

export interface Env {
  DB: D1Database
  ASSETS?: Fetcher
  /** PIN con que el dueño entra la primera vez (secreto de GitHub PIN_DUENO). Después lo cambia en la app. */
  PIN_DUENO?: string
}

export interface Usuario {
  id: string
  nombre: string
  rol: Rol
  hostal_id: string | null
}

export type AppEnv = { Bindings: Env; Variables: { usuario: Usuario } }
