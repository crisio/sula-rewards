import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from '../components/Logo'
import { api } from '../lib/api'
import type { User } from '../lib/types'

const RESEND_SECONDS = 60

export default function Login() {
  const { user, signIn } = useAuth()
  const location = useLocation()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/panel'} replace />

  async function requestCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/code', { method: 'POST', json: { email } })
      setStep('code')
      setCode('')
      setWait(RESEND_SECONDS)
      setTimeout(() => codeInput.current?.focus(), 50)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  async function verify(value: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ token: string; user: User }>('/auth/verify', { method: 'POST', json: { email, code: value } })
      signIn(res.token, res.user)
    } catch (err) {
      setError((err as Error).message)
      setCode('')
      setBusy(false)
    }
  }

  return (
    <main className="page narrow" style={{ paddingTop: 24 }}>
      <div className="topbar">
        <Logo />
      </div>
      <div className="panel stack">
        {step === 'email' ? (
          <form className="stack" onSubmit={requestCode}>
            <div>
              <h2>Entra a tu panel</h2>
              <p className="muted" style={{ margin: 0 }}>
                Te mandamos un código de 6 dígitos a tu correo. Sin contraseñas.
              </p>
            </div>
            <label className="field">
              <span>Correo</span>
              <input className="input" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.hn" />
            </label>
            {error && <p className="notice notice-error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || !email}>
              {busy ? 'Enviando…' : 'Mandarme el código'}
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) void verify(code)
            }}
          >
            <div>
              <h2>Revisa tu correo</h2>
              <p className="muted" style={{ margin: 0 }}>
                Escribe el código que mandamos a <strong>{email}</strong>.
              </p>
            </div>
            <input
              ref={codeInput}
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Código de 6 dígitos"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(value)
                if (value.length === 6) void verify(value)
              }}
            />
            {error && <p className="notice notice-error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <div className="row spread small">
              <button type="button" className="link-btn" onClick={() => setStep('email')}>
                Cambiar correo
              </button>
              <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={() => requestCode()}>
                {wait > 0 ? `Reenviar en ${wait} s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
