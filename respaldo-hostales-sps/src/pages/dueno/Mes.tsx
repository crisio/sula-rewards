import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { colorHuesped, resumenMes, type ResumenMes } from '../../../shared/calculos'
import { DIAS, fechaCorta, fechasDelMes, nombreMes, partesHN, sumarMeses } from '../../../shared/fechas'
import { NOMBRE_PAGO, normalizar, type Hostal, type Registro, type Turno } from '../../../shared/reglas'
import { ahoraServidor } from '../../lib/api'
import { csvDelMes, excelDelMes } from '../../lib/exportar'
import { lempiras, porcentaje } from '../../lib/formato'
import { useCarga } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { Cargando, Hoja, Icono } from '../../components/ui'
import { ProveedorHoy } from '../recepcion/contexto'
import { Anular, FichaRegistro, FormRegistro } from '../recepcion/HojaHabitacion'

export interface DatosMes {
  mes: string
  hoy: string
  hostal: Hostal
  registros: Registro[]
  turnos: Turno[]
  dias: { fecha: string; cerrado_en: number | null; revisado_en: number | null; revisado_por_nombre: string | null; nota: string }[]
}

/** ‹ octubre 2026 › — el mes va en la dirección (?mes=2026-10) para poder compartir el enlace. */
export function useMes() {
  const [params, setParams] = useSearchParams()
  const { hostales } = useSesion()
  const actual = useMemo(() => {
    return partesHN(ahoraServidor()).fecha.slice(0, 7)
  }, [])
  const mes = /^\d{4}-\d{2}$/.test(params.get('mes') ?? '') ? params.get('mes')! : actual
  const cambiar = (m: string) => setParams((p) => {
    p.set('mes', m)
    return p
  })
  return { mes, actual, cambiar, hostales }
}

export function SelectorMes({ mes, cambiar, actual }: { mes: string; cambiar: (m: string) => void; actual: string }) {
  return (
    <div className="acciones" style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'nowrap' }}>
      <button type="button" className="btn chico" onClick={() => cambiar(sumarMeses(mes, -1))} aria-label="Mes anterior">
        <Icono nombre="flecha-izq" tam={18} />
      </button>
      <b style={{ fontSize: '1.15rem', textTransform: 'capitalize', textAlign: 'center' }}>{nombreMes(mes)}</b>
      <button type="button" className="btn chico" onClick={() => cambiar(sumarMeses(mes, 1))} disabled={mes >= actual} aria-label="Mes siguiente">
        <Icono nombre="flecha-der" tam={18} />
      </button>
    </div>
  )
}

export default function Mes({ hostalId }: { hostalId?: string }) {
  const params = useParams()
  const h = hostalId ?? params.h!
  const { mes, actual, cambiar } = useMes()
  const { datos, error, recargar } = useCarga<DatosMes>(`/hostales/${h}/mes?mes=${mes}`)
  const { usuario } = useSesion()
  const [celda, setCelda] = useState<{ fecha: string; habitacion: string } | null>(null)

  const habitaciones = useMemo(() => datos?.hostal.habitaciones.filter((x) => x.activa).map((x) => x.numero) ?? [], [datos])
  const resumen = useMemo(() => (datos ? resumenMes(datos.registros, habitaciones, mes, datos.hoy) : null), [datos, habitaciones, mes])

  return (
    <>
      <SelectorMes mes={mes} cambiar={cambiar} actual={actual} />
      {!datos || !resumen ? (
        error ? <p className="banda rojo">{error}</p> : <Cargando />
      ) : (
        <>
          <Indicadores r={resumen} mes={mes} hoy={datos.hoy} />
          <Ingresos r={resumen} />
          <Calendario datos={datos} habitaciones={habitaciones} onCelda={setCelda} />
          <PorHabitacion r={resumen} />
          <PorHuesped r={resumen} />
          <div className="tarjeta seccion">
            <div className="tarjeta-cabeza">
              <h2>Descargar el mes</h2>
              <span className="muted peq">{datos.registros.length} registros</span>
            </div>
            <div className="acciones">
              <button type="button" className="btn primario" onClick={() => excelDelMes(datos.hostal, mes, datos.hoy, datos.registros, datos.turnos)}>
                <Icono nombre="descargar" tam={18} /> Excel (.xlsx)
              </button>
              <button type="button" className="btn" onClick={() => csvDelMes(datos.hostal, mes, datos.registros)}>
                <Icono nombre="descargar" tam={18} /> CSV
              </button>
            </div>
          </div>
          {celda && (
            <ProveedorHoy hostalId={h} alGuardar={() => void recargar()}>
              <HojaCelda datos={datos} celda={celda} editable={usuario?.rol === 'dueno'} onCerrar={() => setCelda(null)} />
            </ProveedorHoy>
          )}
        </>
      )}
    </>
  )
}

function Indicadores({ r, mes, hoy }: { r: ResumenMes; mes: string; hoy: string }) {
  const enCurso = hoy.startsWith(mes)
  return (
    <div className="kpis">
      <div className="kpi">
        <span>Noches ocupadas</span>
        <b>{r.noches.toLocaleString('en-US')}</b>
        <small>de {r.capacidad.toLocaleString('en-US')} posibles</small>
      </div>
      <div className="kpi">
        <span>Ocupación</span>
        <b>{porcentaje(r.ocupacion)}</b>
        <div className="barra" style={{ marginTop: 6 }}>
          <i style={{ width: `${Math.min(100, r.ocupacion * 100)}%` }} />
        </div>
        {enCurso && <small>{porcentaje(r.ocupacionHastaHoy)} hasta hoy</small>}
      </div>
      <div className="kpi">
        <span>Capacidad</span>
        <b>{r.capacidad.toLocaleString('en-US')}</b>
        <small>
          {r.porHabitacion.length} hab. × {r.dias} días
        </small>
      </div>
      <div className="kpi">
        <span>Día más lleno</span>
        <b>{r.diaMasLleno ? fechaCorta(r.diaMasLleno.fecha, false) : '—'}</b>
        <small>{r.diaMasLleno ? `${r.diaMasLleno.noches} habitaciones` : 'Sin noches'}</small>
      </div>
      <div className="kpi">
        <span>Huéspedes distintos</span>
        <b>{r.huespedes}</b>
      </div>
      <div className="kpi">
        <span>Por hora</span>
        <b>{r.horas.cantidad}</b>
        <small>{lempiras(r.horas.total)}</small>
      </div>
    </div>
  )
}

function Ingresos({ r }: { r: ResumenMes }) {
  const i = r.ingresos
  const max = Math.max(1, ...i.porPago.map((p) => p.monto))
  return (
    <div className="rejilla-2 seccion">
      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <h2>Ingresos del mes</h2>
          <span className="muted peq">Promedio por noche {lempiras(i.promedioNoche)}</span>
        </div>
        <div className="grande-monto">{lempiras(i.vendido)}</div>
        <p className="muted peq" style={{ marginTop: 2 }}>
          Total vendido (el crédito a precio de lista)
        </p>
        {i.porPago.map((p) => (
          <div key={p.pago} style={{ marginTop: 10 }}>
            <div className="fila-monto" style={{ padding: '0 0 4px' }}>
              <span style={p.pago === 'pendiente' ? { color: 'var(--danger)' } : undefined}>
                {p.pago === 'pendiente' ? 'Sin forma de pago' : NOMBRE_PAGO[p.pago]} <span className="muted peq">· {p.registros}</span>
              </span>
              <span className="num">{lempiras(p.monto)}</span>
            </div>
            <div className="barra">
              <i style={{ width: `${(p.monto / max) * 100}%`, background: p.pago === 'credito' ? 'var(--sale)' : p.pago === 'pendiente' ? 'var(--danger)' : undefined }} />
            </div>
          </div>
        ))}
        <div className="fila-monto total">
          <span>Cobrado</span>
          <span className="num">{lempiras(i.cobrado)}</span>
        </div>
        <div className="fila-monto">
          <span>Por cobrar a crédito</span>
          <span className="num">{lempiras(i.credito)}</span>
        </div>
      </div>
      <div className="tarjeta">
        <h2 style={{ marginBottom: 12 }}>Impuestos incluidos</h2>
        <p className="muted peq" style={{ marginTop: 0 }}>
          Los precios ya incluyen ISV 15 % y turismo 4 %. Base = total ÷ 1.19.
        </p>
        <div className="fila-monto">
          <span>Base</span>
          <span className="num">{lempiras(i.base)}</span>
        </div>
        <div className="fila-monto">
          <span>ISV 15 %</span>
          <span className="num">{lempiras(i.isv)}</span>
        </div>
        <div className="fila-monto">
          <span>Turismo 4 %</span>
          <span className="num">{lempiras(i.turismo)}</span>
        </div>
        <div className="fila-monto total">
          <span>Total</span>
          <span className="num">{lempiras(i.vendido)}</span>
        </div>
      </div>
    </div>
  )
}

function Calendario({ datos, habitaciones, onCelda }: { datos: DatosMes; habitaciones: string[]; onCelda: (c: { fecha: string; habitacion: string }) => void }) {
  const fechas = fechasDelMes(datos.mes)
  const mapa = useMemo(() => {
    const m = new Map<string, Registro[]>()
    for (const r of datos.registros) {
      const k = `${r.fecha}|${r.habitacion}`
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  }, [datos.registros])
  const celda = 27
  return (
    <div className="tarjeta seccion">
      <div className="tarjeta-cabeza">
        <h2>Calendario</h2>
        <span className="muted peq">Cada color es un huésped · ● por hora · toca un cuadro</span>
      </div>
      <div className="tabla-envoltura">
        <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2 }} />
              {fechas.map((f) => {
                const dow = new Date(f + 'T00:00:00Z').getUTCDay()
                return (
                  <th key={f} className="mono" style={{ fontSize: '0.62rem', color: dow === 0 || dow === 6 ? 'var(--tab)' : 'var(--muted)', fontWeight: 700, minWidth: celda, textAlign: 'center' }}>
                    {DIAS[dow][0].toUpperCase()}
                    <br />
                    {Number(f.slice(8))}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {habitaciones.map((num) => (
              <tr key={num}>
                <th className="mono" style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, textAlign: 'right', paddingRight: 6, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {num}
                </th>
                {fechas.map((f) => {
                  const regs = mapa.get(`${f}|${num}`) ?? []
                  const noche = regs.find((r) => r.modo === 'noche')
                  const horas = regs.filter((r) => r.modo === 'hora')
                  const futuro = f > datos.hoy
                  return (
                    <td key={f} style={{ padding: 0 }}>
                      <button
                        type="button"
                        title={noche ? `${noche.huesped} · ${noche.tipo} · ${lempiras(noche.precio)}` : horas.length ? 'Por hora' : 'Libre'}
                        onClick={() => onCelda({ fecha: f, habitacion: num })}
                        disabled={futuro && !regs.length}
                        style={{
                          width: celda,
                          height: celda,
                          border: noche && !noche.pago ? '2px solid var(--danger)' : '1px solid var(--border)',
                          borderRadius: 7,
                          background: noche ? colorHuesped(noche.huesped) : futuro ? 'transparent' : 'var(--surface-2)',
                          position: 'relative',
                          padding: 0,
                          opacity: futuro ? 0.4 : 1,
                        }}
                      >
                        {horas.length > 0 && <span style={{ position: 'absolute', right: 3, bottom: 2, width: 7, height: 7, borderRadius: '50%', background: 'var(--hora)', border: '1px solid var(--bg)' }} />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th className="mono muted" style={{ position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'right', paddingRight: 6, fontSize: '0.65rem' }}>
                Total
              </th>
              {fechas.map((f) => (
                <td key={f} className="mono muted" style={{ fontSize: '0.68rem', textAlign: 'center' }}>
                  {datos.registros.filter((r) => r.fecha === f && r.modo === 'noche').length || ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HojaCelda({ datos, celda, editable, onCerrar }: { datos: DatosMes; celda: { fecha: string; habitacion: string }; editable: boolean; onCerrar: () => void }) {
  const regs = datos.registros.filter((r) => r.fecha === celda.fecha && r.habitacion === celda.habitacion)
  const [vista, setVista] = useState<{ tipo: 'ver' } | { tipo: 'editar'; r?: Registro } | { tipo: 'anular'; r: Registro }>({ tipo: 'ver' })
  const hab = datos.hostal.habitaciones.find((x) => x.numero === celda.habitacion)!
  const dia = datos.dias.find((d) => d.fecha === celda.fecha)
  const titulo = `Hab. ${celda.habitacion} · ${fechaCorta(celda.fecha)}`
  if (vista.tipo === 'editar') {
    return (
      <Hoja titulo={titulo} subtitulo={vista.r ? 'Corregir (queda en el historial)' : 'Registrar noche'} onCerrar={onCerrar}>
        <FormRegistro hab={hab} hostal={datos.hostal} registro={vista.r} fecha={celda.fecha} onListo={onCerrar} />
      </Hoja>
    )
  }
  if (vista.tipo === 'anular') {
    return (
      <Hoja titulo={titulo} subtitulo="Anular" onCerrar={onCerrar}>
        <Anular registro={vista.r} onListo={onCerrar} />
      </Hoja>
    )
  }
  return (
    <Hoja titulo={titulo} subtitulo={dia?.cerrado_en ? 'Día cerrado: los cambios quedan como corrección del dueño' : undefined} onCerrar={onCerrar}>
      {regs.length === 0 && <p className="vacio">Libre esa noche.</p>}
      {regs.map((r) => (
        <div key={r.id}>
          <FichaRegistro r={r} />
          {editable && (
            <div className="acciones" style={{ marginTop: -6, marginBottom: 16 }}>
              <button type="button" className="btn chico" onClick={() => setVista({ tipo: 'editar', r })}>
                Corregir
              </button>
              <button type="button" className="btn chico peligro" onClick={() => setVista({ tipo: 'anular', r })}>
                Anular
              </button>
            </div>
          )}
        </div>
      ))}
      {editable && !regs.some((r) => r.modo === 'noche') && (
        <button type="button" className="btn primario ancho" onClick={() => setVista({ tipo: 'editar' })}>
          Registrar noche aquí
        </button>
      )}
    </Hoja>
  )
}

function PorHabitacion({ r }: { r: ResumenMes }) {
  const max = Math.max(1, ...r.porHabitacion.map((x) => x.ingresos))
  return (
    <div className="tarjeta seccion">
      <h2 style={{ marginBottom: 10 }}>Por habitación</h2>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Hab.</th>
              <th className="der">Noches</th>
              <th className="der">Ocupación</th>
              <th className="der">Ingresos</th>
              <th style={{ width: '35%' }} />
            </tr>
          </thead>
          <tbody>
            {r.porHabitacion.map((x) => (
              <tr key={x.numero}>
                <td className="mono">
                  <b>{x.numero}</b>
                </td>
                <td className="der">{x.noches}</td>
                <td className="der">{porcentaje(r.dias ? x.noches / r.dias : 0)}</td>
                <td className="der">{lempiras(x.ingresos)}</td>
                <td>
                  <div className="barra">
                    <i style={{ width: `${(x.ingresos / max) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PorHuesped({ r }: { r: ResumenMes }) {
  const [buscar, setBuscar] = useState('')
  const [todos, setTodos] = useState(false)
  const lista = r.porHuesped.filter((x) => !buscar || normalizar(`${x.nombre} ${x.empresas.join(' ')}`).includes(normalizar(buscar)))
  const visibles = todos || buscar ? lista : lista.slice(0, 25)
  return (
    <div className="tarjeta seccion">
      <div className="tarjeta-cabeza">
        <h2>Por huésped</h2>
        <span className="muted peq">{r.huespedes} distintos</span>
      </div>
      <input className="entrada" placeholder="Buscar huésped o empresa" value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Huésped</th>
              <th>Fechas</th>
              <th className="der">Noches</th>
              <th className="der">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((x) => (
              <tr key={x.nombre}>
                <td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: colorHuesped(x.nombre), marginRight: 6 }} />
                  <b>{x.nombre}</b>
                  <div className="muted peq">{[x.empresas.join(', '), `hab. ${x.habitaciones.join(', ')}`].filter(Boolean).join(' · ')}</div>
                </td>
                <td>
                  {x.rango || '—'}
                  {x.horas > 0 && <div className="muted peq">{x.horas} por hora</div>}
                </td>
                <td className="der">{x.noches}</td>
                <td className="der">{lempiras(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!todos && !buscar && lista.length > 25 && (
        <button type="button" className="btn ancho" style={{ marginTop: 10 }} onClick={() => setTodos(true)}>
          Ver los {lista.length}
        </button>
      )}
    </div>
  )
}
