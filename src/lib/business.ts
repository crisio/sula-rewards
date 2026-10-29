import { useState } from 'react'
import { useApi } from './useApi'
import type { Business } from './types'

const KEY = 'sula.business'

function readChoice() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Los negocios de la cuenta y el que está abierto en el panel (se recuerda en este teléfono). */
export function useBusinesses() {
  const { data, error, loading, reload } = useApi<Business[]>('/businesses')
  const [chosen, setChosen] = useState(readChoice)
  const current = data?.find((b) => b.id === chosen) ?? data?.[0] ?? null
  const choose = (id: string) => {
    try {
      localStorage.setItem(KEY, id)
    } catch {
      // sin almacenamiento: dura lo que la pestaña
    }
    setChosen(id)
  }
  return { businesses: data, current, choose, error, loading, reload }
}
