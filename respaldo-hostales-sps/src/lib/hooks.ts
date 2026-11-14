import { useCallback, useEffect, useRef, useState } from 'react'
import { ahoraServidor, api } from './api'

/** Carga datos de la API y permite recargarlos (después de guardar algo). */
export function useCarga<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const vigente = useRef(ruta)

  const recargar = useCallback(async () => {
    if (!ruta) return
    try {
      const d = await api<T>(ruta)
      if (vigente.current === ruta) {
        setDatos(d)
        setError(null)
      }
    } catch (e) {
      if (vigente.current === ruta) setError((e as Error).message)
    } finally {
      if (vigente.current === ruta) setCargando(false)
    }
  }, [ruta])

  useEffect(() => {
    vigente.current = ruta
    setCargando(true)
    setDatos(null)
    void recargar()
  }, [ruta, recargar])

  return { datos, error, cargando, recargar, setDatos }
}

/**
 * Tiempo real: pregunta cada pocos segundos si algo cambió (una consulta muy liviana) y, si cambió,
 * recarga. Se pausa cuando la pantalla no está visible y revisa apenas vuelve.
 */
export function useVigilar(rutaVersion: string | null, alCambiar: () => void, cadaMs = 8000) {
  const ultima = useRef<string | null>(null)
  const alCambiarRef = useRef(alCambiar)
  alCambiarRef.current = alCambiar

  useEffect(() => {
    if (!rutaVersion) return
    ultima.current = null
    let parado = false
    const revisar = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const v = await api<{ version: number | string; fecha?: string }>(rutaVersion)
        const clave = `${v.version}|${v.fecha ?? ''}`
        if (!parado && ultima.current != null && ultima.current !== clave) alCambiarRef.current()
        ultima.current = clave
      } catch {
        /* sin conexión: el encabezado lo avisa */
      }
    }
    void revisar()
    const intervalo = window.setInterval(revisar, cadaMs)
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void revisar()
        alCambiarRef.current()
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      parado = true
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [rutaVersion, cadaMs])
}

/** La hora del servidor, actualizada cada `cadaMs` (para los relojes y las 11:30). */
export function useAhora(cadaMs = 15_000) {
  const [ahora, setAhora] = useState(ahoraServidor)
  useEffect(() => {
    const i = window.setInterval(() => setAhora(ahoraServidor()), cadaMs)
    return () => window.clearInterval(i)
  }, [cadaMs])
  return ahora
}

/** Mensaje corto que se va solo («Guardado»). */
export function useAviso() {
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'error' } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const mostrar = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    setAviso({ texto, tipo })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setAviso(null), tipo === 'error' ? 6000 : 2600)
  }, [])
  return { aviso, mostrar }
}
