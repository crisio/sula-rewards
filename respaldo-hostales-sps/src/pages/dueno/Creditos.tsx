import { useMemo, useState } from 'react'
import { diasEntre, fechaCorta, partesHN, rangosFechas } from '../../../shared/fechas'
import { normalizar, type Factura, type Registro } from '../../../shared/reglas'
import type { NivelCredito } from '../../../shared/calculos'
import { ahoraServidor, api } from '../../lib/api'
import { lempiras, plural } from '../../lib/formato'
import { useAviso, useCarga } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { AvisoFlotante, Cargando, Hoja } from '../../components/ui'

interface Pendiente {
  hostal_id: string
  empresa_id: string
  empresa: string
  noches: number
  monto: number
  desde: string
  hasta: string
  nivel: NivelCredito
  hoy: string
}

interface DatosCreditos {
  pendientes: Pendiente[]
  registros: Registro[]
  facturas: Factura[]
}

const ESTILO_NIVEL: Record<NivelCredito, { fondo: string; color: string; texto: string }> = {
  ok: { fondo: 'var(--surface-3)', color: 'var(--muted)', texto: 'Al día' },
  aviso: { fondo: 'var(--limpieza-bg)', color: 'var(--limpieza)', texto: 'Facturar' },
  rojo: { fondo: 'var(--danger-bg)', color: 'var(--danger)', texto: '30+ días' },
}

export default function Creditos() {
  const { hostales } = useSesion()
  const { datos, error, recargar } = useCarga<DatosCreditos>('/creditos')
  const [filtro, setFiltro] = useState<string>('todos')
  const [facturar, setFacturar] = useState<Pendiente | null>(null)
  const [detalle, setDetalle] = useState<Pendiente | null>(null)
  const { aviso, mostrar } = useAviso()
  const nombreHostal = (id: string) => hostales.find((h) => h.id === id)?.nombre.replace(/^Hostal /, '') ?? id

  if (!datos) return error ? <p className="banda rojo">{error}</p> : <Cargando />
  const pend = datos.pendientes.filter((p) => filtro === 'todos' || p.hostal_id === filtro)
  const facturas = datos.facturas.filter((f) => filtro === 'todos' || f.hostal_id === filtro)
  const porCobrar = facturas.filter((f) => !f.pagada_en)
  const pagadas = facturas.filter((f) => f.pagada_en).slice(0, 30)
  const total = pend.reduce((s, p) => s + p.monto, 0) + porCobrar.reduce((s, f) => s + f.monto, 0)
  const hoy = partesHN(ahoraServidor()).fecha

  const accion = async (fn: () => Promise<unknown>, texto: string) => {
    try {
      await fn()
      mostrar(texto)
      await recargar()
    } catch (e) {
      mostrar((e as Error).message, 'error')
    }
  }

  return (
    <>
      <div className="segmentos" role="group" aria-label="Hostal">
        {[{ id: 'todos', nombre: 'Todos' }, ...hostales].map((h) => (
          <button key={h.id} type="button" aria-pressed={filtro === h.id} onClick={() => setFiltro(h.id)}>
            {h.nombre.replace(/^Hostal /, '')}
          </button>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Total por cobrar</span>
          <b>{lempiras(total)}</b>
          <small>a precio de lista</small>
        </div>
        <div className="kpi">
          <span>Sin facturar</span>
          <b>{lempiras(pend.reduce((s, p) => s + p.monto, 0))}</b>
          <small>{plural(pend.reduce((s, p) => s + p.noches, 0), 'noche', 'noches')}</small>
        </div>
        <div className="kpi">
          <span>Facturado sin pagar</span>
          <b>{lempiras(porCobrar.reduce((s, f) => s + f.monto, 0))}</b>
          <small>{plural(porCobrar.length, 'factura', 'facturas')}</small>
        </div>
      </div>

      <div className="seccion">
        <div className="seccion-cabeza">
          <h2>Pendiente de facturar</h2>
          <span className="muted peq">Aviso a los 15 días de la primera noche · rojo a los 30</span>
        </div>
        {pend.length === 0 ? (
          <p className="tarjeta vacio">No hay noches a crédito pendientes de facturar.</p>
        ) : (
          <div className="rejilla-2">
            {pend.map((p) => {
              const est = ESTILO_NIVEL[p.nivel]
              return (
                <div key={p.hostal_id + p.empresa_id} className="tarjeta" style={p.nivel === 'rojo' ? { borderColor: 'var(--danger)' } : undefined}>
                  <div className="tarjeta-cabeza" style={{ marginBottom: 4 }}>
                    <h2>{p.empresa}</h2>
                    <span className="insignia" style={{ background: est.fondo, color: est.color }}>
                      {est.texto}
                    </span>
                  </div>
                  <p className="muted peq" style={{ marginTop: 0 }}>
                    {nombreHostal(p.hostal_id)} · primera noche {fechaCorta(p.desde, false)} (hace {diasEntre(p.desde, p.hoy)} días)
                  </p>
                  <div className="fila-monto">
                    <span>{plural(p.noches, 'noche', 'noches')}</span>
                    <b className="grande-monto" style={{ fontSize: '1.5rem' }}>
                      {lempiras(p.monto)}
                    </b>
                  </div>
                  <div className="acciones" style={{ marginTop: 8 }}>
                    <button type="button" className="btn primario" onClick={() => setFacturar(p)}>
                      Marcar facturado
                    </button>
                    <button type="button" className="btn" onClick={() => setDetalle(p)}>
                      Ver noches
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="tarjeta seccion">
        <div className="tarjeta-cabeza">
          <h2>Facturas por cobrar</h2>
          <span className="muted peq">{porCobrar.length}</span>
        </div>
        {porCobrar.length === 0 ? (
          <p className="vacio">No hay facturas pendientes de pago.</p>
        ) : (
          <ul className="lista">
            {porCobrar.map((f) => (
              <li key={f.id} style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px' }}>
                  <b>{f.empresa}</b> {f.numero && <span className="mono peq">#{f.numero}</span>}
                  <br />
                  <span className="muted peq">
                    {nombreHostal(f.hostal_id)} · {plural(f.noches, 'noche', 'noches')} del {fechaCorta(f.desde, false)} al {fechaCorta(f.hasta, false)} · facturada hace {diasEntre(partesHN(f.creada_en).fecha, hoy)} días
                  </span>
                </span>
                <b className="num">{lempiras(f.monto)}</b>
                <span className="acciones">
                  <button type="button" className="btn chico primario" onClick={() => void accion(() => api(`/facturas/${f.id}`, { method: 'PATCH', json: { pagada: true } }), 'Factura pagada')}>
                    Pagada
                  </button>
                  <button type="button" className="btn chico fantasma" onClick={() => confirm('¿Deshacer esta factura? Sus noches vuelven a «pendiente de facturar».') && void accion(() => api(`/facturas/${f.id}`, { method: 'DELETE' }), 'Factura deshecha')}>
                    Deshacer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagadas.length > 0 && (
        <div className="tarjeta seccion">
          <h2 style={{ marginBottom: 8 }}>Pagadas</h2>
          <ul className="lista">
            {pagadas.map((f) => (
              <li key={f.id}>
                <span>
                  {f.empresa} {f.numero && <span className="mono peq">#{f.numero}</span>}
                  <br />
                  <span className="muted peq">
                    {nombreHostal(f.hostal_id)} · pagada el {fechaCorta(partesHN(f.pagada_en!).fecha, false)}
                  </span>
                </span>
                <span className="acciones" style={{ alignItems: 'center' }}>
                  <span className="num">{lempiras(f.monto)}</span>
                  <button type="button" className="btn chico fantasma" onClick={() => void accion(() => api(`/facturas/${f.id}`, { method: 'PATCH', json: { pagada: false } }), 'Marcada sin pagar')}>
                    Sin pagar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facturar && (
        <HojaFacturar
          p={facturar}
          registros={datos.registros}
          onCerrar={() => setFacturar(null)}
          onListo={async (texto) => {
            setFacturar(null)
            mostrar(texto)
            await recargar()
          }}
        />
      )}
      {detalle && <HojaNoches p={detalle} registros={datos.registros} onCerrar={() => setDetalle(null)} />}
      <AvisoFlotante aviso={aviso} />
    </>
  )
}

const nochesDe = (p: Pendiente, registros: Registro[]) => registros.filter((r) => r.hostal_id === p.hostal_id && r.empresa_id === p.empresa_id)

function HojaNoches({ p, registros, onCerrar }: { p: Pendiente; registros: Registro[]; onCerrar: () => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, Registro[]>()
    for (const r of nochesDe(p, registros)) {
      const k = normalizar(r.huesped)
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return [...m.values()]
  }, [p, registros])
  return (
    <Hoja titulo={p.empresa} subtitulo={`${plural(p.noches, 'noche', 'noches')} sin facturar · ${lempiras(p.monto)}`} onCerrar={onCerrar}>
      <ul className="lista">
        {grupos.map((rs) => (
          <li key={rs[0].id}>
            <span>
              <b>{rs[0].huesped}</b>
              <br />
              <span className="muted peq">
                {rangosFechas(rs.map((r) => r.fecha))} · hab. {[...new Set(rs.map((r) => r.habitacion))].join(', ')}
              </span>
            </span>
            <span className="num" style={{ textAlign: 'right' }}>
              {lempiras(rs.reduce((s, r) => s + (r.precio ?? 0), 0))}
              <br />
              <span className="muted peq">{plural(rs.length, 'noche', 'noches')}</span>
            </span>
          </li>
        ))}
      </ul>
    </Hoja>
  )
}

function HojaFacturar({ p, registros, onCerrar, onListo }: { p: Pendiente; registros: Registro[]; onCerrar: () => void; onListo: (texto: string) => Promise<void> }) {
  const [hasta, setHasta] = useState(p.hasta)
  const [numero, setNumero] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const incluidas = nochesDe(p, registros).filter((r) => r.fecha <= hasta)
  const monto = incluidas.reduce((s, r) => s + (r.precio ?? 0), 0)
  return (
    <Hoja titulo={`Facturar a ${p.empresa}`} subtitulo="Las noches pasan a «facturado, por cobrar»" onCerrar={onCerrar}>
      <label className="campo">
        <span>Incluir noches hasta</span>
        <input className="entrada" type="date" value={hasta} min={p.desde} max={p.hasta} onChange={(e) => setHasta(e.target.value)} />
      </label>
      <label className="campo">
        <span>Número de factura (opcional)</span>
        <input className="entrada" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej. 000-001-01-00001234" />
      </label>
      <div className="tarjeta" style={{ marginBottom: 14 }}>
        <div className="fila-monto">
          <span>{plural(incluidas.length, 'noche', 'noches')}</span>
          <b className="num">{lempiras(monto)}</b>
        </div>
        <p className="muted peq" style={{ margin: 0 }}>
          Del {fechaCorta(p.desde, false)} al {fechaCorta(hasta, false)}
        </p>
      </div>
      {error && <p className="banda rojo">{error}</p>}
      <button
        type="button"
        className="btn primario grande ancho"
        disabled={ocupado || !incluidas.length}
        onClick={async () => {
          setOcupado(true)
          setError(null)
          try {
            await api('/facturas', { method: 'POST', json: { hostal_id: p.hostal_id, empresa_id: p.empresa_id, hasta, numero } })
            await onListo(`Facturado a ${p.empresa}: ${lempiras(monto)}`)
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setOcupado(false)
          }
        }}
      >
        Marcar facturado · {lempiras(monto)}
      </button>
    </Hoja>
  )
}
