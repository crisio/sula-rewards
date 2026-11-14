import { useEffect, useState } from 'react'
import { api, recordar } from '../lib/api'
import { CLAVE_ULTIMO, useSesion, type Usuario } from '../lib/sesion'
import { Cargando, Icono, TecladoPin } from '../components/ui'

interface Inicio {
  hostales: { id: string; nombre: string; recepcionistas: { id: string; nombre: string }[] }[]
  dueno_configurado: boolean
  pin_inicial: boolean
}

type Quien = { tipo: 'recepcion'; id: string; nombre: string; hostal: string } | { tipo: 'dueno' }

function leerUltimo(): Usuario | null {
  try {
    return JSON.parse(recordar.leer(CLAVE_ULTIMO) ?? 'null')
  } catch {
    return null
  }
}

export default function Entrar() {
  const { entrar, bloqueada } = useSesion()
  const [inicio, setInicio] = useState<Inicio | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [hostal, setHostal] = useState<string | null>(recordar.leer('hs_hostal'))
  const [quien, setQuien] = useState<Quien | null>(() => {
    const u = leerUltimo()
    if (!u) return null
    return u.rol === 'dueno' ? { tipo: 'dueno' } : { tipo: 'recepcion', id: u.id, nombre: u.nombre, hostal: u.hostal_id ?? '' }
  })
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    api<Inicio>('/inicio')
      .then(setInicio)
      .catch((e) => setErrorCarga((e as Error).message))
  }, [])

  if (errorCarga)
    return (
      <div className="entrar">
        <p className="error">{errorCarga}</p>
        <button className="btn" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    )
  if (!inicio) return <Cargando />

  const hostalElegido = inicio.hostales.find((h) => h.id === hostal) ?? null

  async function enviar() {
    if (!quien || pin.length < 4) return
    setOcupado(true)
    setError(null)
    try {
      const r = await api<{ token: string; usuario: Usuario }>('/entrar', {
        method: 'POST',
        json: quien.tipo === 'dueno' ? { dueno: true, pin } : { usuario_id: quien.id, pin },
      })
      await entrar(r.token, r.usuario)
    } catch (e) {
      setError((e as Error).message)
      setPin('')
    } finally {
      setOcupado(false)
    }
  }

  const cambiar = () => {
    setQuien(null)
    setPin('')
    setError(null)
    recordar.guardar(CLAVE_ULTIMO, null)
  }

  return (
    <div className="entrar">
      <div className="marca">
        <img src="/icono.svg" alt="" />
        <div>
          <b>Hostales SPS</b>
          <div className="muted peq">Prado Alto · ProKinto</div>
        </div>
      </div>

      {quien ? (
        <>
          {bloqueada && (
            <p className="chip" style={{ alignSelf: 'flex-start' }}>
              <Icono nombre="candado" tam={16} /> Se bloqueó por inactividad
            </p>
          )}
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>{quien.tipo === 'dueno' ? 'Dueño' : quien.nombre}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {quien.tipo === 'dueno'
              ? inicio.dueno_configurado
                ? 'Escribe tu PIN.'
                : inicio.pin_inicial
                  ? 'Primera vez: escribe el PIN que guardaste como PIN_DUENO.'
                  : 'Falta configurar el PIN del dueño (secreto PIN_DUENO).'
              : `Recepción · ${inicio.hostales.find((h) => h.id === quien.hostal)?.nombre ?? ''}`}
          </p>
          <TecladoPin pin={pin} onCambio={setPin} onEntrar={enviar} ocupado={ocupado} />
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn fantasma ancho" style={{ marginTop: 12 }} onClick={cambiar}>
            No soy yo · cambiar
          </button>
        </>
      ) : hostalElegido ? (
        <>
          <button type="button" className="btn fantasma chico" style={{ alignSelf: 'flex-start', marginBottom: 10 }} onClick={() => setHostal(null)}>
            <Icono nombre="flecha-izq" tam={16} /> Hostales
          </button>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>{hostalElegido.nombre}</h1>
          <p className="muted">¿Quién eres?</p>
          {hostalElegido.recepcionistas.length ? (
            <div className="nombres">
              {hostalElegido.recepcionistas.map((r) => (
                <button key={r.id} type="button" onClick={() => setQuien({ tipo: 'recepcion', id: r.id, nombre: r.nombre, hostal: hostalElegido.id })}>
                  {r.nombre}
                </button>
              ))}
            </div>
          ) : (
            <p className="banda">Todavía no hay recepcionistas en este hostal. El dueño los agrega en Más → Personal.</p>
          )}
        </>
      ) : (
        <>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800 }}>Entrar</h1>
          <p className="muted">Elige tu hostal</p>
          <div className="nombres" style={{ gridTemplateColumns: '1fr' }}>
            {inicio.hostales.map((h) => (
              <button
                key={h.id}
                type="button"
                style={{ minHeight: 76, fontSize: '1.2rem' }}
                onClick={() => {
                  setHostal(h.id)
                  recordar.guardar('hs_hostal', h.id)
                }}
              >
                {h.nombre}
              </button>
            ))}
          </div>
        </>
      )}

      {!quien && (
        <button type="button" className="btn fantasma ancho" style={{ marginTop: 'auto' }} onClick={() => setQuien({ tipo: 'dueno' })}>
          Entrar como dueño
        </button>
      )}
    </div>
  )
}
