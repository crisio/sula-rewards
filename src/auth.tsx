import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api'
import type { User } from './lib/types'

interface AuthState {
  user: User | null
  signIn: (token: string, user: User) => void
  signOut: () => Promise<void>
}

const USER_KEY = 'sula.user'

function readCachedUser(): User | null {
  try {
    return getToken() ? JSON.parse(localStorage.getItem(USER_KEY) ?? 'null') : null
  } catch {
    return null
  }
}

function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // almacenamiento no disponible
  }
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readCachedUser)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      cacheUser(null)
      setUser(null)
    })
  }, [])

  const signIn = (token: string, next: User) => {
    setToken(token)
    cacheUser(next)
    setUser(next)
  }

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    cacheUser(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}
