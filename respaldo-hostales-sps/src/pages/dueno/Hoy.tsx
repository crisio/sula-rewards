import { Link } from 'react-router-dom'
import { fechaCorta, horaHN } from '../../../shared/fechas'
import { NOMBRE_TURNO, type Turno } from '../../../shared/reglas'
import { lempiras } from '../../lib/formato'
import { useCarga, useVigilar } from '../../lib/hooks'
import { Cargando } from '../../components/ui'

interface ResumenHostal {
  id: string
  nombre: string
  fecha: string
  habitaciones: number
  conteo: { libre: number; ocupada: number; hora: number; sale: number; limpieza: number }
  vendido_hoy: number
  turno_actual: Turno | null
  turnos_hoy: Turno[]
  dia_cerrado: boolean
  ayer: { fecha: string; cerrado: boolean; revisado: boolean; cuadre: { esperado: number; declarado: number; diferencia: number } }
  alertas: { nivel: 'rojo' | 'aviso' | 'info'; texto: string; ir?: string }[]
}

const COLOR = { rojo: 'var(--danger)', aviso: 'var(--limpieza)', info: 'var(--sale)' }

export default function Hoy() {
  const { datos, error, recargar } = useCarga<{ ahora: number; hostales: ResumenHostal[] }>('/dueno/hoy')
  useVigilar('/dueno/version', () => void recargar(), 10_000)
  if (!datos) return error ? <p className="banda rojo">{error}</p> : <Cargando />
  return (
    <div className="rejilla-2">
      {datos.hostales.map((h) => (
        <TarjetaHostal key={h.id} h={h} />
      ))}
    </div>
  )
}

function TarjetaHostal({ h }: { h: ResumenHostal }) {
  const ocupadas = h.conteo.ocupada + h.conteo.sale
  const enlace = (ir?: string) => (ir === 'caja' ? `/h/${h.id}/caja` : ir === 'creditos' ? '/creditos' : ir === 'tareas' ? '/tareas' : null)
  return (
    <div className="tarjeta">
      <div className="tarjeta-cabeza">
        <h2>{h.nombre}</h2>
        <span className={`insignia ${h.dia_cerrado ? 'neutra' : ''}`} style={h.dia_cerrado ? undefined : { background: 'var(--libre-bg)', color: 'var(--libre)' }}>
          {h.dia_cerrado ? 'Día cerrado' : 'Día abierto'}
        </span>
      </div>
      <p className="muted peq" style={{ marginTop: -6 }}>
        Noche del {fechaCorta(h.fecha)}
      </p>

      <div className="estadisticas" style={{ marginBottom: 14 }}>
        <div className="estadistica e-ocupada">
          <b>
            {ocupadas}
            <span style={{ fontSize: '0.9rem', fontFamily: 'var(--fuente)', letterSpacing: 0 }}> / {h.habitaciones}</span>
          </b>
          <span>Ocupadas</span>
        </div>
        <div className="estadistica e-libre">
          <b>{h.conteo.libre}</b>
          <span>Libres</span>
        </div>
        <div className="estadistica e-hora">
          <b>{h.conteo.hora}</b>
          <span>Por hora</span>
        </div>
        <div className="estadistica e-limpieza">
          <b>{h.conteo.limpieza}</b>
          <span>Limpieza</span>
        </div>
      </div>

      <div className="fila-monto">
        <span className="muted">De turno</span>
        <span style={{ textAlign: 'right' }}>
          {h.turno_actual ? (
            <>
              <b>{h.turno_actual.usuario ?? '—'}</b> · {NOMBRE_TURNO[h.turno_actual.tipo].toLowerCase()} · desde {horaHN(h.turno_actual.abierto_en)}
            </>
          ) : (
            <span className="muted">Nadie ha abierto turno</span>
          )}
        </span>
      </div>
      <div className="fila-monto">
        <span className="muted">Vendido hoy</span>
        <b className="num">{lempiras(h.vendido_hoy)}</b>
      </div>
      <div className="fila-monto">
        <span className="muted">Ayer ({fechaCorta(h.ayer.fecha, false)})</span>
        <span style={{ textAlign: 'right' }}>
          {h.ayer.cerrado ? 'Cerrado' : <span style={{ color: 'var(--limpieza)' }}>Sin cerrar</span>}
          {' · '}
          {h.ayer.cuadre.diferencia === 0 ? (
            <span style={{ color: 'var(--ok)' }}>caja cuadra</span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>
              {h.ayer.cuadre.diferencia > 0 ? 'sobran' : 'faltan'} {lempiras(Math.abs(h.ayer.cuadre.diferencia))}
            </span>
          )}
        </span>
      </div>

      {h.alertas.length > 0 ? (
        <ul className="lista" style={{ marginTop: 10 }}>
          {h.alertas.map((a, i) => {
            const ir = enlace(a.ir)
            return (
              <li key={i} style={{ justifyContent: 'flex-start' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR[a.nivel], flex: 'none' }} />
                <span style={{ flex: 1 }}>{a.texto}</span>
                {ir && (
                  <Link to={ir} className="btn chico">
                    Ver
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="banda" style={{ marginTop: 12, marginBottom: 0 }}>
          Sin alertas.
        </p>
      )}

      <div className="acciones" style={{ marginTop: 14 }}>
        <Link to={`/h/${h.id}/recepcion`} className="btn primario">
          Ver tablero
        </Link>
        <Link to={`/h/${h.id}/mes`} className="btn">
          Contabilidad
        </Link>
      </div>
    </div>
  )
}
