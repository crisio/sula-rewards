import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fechaCorta } from '../../../shared/fechas'
import { NOMBRE_PAGO, type Pago } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { leerCsv } from '../../lib/exportar'
import { lempiras } from '../../lib/formato'
import { useSesion } from '../../lib/sesion'
import { Opciones } from '../../components/ui'

interface Revision {
  total: number
  validas: number
  noches: number
  horas: number
  monto: number
  desde: string | null
  hasta: string | null
  errores: { fila: number; motivo: string }[]
  duplicados: { fila: number; motivo: string; fecha: string; habitacion: string; huesped: string }[]
  empresas_nuevas: string[]
  muestra: { fila: number; fecha: string; habitacion: string; modo: string; huesped: string; empresa: string | null; tipo: string; precio: number | null; pago: Pago | null }[]
  importadas?: number
}

const NECESARIAS = ['fecha', 'habitacion', 'huesped', 'empresa', 'tipo', 'precio', 'pago']

export default function Importar() {
  const { hostales } = useSesion()
  const [hostal, setHostal] = useState(hostales[0]?.id ?? '')
  const [archivo, setArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<Record<string, string>[] | null>(null)
  const [revision, setRevision] = useState<Revision | null>(null)
  const [hecho, setHecho] = useState<Revision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function revisar(f: Record<string, string>[], h = hostal) {
    setOcupado(true)
    setError(null)
    try {
      setRevision(await api<Revision>(`/hostales/${h}/importar`, { method: 'POST', json: { filas: f } }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function leerArchivo(f: File | undefined) {
    if (!f) return
    setHecho(null)
    setRevision(null)
    const { columnas, filas: datos } = leerCsv(await f.text())
    const faltan = NECESARIAS.filter((c) => !columnas.includes(c) && c !== 'empresa')
    if (faltan.length) {
      setError(`Al archivo le faltan columnas: ${faltan.join(', ')}. La primera fila debe decir: ${NECESARIAS.join(', ')}.`)
      setFilas(null)
      return
    }
    setArchivo(f.name)
    setFilas(datos)
    await revisar(datos)
  }

  async function importar() {
    if (!filas) return
    setOcupado(true)
    setError(null)
    try {
      const r = await api<Revision>(`/hostales/${hostal}/importar`, { method: 'POST', json: { filas, aplicar: true } })
      setHecho(r)
      setRevision(null)
      setFilas(null)
      setArchivo(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const nombreHostal = hostales.find((h) => h.id === hostal)?.nombre ?? ''

  return (
    <>
      <Link to="/mas" className="btn chico fantasma" style={{ marginBottom: 12 }}>
        ‹ Más
      </Link>
      <div className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Importar reportes en CSV</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          La primera fila debe tener estas columnas: <span className="mono peq">fecha, habitacion, huesped, empresa, tipo, precio, pago</span>. Fechas como 01/10/2026 o 2026-10-01. Pago: Efectivo, T/C, Transferencia, Crédito u Otros. Tipo: Sencilla, Doble, Triple u Hora. En crédito el precio puede ir vacío (se usa el de lista).
        </p>
        <div className="campo">
          <span>¿De qué hostal es el archivo?</span>
          <Opciones
            valor={hostal}
            columnas="dos"
            opciones={hostales.map((h) => ({ valor: h.id, texto: h.nombre.replace(/^Hostal /, '') }))}
            onCambio={(h) => {
              setHostal(h)
              if (filas) void revisar(filas, h)
            }}
          />
        </div>
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => void leerArchivo(e.target.files?.[0]).finally(() => input.current && (input.current.value = ''))} />
        <button type="button" className="btn primario grande ancho" disabled={ocupado} onClick={() => input.current?.click()}>
          {archivo ? `Cambiar archivo (${archivo})` : 'Elegir archivo CSV'}
        </button>
        {error && <p className="banda rojo" style={{ marginTop: 12 }}>{error}</p>}
      </div>

      {hecho && (
        <div className="tarjeta">
          <h2 style={{ color: 'var(--ok)' }}>✓ Importado</h2>
          <p>
            {hecho.importadas} registros en {nombreHostal}
            {hecho.desde ? ` del ${fechaCorta(hecho.desde, false)} al ${fechaCorta(hecho.hasta!, false)}` : ''} · {lempiras(hecho.monto)}.
          </p>
          {hecho.duplicados.length + hecho.errores.length > 0 && <p className="muted">No se importaron {hecho.duplicados.length + hecho.errores.length} filas (repetidas o con errores).</p>}
          <Link to={`/h/${hostal}/mes?mes=${hecho.desde?.slice(0, 7) ?? ''}`} className="btn">
            Ver el mes
          </Link>
        </div>
      )}

      {revision && (
        <>
          <div className="kpis seccion">
            <div className="kpi">
              <span>Filas válidas</span>
              <b style={{ color: 'var(--ok)' }}>{revision.validas}</b>
              <small>de {revision.total}</small>
            </div>
            <div className="kpi">
              <span>Noches · por hora</span>
              <b>
                {revision.noches} · {revision.horas}
              </b>
            </div>
            <div className="kpi">
              <span>Monto</span>
              <b>{lempiras(revision.monto)}</b>
              {revision.desde && (
                <small>
                  {fechaCorta(revision.desde, false)} – {fechaCorta(revision.hasta!, false)}
                </small>
              )}
            </div>
            <div className="kpi">
              <span>Repetidas · errores</span>
              <b style={{ color: revision.duplicados.length + revision.errores.length ? 'var(--limpieza)' : 'var(--ok)' }}>
                {revision.duplicados.length} · {revision.errores.length}
              </b>
            </div>
          </div>

          {revision.empresas_nuevas.length > 0 && (
            <p className="banda info seccion">
              <span>
                <b>Empresas nuevas que se van a crear:</b> {revision.empresas_nuevas.join(', ')}. Si alguna ya existe con otro nombre, después puedes unirlas en Empresas.
              </span>
            </p>
          )}

          {revision.duplicados.length > 0 && (
            <div className="tarjeta seccion">
              <h2 style={{ color: 'var(--limpieza)', marginBottom: 6 }}>Dos huéspedes en la misma habitación y noche</h2>
              <p className="muted peq" style={{ marginTop: 0 }}>
                Estas filas no se importan. Revísalas en el papel y regístralas a mano si hace falta.
              </p>
              <ul className="lista">
                {revision.duplicados.map((d) => (
                  <li key={d.fila}>
                    <span>
                      <b>Fila {d.fila}</b> · {fechaCorta(d.fecha, false)} · hab. {d.habitacion} · {d.huesped}
                      <br />
                      <span className="muted peq">{d.motivo}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {revision.errores.length > 0 && (
            <div className="tarjeta seccion">
              <h2 style={{ color: 'var(--danger)', marginBottom: 6 }}>Filas con errores</h2>
              <ul className="lista">
                {revision.errores.map((e) => (
                  <li key={e.fila}>
                    <span>
                      <b>Fila {e.fila}</b> · {e.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {revision.muestra.length > 0 && (
            <div className="tarjeta seccion">
              <h2 style={{ marginBottom: 8 }}>Así se van a ver (primeras {revision.muestra.length})</h2>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Hab.</th>
                      <th>Huésped</th>
                      <th>Empresa</th>
                      <th>Tipo</th>
                      <th className="der">Precio</th>
                      <th>Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revision.muestra.map((m) => (
                      <tr key={m.fila}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(m.fecha, false)}</td>
                        <td className="mono">{m.habitacion}</td>
                        <td>{m.huesped}</td>
                        <td>{m.empresa ?? ''}</td>
                        <td>{m.modo === 'hora' ? 'Por hora' : m.tipo}</td>
                        <td className="der">{lempiras(m.precio)}</td>
                        <td>{m.pago ? NOMBRE_PAGO[m.pago] : <span style={{ color: 'var(--danger)' }}>Sin pago</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="button" className="btn primario grande ancho seccion" disabled={ocupado || !revision.validas} onClick={() => void importar()}>
            {ocupado ? 'Importando…' : `Importar ${revision.validas} filas a ${nombreHostal}`}
          </button>
        </>
      )}
    </>
  )
}
