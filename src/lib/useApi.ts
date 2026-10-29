import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

/** Carga `path` de la API (null = todavía no). `reload` vuelve a pedirlo; `setData` para actualizar al instante. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(path))

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await api<T>(path))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
    setLoading(false)
  }, [path])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}
