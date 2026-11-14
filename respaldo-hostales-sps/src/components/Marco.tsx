import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { fechaCorta, fechaLarga, fechaTrabajo, hora24HN } from '../../shared/fechas'
import { alCambiarConexion, api, estaEnLinea, recordar } from '../lib/api'
import { useAhora } from '../lib/hooks'
import { useSesion } from '../lib/sesion'
import { Hoja, Icono, Opciones, TecladoPin } from './ui'

export interface Pestana {
  to: string
  texto: string
  contador?: number
  end?: boolean
}

type Tema = 'auto' | 'claro' | 'oscuro'

export function aplicarTema(tema: Tema) {
  if (tema === 'auto') delete document.documentElement.dataset.tema
  else document.documentElement.dataset.tema = tema
}

function useEnLinea() {
  const [v, setV] = useState(estaEnLinea())
  useEffect(() => {
    const quitar = alCambiarConexion(setV)
    return () => {
      quitar()
    }
  }, [])
  return v
}

/** Encabezado de todas las pantallas: fecha y hora reales, título, selector de hostal y pestañas. */
export function Marco({
  titulo,
  hostales,
  hostalActual,
  onHostal,
  pestanas,
  derecha,
  children,
}: {
  titulo: ReactNode
  hostales?: { id: string; nombre: string; habitaciones: number }[]
  hostalActual?: string
  onHostal?: (id: string) => void
  pestanas: Pestana[]
  derecha?: ReactNode
  children: ReactNode
}) {
  const ahora = useAhora(10_000)
  const enLinea = useEnLinea()
  const [menu, setMenu] = useState(false)
  // La fecha que se muestra es la del calendario (no el día de trabajo), con la hora del servidor.
  const fecha = fechaTrabajo(ahora, '00:00')
  return (
    <div className="pagina">
      <div className="encabezado">
        <span>
          <span className="solo-ancho">{fechaLarga(fecha)}</span>
          <span className="solo-movil">{fechaCorta(fecha)}</span> · <b>{hora24HN(ahora)}</b>
        </span>
        <span className={`en-linea ${enLinea ? '' : 'fuera'}`}>{enLinea ? 'En línea' : 'Sin conexión'}</span>
      </div>
      <div className="titulo-fila">
        <h1 className="titulo">{titulo}</h1>
        <div className="acciones" style={{ flexWrap: 'nowrap' }}>
          {derecha}
          <button type="button" className="menu-boton" onClick={() => setMenu(true)} aria-label="Menú">
            <Icono nombre="menu" />
          </button>
        </div>
      </div>
      {hostales && hostales.length > 1 && onHostal && (
        <div className="segmentos" role="group" aria-label="Hostal">
          {hostales.map((h) => (
            <button key={h.id} type="button" aria-pressed={h.id === hostalActual} onClick={() => onHostal(h.id)}>
              {h.nombre.replace(/^Hostal /, '')} · {h.habitaciones}
            </button>
          ))}
        </div>
      )}
      {pestanas.length > 0 && (
        <nav className="pestanas">
          {pestanas.map((p) => (
            <NavLink key={p.to} to={p.to} end={p.end}>
              {p.texto}
              {p.contador ? <span className="contador">{p.contador}</span> : null}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
      {menu && <MenuCuenta onCerrar={() => setMenu(false)} />}
    </div>
  )
}

function MenuCuenta({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, bloquear, salir } = useSesion()
  const [tema, setTema] = useState<Tema>((recordar.leer('hs_tema') as Tema) || 'auto')
  const [cambiarPin, setCambiarPin] = useState(false)
  return (
    <Hoja titulo={usuario?.nombre ?? 'Cuenta'} subtitulo={usuario?.rol === 'dueno' ? 'Dueño' : 'Recepción'} onCerrar={onCerrar}>
      {cambiarPin ? (
        <CambiarPin onListo={() => setCambiarPin(false)} />
      ) : (
        <>
          <div className="campo">
            <span>Tema</span>
            <Opciones<Tema>
              valor={tema}
              columnas="tres"
              opciones={[
                { valor: 'auto', texto: 'Automático' },
                { valor: 'claro', texto: 'Claro' },
                { valor: 'oscuro', texto: 'Oscuro' },
              ]}
              onCambio={(t) => {
                setTema(t)
                recordar.guardar('hs_tema', t === 'auto' ? null : t)
                aplicarTema(t)
              }}
            />
          </div>
          <div className="acciones" style={{ flexDirection: 'column' }}>
            <button type="button" className="btn ancho" onClick={() => setCambiarPin(true)}>
              Cambiar mi PIN
            </button>
            <button type="button" className="btn ancho" onClick={() => void bloquear()}>
              <Icono nombre="candado" tam={18} /> Bloquear ahora
            </button>
            <button type="button" className="btn peligro ancho" onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </>
      )}
    </Hoja>
  )
}

function CambiarPin({ onListo }: { onListo: () => void }) {
  const [paso, setPaso] = useState<'actual' | 'nuevo' | 'listo'>('actual')
  const [actual, setActual] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (paso === 'listo') {
    return (
      <>
        <p>Listo, tu PIN cambió.</p>
        <button type="button" className="btn primario ancho" onClick={onListo}>
          Volver
        </button>
      </>
    )
  }
  return (
    <>
      <p className="muted" style={{ textAlign: 'center', margin: 0 }}>
        {paso === 'actual' ? 'Escribe tu PIN actual' : 'Escribe tu PIN nuevo (4 a 8 números)'}
      </p>
      <TecladoPin
        pin={paso === 'actual' ? actual : nuevo}
        onCambio={paso === 'actual' ? setActual : setNuevo}
        ocupado={ocupado}
        textoBoton={paso === 'actual' ? 'Siguiente' : 'Guardar PIN'}
        onEntrar={async () => {
          if (paso === 'actual') return setPaso('nuevo')
          setOcupado(true)
          try {
            await api('/yo/pin', { method: 'POST', json: { actual, nuevo } })
            setPaso('listo')
          } catch (e) {
            setError((e as Error).message)
            setActual('')
            setNuevo('')
            setPaso('actual')
          } finally {
            setOcupado(false)
          }
        }}
      />
      {error && <p className="error">{error}</p>}
    </>
  )
}
