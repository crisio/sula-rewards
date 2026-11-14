import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Ajustes, Hostal, Rol } from '../../shared/reglas'
import { alTerminarSesion, api, fijarToken, recordar, tieneToken } from './api'

export interface Usuario {
  id: string
  nombre: string
  rol: Rol
  hostal_id: string | null
}

interface EstadoSesion {
  estado: 'cargando' | 'fuera' | 'dentro'
  usuario: Usuario | null
  hostales: Hostal[]
  ajustes: Ajustes | null
  bloqueada: boolean
}

interface Sesion extends EstadoSesion {
  entrar: (token: string, usuario: Usuario) => Promise<void>
  salir: () => Promise<void>
  bloquear: () => Promise<void>
  recargar: () => Promise<void>
}

const Contexto = createContext<Sesion | null>(null)
export const CLAVE_ULTIMO = 'hs_ultimo'

export function useSesion() {
  const s = useContext(Contexto)
  if (!s) throw new Error('useSesion fuera de SesionProvider')
  return s
}

/** El usuario que entró, con su hostal (recepción) — para las pantallas que lo necesitan sí o sí. */
export function useUsuario() {
  const s = useSesion()
  if (!s.usuario || !s.ajustes) throw new Error('Sin sesión')
  return { ...s, usuario: s.usuario, ajustes: s.ajustes }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ estado: tieneToken() ? 'cargando' : 'fuera', usuario: null, hostales: [], ajustes: null, bloqueada: false })

  const cargar = useCallback(async () => {
    try {
      const yo = await api<{ usuario: Usuario; hostales: Hostal[]; ajustes: Ajustes }>('/yo')
      setEstado({ estado: 'dentro', usuario: yo.usuario, hostales: yo.hostales, ajustes: yo.ajustes, bloqueada: false })
    } catch (e) {
      if ((e as { status?: number }).status === 401) setEstado((s) => ({ ...s, estado: 'fuera', usuario: null }))
      else setEstado((s) => ({ ...s, estado: s.usuario ? 'dentro' : 'fuera' }))
    }
  }, [])

  useEffect(() => {
    if (tieneToken()) void cargar()
    const quitar = alTerminarSesion(() => setEstado((s) => ({ ...s, estado: 'fuera', usuario: null })))
    return () => {
      quitar()
    }
  }, [cargar])

  const entrar = useCallback(
    async (token: string, usuario: Usuario) => {
      fijarToken(token)
      recordar.guardar(CLAVE_ULTIMO, JSON.stringify(usuario))
      await cargar()
    },
    [cargar],
  )

  const cerrar = useCallback(async (bloqueada: boolean) => {
    try {
      await api('/salir', { method: 'POST' })
    } catch {
      /* igual se cierra en este teléfono */
    }
    fijarToken(null)
    setEstado({ estado: 'fuera', usuario: null, hostales: [], ajustes: null, bloqueada })
  }, [])

  const salir = useCallback(() => cerrar(false), [cerrar])
  const bloquear = useCallback(() => cerrar(true), [cerrar])

  // Bloqueo automático por inactividad (minutos configurables por el dueño; 0 = nunca).
  const ultimaActividad = useRef(Date.now())
  const minutos = estado.ajustes?.bloqueo_minutos ?? 0
  useEffect(() => {
    if (estado.estado !== 'dentro' || !minutos) return
    ultimaActividad.current = Date.now()
    const tocar = () => (ultimaActividad.current = Date.now())
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    eventos.forEach((e) => window.addEventListener(e, tocar, { passive: true }))
    const revisar = () => {
      if (Date.now() - ultimaActividad.current > minutos * 60_000) void bloquear()
    }
    const intervalo = window.setInterval(revisar, 10_000)
    document.addEventListener('visibilitychange', revisar)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, tocar))
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [estado.estado, minutos, bloquear])

  return <Contexto.Provider value={{ ...estado, entrar, salir, bloquear, recargar: cargar }}>{children}</Contexto.Provider>
}
