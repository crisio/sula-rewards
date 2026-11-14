import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { normalizar } from '../../shared/reglas'
import { aTextoMonto, leerMonto } from '../lib/formato'

/** Ventana que sube desde abajo en el celular (y centrada en la computadora). */
export function Hoja({ titulo, subtitulo, onCerrar, children, pie }: { titulo: ReactNode; subtitulo?: ReactNode; onCerrar: () => void; children: ReactNode; pie?: ReactNode }) {
  const id = useId()
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onCerrar])
  return (
    <div className="fondo-hoja" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="hoja-agarradera" />
        <div className="hoja-cabeza">
          <div>
            <h2 id={id}>{titulo}</h2>
            {subtitulo && <div className="muted peq">{subtitulo}</div>}
          </div>
          <button type="button" className="hoja-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
        {pie && <div className="hoja-pie">{pie}</div>}
      </div>
    </div>
  )
}

/** Botones grandes para elegir una opción (tipo de habitación, forma de pago…). */
export function Opciones<T extends string>({
  valor,
  opciones,
  onCambio,
  columnas,
  etiqueta,
}: {
  valor: T | null
  opciones: { valor: T; texto: ReactNode; detalle?: ReactNode }[]
  onCambio: (v: T) => void
  columnas?: 'dos' | 'tres'
  etiqueta?: string
}) {
  return (
    <div className={`opciones ${columnas ?? ''}`} role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" className="opcion" aria-pressed={valor === o.valor} onClick={() => onCambio(o.valor)}>
          {o.texto}
          {o.detalle && <small>{o.detalle}</small>}
        </button>
      ))}
    </div>
  )
}

/** Campo de lempiras: guarda centavos, muestra «1,400». */
export function CampoMonto({ valor, onCambio, autoFocus, placeholder, id }: { valor: number | null; onCambio: (centavos: number | null) => void; autoFocus?: boolean; placeholder?: string; id?: string }) {
  const [texto, setTexto] = useState(aTextoMonto(valor))
  const ultimo = useRef(valor)
  useEffect(() => {
    if (valor !== ultimo.current) {
      setTexto(aTextoMonto(valor))
      ultimo.current = valor
    }
  }, [valor])
  return (
    <div className="entrada-monto">
      <input
        id={id}
        className="entrada"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        placeholder={placeholder ?? '0'}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value)
          const v = leerMonto(e.target.value)
          if (v !== undefined) {
            ultimo.current = v
            onCambio(v)
          }
        }}
        onBlur={() => setTexto(aTextoMonto(ultimo.current))}
      />
    </div>
  )
}

export interface Sugerencia {
  valor: string
  detalle?: string
  datos?: unknown
}

/** Campo de texto con sugerencias (huéspedes recientes, empresas). */
export function Autocompletar({
  valor,
  onCambio,
  sugerencias,
  onElegir,
  placeholder,
  id,
  autoFocus,
  mayusculas,
}: {
  valor: string
  onCambio: (v: string) => void
  sugerencias: Sugerencia[]
  onElegir?: (s: Sugerencia) => void
  placeholder?: string
  id?: string
  autoFocus?: boolean
  mayusculas?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const coincidencias = useMemo(() => {
    const n = normalizar(valor)
    if (!n) return []
    return sugerencias.filter((s) => normalizar(s.valor).includes(n) && normalizar(s.valor) !== n).slice(0, 6)
  }, [valor, sugerencias])
  return (
    <div className="autocompletar">
      <input
        id={id}
        className="entrada"
        value={valor}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize={mayusculas ? 'words' : undefined}
        onChange={(e) => {
          onCambio(e.target.value)
          setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && coincidencias.length > 0 && (
        <ul className="sugerencias">
          {coincidencias.map((s) => (
            <li key={s.valor + (s.detalle ?? '')}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onCambio(s.valor)
                  onElegir?.(s)
                  setAbierto(false)
                }}
              >
                {s.valor}
                {s.detalle && <small>{s.detalle}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Teclado numérico grande para el PIN. */
export function TecladoPin({ pin, onCambio, onEntrar, ocupado, textoBoton = 'Entrar' }: { pin: string; onCambio: (p: string) => void; onEntrar: () => void; ocupado?: boolean; textoBoton?: string }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key) && pin.length < 8) onCambio(pin + e.key)
      else if (e.key === 'Backspace') onCambio(pin.slice(0, -1))
      else if (e.key === 'Enter' && pin.length >= 4) onEntrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [pin, onCambio, onEntrar])
  return (
    <>
      <div className="puntos" aria-label={`${pin.length} números escritos`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <i key={i} className={i < pin.length ? 'lleno' : ''} />
        ))}
      </div>
      <div className="teclado">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => pin.length < 8 && onCambio(pin + d)}>
            {d}
          </button>
        ))}
        <button type="button" className="tenue" onClick={() => onCambio('')}>
          Borrar
        </button>
        <button type="button" onClick={() => pin.length < 8 && onCambio(pin + '0')}>
          0
        </button>
        <button type="button" className="tenue" onClick={() => onCambio(pin.slice(0, -1))} aria-label="Borrar un número">
          ⌫
        </button>
      </div>
      <button type="button" className="btn primario grande ancho" style={{ marginTop: 16 }} disabled={pin.length < 4 || ocupado} onClick={onEntrar}>
        {ocupado ? 'Un momento…' : textoBoton}
      </button>
    </>
  )
}

export function AvisoFlotante({ aviso }: { aviso: { texto: string; tipo: 'ok' | 'error' } | null }) {
  if (!aviso) return null
  return (
    <div className={`aviso-flotante ${aviso.tipo === 'error' ? 'error' : ''}`} role="status">
      {aviso.texto}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="cargando">{texto}</div>
}

export function Icono({ nombre, tam = 22 }: { nombre: 'menu' | 'camara' | 'copiar' | 'descargar' | 'candado' | 'flecha-izq' | 'flecha-der'; tam?: number }) {
  const p = { width: tam, height: tam, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (nombre) {
    case 'menu':
      return (
        <svg {...p}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )
    case 'camara':
      return (
        <svg {...p}>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      )
    case 'copiar':
      return (
        <svg {...p}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
      )
    case 'descargar':
      return (
        <svg {...p}>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      )
    case 'candado':
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'flecha-izq':
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      )
    case 'flecha-der':
      return (
        <svg {...p}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      )
  }
}
