import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { estadoHabitacion, type Estado, type EstadoHabitacion } from '../../../shared/calculos'
import { fechaCorta, horaBonita, horaHN, turnoDeHora } from '../../../shared/fechas'
import { NOMBRE_PAGO, NOMBRE_TURNO, PAGOS, precioLista, type Habitacion, type Pago } from '../../../shared/reglas'
import { duracion, lempiras, porcentaje } from '../../lib/formato'
import { useAhora } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { Cargando, Icono } from '../../components/ui'
import { useHoy } from './contexto'
import { CopiarAyer, candidatosDeAyer } from './CopiarAyer'
import { HojaHabitacion } from './HojaHabitacion'

const INSIGNIA: Record<Estado, string> = { libre: 'Libre', ocupada: 'Ocupada', hora: 'Por hora', sale: 'Sale hoy', limpieza: 'Limpieza' }

export default function Tablero({ rutaCierre }: { rutaCierre?: string }) {
  const { datos, error, turno, mensajeTurno, abrirTurno, sugerencias } = useHoy()
  const { usuario } = useSesion()
  const ahora = useAhora(15_000)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [copiar, setCopiar] = useState(false)
  const [filtro, setFiltro] = useState<Estado | null>(null)

  const estados = useMemo(() => {
    if (!datos) return new Map<string, EstadoHabitacion>()
    const d = { fecha: datos.fecha, hoy: datos.hoy, ayer: datos.anoche }
    return new Map(datos.hostal.habitaciones.filter((h) => h.activa).map((h) => [h.numero, estadoHabitacion(h, d, datos.hostal, ahora)]))
  }, [datos, ahora])

  if (!datos) return error ? <p className="banda rojo">{error}</p> : <Cargando />
  const h = datos.hostal
  const habitaciones = h.habitaciones.filter((x) => x.activa)
  const cuenta = (e: Estado) => [...estados.values()].filter((x) => x.estado === e).length
  const ocupadas = cuenta('ocupada') + cuenta('sale')
  const candidatos = candidatosDeAyer(datos.hoy, datos.anoche)
  const salenHoy = cuenta('sale')
  const sinPago = datos.hoy.filter((r) => r.pago == null && (r.modo === 'noche' || r.salida_en != null))
  const slot = turnoDeHora(ahora, h.hora_dia, h.hora_noche)
  const turnoViejo = turno && turno.cerrado_en == null && (turno.fecha !== slot.fecha || turno.tipo !== slot.tipo)
  const notaReciente = datos.nota_anterior && datos.nota_anterior.cerrado_en && ahora - datos.nota_anterior.cerrado_en < 20 * 3600_000 ? datos.nota_anterior : null
  const habAbierta = abierta ? habitaciones.find((x) => x.numero === abierta) : null
  const visibles = filtro ? habitaciones.filter((x) => {
    const e = estados.get(x.numero)?.estado
    return filtro === 'ocupada' ? e === 'ocupada' || e === 'sale' : e === filtro
  }) : habitaciones

  return (
    <>
      {usuario?.rol === 'recepcion' && (
        <BandaTurno turno={turno} mensaje={mensajeTurno} slotTipo={slot.tipo} viejo={Boolean(turnoViejo)} rutaCierre={rutaCierre} onEmpezar={() => void abrirTurno(true)} />
      )}
      {datos.dia_cerrado && (
        <p className="banda rojo">
          <span>
            <b>Este día ya se cerró.</b> Solo el dueño puede corregirlo.
          </span>
        </p>
      )}
      {notaReciente && (
        <div className="banda info">
          <p>
            <b>Nota del turno anterior</b> <span className="muted peq">({notaReciente.cerrado_por_nombre ?? notaReciente.usuario}, {NOMBRE_TURNO[notaReciente.tipo].toLowerCase()})</span>
            <br />
            {notaReciente.notas}
          </p>
        </div>
      )}
      {candidatos.length > 0 && (
        <div className="banda aviso">
          <p>
            <b>{salenHoy ? `${salenHoy} ${salenHoy === 1 ? 'huésped de anoche sale' : 'huéspedes de anoche salen'} a las ${horaBonita(h.hora_salida)}.` : `${candidatos.length} de anoche no se ${candidatos.length === 1 ? 'copió' : 'copiaron'} a hoy.`}</b>{' '}
            ¿Siguen hospedados?
          </p>
          <button type="button" className="btn chico" onClick={() => setCopiar(true)}>
            <Icono nombre="copiar" tam={16} /> Copiar huéspedes de ayer
          </button>
        </div>
      )}
      {sinPago.length > 0 && (
        <p className="banda aviso">
          <span>
            <b>Sin forma de pago:</b> hab. {sinPago.map((r) => r.habitacion).join(', ')}. Toca la llave para registrarla.
          </span>
        </p>
      )}

      <div className="estadisticas">
        {(
          [
            ['libre', 'Libres', cuenta('libre')],
            ['ocupada', 'Ocupadas', ocupadas],
            ['hora', 'Por hora', cuenta('hora')],
            ['limpieza', 'Limpieza', cuenta('limpieza')],
          ] as const
        ).map(([e, texto, n]) => (
          <button key={e} type="button" className={`estadistica e-${e}`} style={filtro === e ? { borderColor: 'currentColor' } : undefined} onClick={() => setFiltro(filtro === e ? null : e)} aria-pressed={filtro === e}>
            <b>{n}</b>
            <span>{texto}</span>
          </button>
        ))}
      </div>

      <div className="seccion">
        <div className="seccion-cabeza">
          <h2>Habitaciones{filtro ? ` · ${INSIGNIA[filtro]}` : ''}</h2>
          <span className="muted peq">Noche del {fechaCorta(datos.fecha)} · toca una llave para entrada, salida o limpieza</span>
        </div>
        <div className="llaves">
          {visibles.map((hab) => (
            <Llave key={hab.numero} hab={hab} estado={estados.get(hab.numero)!} ahora={ahora} horaSalida={h.hora_salida} tipoSugerido={sugerencias.tipos[hab.numero] ?? hab.tipo} precio={precioLista(h, sugerencias.tipos[hab.numero] ?? hab.tipo)} onAbrir={() => setAbierta(hab.numero)} />
          ))}
        </div>
      </div>

      <CajaDeHoy ocupadas={ocupadas} total={habitaciones.length} />

      {habAbierta && <HojaHabitacion hab={habAbierta} estado={estados.get(habAbierta.numero)!} onCerrar={() => setAbierta(null)} />}
      {copiar && <CopiarAyer onCerrar={() => setCopiar(false)} />}
    </>
  )
}

function BandaTurno({
  turno,
  mensaje,
  slotTipo,
  viejo,
  rutaCierre,
  onEmpezar,
}: {
  turno: ReturnType<typeof useHoy>['turno']
  mensaje: string | null
  slotTipo: 'dia' | 'noche'
  viejo: boolean
  rutaCierre?: string
  onEmpezar: () => void
}) {
  const { usuario } = useSesion()
  if (!turno) return <p className="banda">{mensaje ?? 'Abriendo tu turno…'}</p>
  if (turno.cerrado_en) return <p className="banda">Este turno ya se cerró. Si te toca el siguiente, sal y vuelve a entrar.</p>
  if (viejo && turno.usuario_id === usuario?.id) {
    return (
      <div className="banda aviso">
        <p>
          <b>
            Tu turno de {NOMBRE_TURNO[turno.tipo].toLowerCase()} del {fechaCorta(turno.fecha, false)} sigue abierto.
          </b>{' '}
          Ciérralo para entregar.
        </p>
        {rutaCierre && (
          <Link to={rutaCierre} className="btn chico primario">
            Cerrar turno
          </Link>
        )}
      </div>
    )
  }
  const deOtro = turno.usuario_id !== usuario?.id
  return (
    <div className="banda">
      <p>
        <span className="muted">Turno de {NOMBRE_TURNO[turno.tipo].toLowerCase()}</span> · <b>{turno.usuario ?? '—'}</b> <span className="muted peq">desde {horaHN(turno.abierto_en)}</span>
      </p>
      {deOtro && (
        <button type="button" className="btn chico" onClick={onEmpezar}>
          Empezar mi turno{slotTipo === turno.tipo ? '' : ` de ${NOMBRE_TURNO[slotTipo].toLowerCase()}`}
        </button>
      )}
    </div>
  )
}

function Llave({ hab, estado, ahora, horaSalida, tipoSugerido, precio, onAbrir }: { hab: Habitacion; estado: EstadoHabitacion; ahora: number; horaSalida: string; tipoSugerido: string; precio: number; onAbrir: () => void }) {
  const r = estado.registro
  const sinPago = r && !r.pago && estado.estado === 'ocupada'
  return (
    <button type="button" className={`llave ${estado.estado}`} onClick={onAbrir} aria-label={`Habitación ${hab.numero}: ${INSIGNIA[estado.estado]}${r ? `, ${r.huesped}` : ''}`}>
      <span className="llave-num">{hab.numero}</span>
      <span className="llave-insignias">
        <span className="insignia">{INSIGNIA[estado.estado]}</span>
        {sinPago && <span className="insignia roja">Sin pago</span>}
        {r?.pago === 'credito' && estado.estado === 'ocupada' && <span className="insignia neutra">Crédito</span>}
      </span>
      {estado.estado === 'libre' ? (
        <span className="llave-detalle">
          {tipoSugerido} · {lempiras(precio)}
        </span>
      ) : r ? (
        <>
          <span className="llave-huesped">{r.huesped}</span>
          <span className="llave-detalle">
            {estado.estado === 'hora'
              ? duracion(ahora - r.entrada_en)
              : estado.estado === 'limpieza'
                ? `Salió ${r.salida_en ? horaHN(r.salida_en) : horaBonita(horaSalida)}`
                : [r.empresa, r.tipo, r.pago === 'credito' ? null : lempiras(r.precio)].filter(Boolean).join(' · ')}
          </span>
        </>
      ) : null}
    </button>
  )
}

function CajaDeHoy({ ocupadas, total }: { ocupadas: number; total: number }) {
  const { datos } = useHoy()
  if (!datos || !datos.ver_totales) return null
  const regs = datos.hoy
  const vendido = regs.reduce((s, r) => s + (r.precio ?? 0), 0)
  const porPago = new Map<Pago | null, number>()
  for (const r of regs) porPago.set(r.pago, (porPago.get(r.pago) ?? 0) + (r.precio ?? 0))
  const horas = regs.filter((r) => r.modo === 'hora')
  return (
    <div className="tarjeta seccion">
      <div className="tarjeta-cabeza">
        <h2>Caja de hoy</h2>
        <span className="muted">Ocupación {porcentaje(total ? ocupadas / total : 0)}</span>
      </div>
      <div className="fila-monto" style={{ alignItems: 'baseline' }}>
        <span>Ingresos del día</span>
        <span className="grande-monto">{lempiras(vendido)}</span>
      </div>
      {regs.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Sin ingresos hoy. Cada entrada de huésped o alquiler por hora que registres aparece aquí.
        </p>
      ) : (
        <>
          {[...PAGOS, null].map((p) =>
            porPago.has(p) ? (
              <div key={p ?? 'sin'} className="fila-monto" style={p == null ? { color: 'var(--danger)' } : undefined}>
                <span>{p ? NOMBRE_PAGO[p] : 'Sin forma de pago'}</span>
                <span className="num">{lempiras(porPago.get(p) ?? 0)}</span>
              </div>
            ) : null,
          )}
          {horas.length > 0 && (
            <p className="muted peq" style={{ marginBottom: 0 }}>
              Por hora hoy: {horas.length} · {lempiras(horas.reduce((s, r) => s + (r.precio ?? 0), 0))}
            </p>
          )}
        </>
      )}
    </div>
  )
}
