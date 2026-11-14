import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { cuadreDia, type Cuadre } from '../../../shared/calculos'
import { fechaCorta, fechasDelMes, horaHN } from '../../../shared/fechas'
import { NOMBRE_PAGO, NOMBRE_TURNO, PAGOS } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { lempiras } from '../../lib/formato'
import { useAviso, useCarga } from '../../lib/hooks'
import { AvisoFlotante, Cargando, Hoja } from '../../components/ui'
import { VerFoto } from '../recepcion/HojaHabitacion'
import { SelectorMes, useMes, type DatosMes } from './Mes'

const colorDif = (d: number) => (d === 0 ? 'var(--ok)' : 'var(--danger)')

export default function Caja() {
  const { h } = useParams()
  const { mes, actual, cambiar } = useMes()
  const { datos, error, recargar } = useCarga<DatosMes>(`/hostales/${h}/mes?mes=${mes}`)
  const [abierto, setAbierto] = useState<string | null>(null)
  const { aviso, mostrar } = useAviso()

  const dias = useMemo(() => {
    if (!datos) return []
    return fechasDelMes(mes)
      .filter((f) => f <= datos.hoy)
      .reverse()
      .map((f) => ({ cuadre: cuadreDia(f, datos.registros, datos.turnos), dia: datos.dias.find((d) => d.fecha === f) }))
  }, [datos, mes])

  if (!datos) return error ? <p className="banda rojo">{error}</p> : <Cargando />
  // La diferencia solo cuenta cuando el día ya se cerró (mientras tanto, la caja sigue en curso).
  const cerrado = (d: (typeof dias)[number]) => d.cuadre.cerrado || Boolean(d.dia?.cerrado_en)
  const conDiferencia = dias.filter((d) => cerrado(d) && d.cuadre.diferencia !== 0)
  const sinCerrar = dias.filter((d) => !cerrado(d) && d.cuadre.fecha < datos.hoy && (d.cuadre.turnos.length || d.cuadre.esperado))
  const totalDif = dias.reduce((s, d) => s + (cerrado(d) ? d.cuadre.diferencia : 0), 0)
  const seleccionado = abierto ? dias.find((d) => d.cuadre.fecha === abierto) : null

  return (
    <>
      <SelectorMes mes={mes} cambiar={cambiar} actual={actual} />
      <div className="kpis">
        <div className="kpi">
          <span>Días con diferencia</span>
          <b style={{ color: conDiferencia.length ? 'var(--danger)' : 'var(--ok)' }}>{conDiferencia.length}</b>
        </div>
        <div className="kpi">
          <span>Diferencia del mes</span>
          <b style={{ color: colorDif(totalDif) }}>{lempiras(totalDif)}</b>
          <small>declarado − habitaciones</small>
        </div>
        <div className="kpi">
          <span>Días sin cerrar</span>
          <b style={{ color: sinCerrar.length ? 'var(--limpieza)' : 'var(--ok)' }}>{sinCerrar.length}</b>
        </div>
      </div>

      <div className="tarjeta seccion">
        <div className="tarjeta-cabeza">
          <h2>Cuadre de caja diario</h2>
          <span className="muted peq">Efectivo de las habitaciones contra lo declarado al cerrar · toca un día</span>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Día</th>
                <th className="der">Efectivo</th>
                <th className="der">Declarado</th>
                <th className="der">Diferencia</th>
                <th className="der">Tarjeta</th>
                <th className="der">Transf.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {dias.map(({ cuadre: c, dia }) => {
                const hayCierre = c.cerrado || Boolean(dia?.cerrado_en)
                return (
                  <tr key={c.fecha} onClick={() => setAbierto(c.fecha)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <b>{fechaCorta(c.fecha)}</b>
                    </td>
                    <td className="der">{lempiras(c.esperado)}</td>
                    <td className="der">{lempiras(c.declarado)}</td>
                    <td className="der" style={{ color: hayCierre ? colorDif(c.diferencia) : 'var(--muted)', fontWeight: 800 }}>
                      {hayCierre ? (c.diferencia === 0 ? '✓' : lempiras(c.diferencia)) : 'En curso'}
                    </td>
                    <td className="der">{lempiras(c.porPago.tarjeta ?? 0)}</td>
                    <td className="der">{lempiras(c.porPago.transferencia ?? 0)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.cerrado || dia?.cerrado_en ? <span className="insignia neutra">Cerrado</span> : <span className="insignia" style={{ background: 'var(--limpieza-bg)', color: 'var(--limpieza)' }}>Abierto</span>}
                      {dia?.revisado_en ? <span className="insignia" style={{ marginLeft: 4, background: 'var(--libre-bg)', color: 'var(--libre)' }}>Revisado</span> : null}
                      {c.sinPago > 0 && <span className="insignia roja" style={{ marginLeft: 4 }}>{c.sinPago} sin pago</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {seleccionado && (
        <DetalleDia
          hostalId={h!}
          datos={datos}
          c={seleccionado.cuadre}
          dia={seleccionado.dia}
          onCerrar={() => setAbierto(null)}
          onCambio={async (texto) => {
            mostrar(texto)
            await recargar()
          }}
          onError={(t) => mostrar(t, 'error')}
        />
      )}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

function DetalleDia({
  hostalId,
  datos,
  c,
  dia,
  onCerrar,
  onCambio,
  onError,
}: {
  hostalId: string
  datos: DatosMes
  c: Cuadre
  dia: DatosMes['dias'][number] | undefined
  onCerrar: () => void
  onCambio: (texto: string) => Promise<void>
  onError: (texto: string) => void
}) {
  const [nota, setNota] = useState(dia?.nota ?? '')
  const [ocupado, setOcupado] = useState(false)
  const fotos = datos.registros.filter((r) => r.fecha === c.fecha && r.foto_id)
  const accion = async (fn: () => Promise<unknown>, texto: string) => {
    setOcupado(true)
    try {
      await fn()
      await onCambio(texto)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Hoja titulo={fechaCorta(c.fecha)} subtitulo="Cuadre de caja" onCerrar={onCerrar}>
      <div className="tarjeta" style={{ marginBottom: 14 }}>
        <div className="fila-monto">
          <span>Efectivo según habitaciones</span>
          <b className="num">{lempiras(c.esperado)}</b>
        </div>
        <div className="fila-monto">
          <span>Declarado al cerrar</span>
          <b className="num">{lempiras(c.declarado)}</b>
        </div>
        <div className="fila-monto total">
          <span>Diferencia</span>
          <b className="num" style={{ color: colorDif(c.diferencia) }}>
            {c.diferencia === 0 ? 'Cuadra ✓' : `${c.diferencia > 0 ? 'Sobran' : 'Faltan'} ${lempiras(Math.abs(c.diferencia))}`}
          </b>
        </div>
        <div style={{ marginTop: 8 }}>
          {[...PAGOS, 'pendiente' as const].map((p) =>
            c.porPago[p] ? (
              <div key={p} className="fila-monto muted peq" style={{ padding: '3px 0' }}>
                <span>{p === 'pendiente' ? 'Sin forma de pago' : NOMBRE_PAGO[p]}</span>
                <span className="num">{lempiras(c.porPago[p] ?? 0)}</span>
              </div>
            ) : null,
          )}
        </div>
      </div>

      {c.turnos.length === 0 && <p className="banda">Ese día nadie abrió turno en la app.</p>}
      {c.turnos.map(({ turno: t, esperado, declarado, diferencia }) => (
        <div key={t.id} className="tarjeta" style={{ marginBottom: 14 }}>
          <div className="tarjeta-cabeza" style={{ marginBottom: 6 }}>
            <h2>Turno de {NOMBRE_TURNO[t.tipo].toLowerCase()}</h2>
            <span className="muted peq">{t.usuario}</span>
          </div>
          <p className="muted peq" style={{ marginTop: 0 }}>
            Abrió {horaHN(t.abierto_en)} · {t.cerrado_en ? `cerró ${horaHN(t.cerrado_en)}${t.cerrado_por_nombre && t.cerrado_por_nombre !== t.usuario ? ` (${t.cerrado_por_nombre})` : ''}` : 'sin cerrar'}
          </p>
          <div className="fila-monto">
            <span>Efectivo cobrado en el turno</span>
            <span className="num">{lempiras(esperado)}</span>
          </div>
          <div className="fila-monto">
            <span>Declarado</span>
            <span className="num">{lempiras(declarado)}</span>
          </div>
          {t.cerrado_en && diferencia !== 0 && (
            <div className="fila-monto" style={{ color: 'var(--danger)', fontWeight: 800 }}>
              <span>Diferencia</span>
              <span className="num">{lempiras(diferencia)}</span>
            </div>
          )}
          {(t.movimientos ?? []).map((m) => (
            <div key={m.id} className="banda" style={{ marginTop: 8, marginBottom: 0 }}>
              <p>
                <b>
                  {m.tipo === 'entregado' ? 'Entregado' : 'Depositado'} {lempiras(m.monto)}
                </b>
                <br />
                <span className="muted peq">
                  {m.tipo === 'depositado' ? `Cuenta ${m.cuenta}${m.referencia ? ` · ref. ${m.referencia}` : ''} · ` : ''}
                  {m.entregado_por ? `entregó ${m.entregado_por}` : ''}
                  {m.recibido_por ? ` · recibió ${m.recibido_por}` : ''}
                </span>
              </p>
              {m.foto_id && <VerFoto id={m.foto_id} texto="Ver comprobante" />}
            </div>
          ))}
          {t.notas && (
            <p style={{ marginBottom: 0 }}>
              <span className="muted">Notas:</span> {t.notas}
            </p>
          )}
          {t.cerrado_en && (
            <button type="button" className="btn chico" style={{ marginTop: 10 }} disabled={ocupado} onClick={() => void accion(() => api(`/turnos/${t.id}/reabrir`, { method: 'POST' }), 'Turno reabierto')}>
              Reabrir turno
            </button>
          )}
        </div>
      ))}

      {fotos.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 14 }}>
          <h2 style={{ marginBottom: 6 }}>Vouchers del día</h2>
          {fotos.map((r) => (
            <div key={r.id} className="fila-monto" style={{ alignItems: 'center' }}>
              <span>
                Hab. {r.habitacion} · {r.huesped} · {r.pago ? NOMBRE_PAGO[r.pago] : ''} {lempiras(r.precio)}
              </span>
              <VerFoto id={r.foto_id!} texto="Ver" />
            </div>
          ))}
        </div>
      )}

      <label className="campo">
        <span>Nota del dueño</span>
        <input className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. faltante explicado: vuelto mal dado" />
      </label>
      <div className="acciones" style={{ flexDirection: 'column' }}>
        <button
          type="button"
          className="btn primario ancho"
          disabled={ocupado}
          onClick={() => void accion(() => api(`/hostales/${hostalId}/dias/${c.fecha}/revisar`, { method: 'POST', json: { nota, revisado: true } }), 'Cuadre marcado como revisado')}
        >
          {dia?.revisado_en ? 'Guardar nota (ya revisado)' : 'Marcar revisado'}
        </button>
        {!c.cerrado && !dia?.cerrado_en && (
          <button type="button" className="btn ancho" disabled={ocupado} onClick={() => void accion(() => api(`/hostales/${hostalId}/dias/${c.fecha}/cerrar`, { method: 'POST' }), 'Día cerrado')}>
            Cerrar el día
          </button>
        )}
      </div>
    </Hoja>
  )
}
