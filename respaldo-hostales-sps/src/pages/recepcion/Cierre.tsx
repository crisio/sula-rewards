import { useRef, useState } from 'react'
import { fechaCorta, horaHN } from '../../../shared/fechas'
import { NOMBRE_PAGO, NOMBRE_TURNO, PAGOS, type Pago, type Registro, type Turno } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { subirFoto } from '../../lib/foto'
import { lempiras } from '../../lib/formato'
import { useCarga } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { CampoMonto, Cargando, Hoja, Icono } from '../../components/ui'
import { useHoy } from './contexto'

interface Resumen {
  turno: Turno
  registros: Registro[]
  cobrados: number
  sin_pago: Registro[]
  horas_abiertas: Registro[]
  ver_totales: boolean
  por_pago: Partial<Record<Pago, number>> | null
  efectivo_esperado: number | null
  cuentas_banco: string[]
}

interface Movimiento {
  clave: number
  tipo: 'entregado' | 'depositado'
  monto: number | null
  cuenta: string
  referencia: string
  entregado_por: string
  recibido_por: string
  foto_id: string | null
}

export default function Cierre() {
  const { turno } = useHoy()
  if (!turno) return <p className="banda">No tienes un turno abierto.</p>
  if (turno.cerrado_en) return <TurnoCerrado turno={turno} />
  return <FormCierre turnoId={turno.id} />
}

function TurnoCerrado({ turno }: { turno: Turno }) {
  const { salir } = useSesion()
  return (
    <div className="tarjeta" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2.4rem' }}>✓</div>
      <h2>Turno cerrado</h2>
      <p className="muted">
        Turno de {NOMBRE_TURNO[turno.tipo].toLowerCase()} del {fechaCorta(turno.fecha)} · cerrado a las {horaHN(turno.cerrado_en!)}
      </p>
      <button type="button" className="btn primario grande ancho" onClick={() => void salir()}>
        Salir para que entre el siguiente turno
      </button>
    </div>
  )
}

function FormCierre({ turnoId }: { turnoId: string }) {
  const { hostalId, despuesDeGuardar, fijarTurno, avisar } = useHoy()
  const { usuario } = useSesion()
  const { datos, recargar } = useCarga<Resumen>(`/turnos/${turnoId}`)
  const [notas, setNotas] = useState('')
  const [movs, setMovs] = useState<Movimiento[]>([])
  const [confirmar, setConfirmar] = useState<Registro[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const clave = useRef(1)

  if (!datos) return <Cargando />
  const t = datos.turno
  const declarado = movs.reduce((s, m) => s + (m.monto ?? 0), 0)
  const incompletos = movs.some((m) => !m.monto || (m.tipo === 'depositado' && !m.cuenta.trim()) || (m.tipo === 'entregado' && !m.recibido_por.trim()))

  const agregar = (tipo: Movimiento['tipo']) =>
    setMovs((ms) => [...ms, { clave: clave.current++, tipo, monto: null, cuenta: datos.cuentas_banco[0] ?? '', referencia: '', entregado_por: usuario?.nombre ?? '', recibido_por: '', foto_id: null }])
  const cambiar = (k: number, cambios: Partial<Movimiento>) => setMovs((ms) => ms.map((m) => (m.clave === k ? { ...m, ...cambios } : m)))

  async function cobrar(r: Registro, pago: Pago) {
    try {
      await api(`/registros/${r.id}`, { method: 'PATCH', json: { pago } })
      await Promise.all([recargar(), despuesDeGuardar(`Hab. ${r.habitacion}: ${NOMBRE_PAGO[pago]}`)])
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  async function cerrar(confirmado: boolean) {
    setOcupado(true)
    setError(null)
    try {
      const cerrado = await api<Turno>(`/turnos/${t.id}/cerrar`, {
        method: 'POST',
        json: { notas, confirmar: confirmado, movimientos: movs.map(({ clave: _c, ...m }) => m) },
      })
      setConfirmar(null)
      fijarTurno(cerrado)
      await despuesDeGuardar('Turno cerrado')
    } catch (e) {
      const err = e as Error & { status?: number; datos?: { sin_pago?: Registro[] } }
      if (err.status === 409 && err.datos?.sin_pago) setConfirmar(err.datos.sin_pago)
      else setError(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <h2>
            Cierre del turno de {NOMBRE_TURNO[t.tipo].toLowerCase()}
          </h2>
          <span className="muted">{fechaCorta(t.fecha)}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {t.usuario} · desde {horaHN(t.abierto_en)} · {datos.cobrados} {datos.cobrados === 1 ? 'cobro registrado' : 'cobros registrados'} en este turno
        </p>
      </div>

      {datos.sin_pago.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ color: 'var(--limpieza)' }}>Habitaciones sin forma de pago</h2>
          <p className="muted">Antes de cerrar, registra cómo pagó cada una.</p>
          <ul className="lista">
            {datos.sin_pago.map((r) => (
              <li key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <span>
                  <b>Hab. {r.habitacion}</b> · {r.huesped} · {lempiras(r.precio)}
                </span>
                <div className="acciones">
                  {PAGOS.filter((p) => p !== 'credito' || r.empresa_id).map((p) => (
                    <button key={p} type="button" className="btn chico" onClick={() => void cobrar(r, p)}>
                      {NOMBRE_PAGO[p]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {datos.horas_abiertas.length > 0 && (
        <p className="banda aviso">
          <span>
            <b>Siguen por hora:</b> hab. {datos.horas_abiertas.map((r) => r.habitacion).join(', ')}. Si ya salieron, ciérralas en el tablero.
          </span>
        </p>
      )}

      {datos.ver_totales && datos.por_pago && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Registrado en este turno</h2>
          {PAGOS.filter((p) => datos.por_pago![p]).map((p) => (
            <div key={p} className="fila-monto">
              <span>{p === 'credito' ? 'Crédito (por cobrar)' : NOMBRE_PAGO[p]}</span>
              <span className="num">{lempiras(datos.por_pago![p] ?? 0)}</span>
            </div>
          ))}
          {!Object.keys(datos.por_pago).length && <p className="muted">Todavía no hay cobros en este turno.</p>}
        </div>
      )}

      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <h2>Efectivo</h2>
          {datos.ver_totales && datos.efectivo_esperado != null && <span className="muted">Esperado: {lempiras(datos.efectivo_esperado)}</span>}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Anota solo el efectivo que cobraste en tu turno: lo que entregas y lo que depositas.
        </p>
        {movs.map((m) => (
          <MovimientoCaja key={m.clave} m={m} cuentas={datos.cuentas_banco} hostalId={hostalId} onCambio={(c) => cambiar(m.clave, c)} onQuitar={() => setMovs((ms) => ms.filter((x) => x.clave !== m.clave))} />
        ))}
        <div className="acciones">
          <button type="button" className="btn" onClick={() => agregar('entregado')}>
            + Entregado
          </button>
          <button type="button" className="btn" onClick={() => agregar('depositado')}>
            + Depositado
          </button>
        </div>
        {movs.length > 0 && (
          <>
            <div className="fila-monto total">
              <span>Declarado</span>
              <span className="num">{lempiras(declarado)}</span>
            </div>
            {datos.ver_totales && datos.efectivo_esperado != null && declarado !== datos.efectivo_esperado && (
              <p className="banda aviso" style={{ marginTop: 8 }}>
                <span>
                  <b>{declarado > datos.efectivo_esperado ? 'Sobran' : 'Faltan'} {lempiras(Math.abs(declarado - datos.efectivo_esperado))}</b> contra lo que suman las habitaciones. Revisa antes de cerrar (puedes cerrar igual).
                </span>
              </p>
            )}
          </>
        )}
      </div>

      <div className="tarjeta">
        <label className="campo" style={{ marginBottom: 0 }}>
          <span>Notas para el siguiente turno</span>
          <textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. la 6 pidió salir a las 6 a.m.; falta cobrar a la 3" />
        </label>
      </div>

      {error && <p className="banda rojo">{error}</p>}
      <button type="button" className="btn primario grande ancho" style={{ marginTop: 16 }} disabled={ocupado || incompletos} onClick={() => void cerrar(false)}>
        {ocupado ? 'Cerrando…' : incompletos ? 'Falta completar el efectivo' : `Cerrar turno de ${NOMBRE_TURNO[t.tipo].toLowerCase()}`}
      </button>
      {t.tipo === 'noche' && <p className="muted peq" style={{ textAlign: 'center' }}>Al cerrar el turno de noche se cierra el día: después solo el dueño puede corregirlo.</p>}

      {confirmar && (
        <Hoja titulo="¿Cerrar con habitaciones sin pago?" onCerrar={() => setConfirmar(null)}>
          <p style={{ marginTop: 0 }}>
            {confirmar.length === 1 ? 'Esta habitación no tiene' : 'Estas habitaciones no tienen'} forma de pago: <b>{confirmar.map((r) => r.habitacion).join(', ')}</b>. El dueño lo verá como alerta.
          </p>
          <div className="acciones" style={{ flexDirection: 'column' }}>
            <button type="button" className="btn primario grande ancho" onClick={() => setConfirmar(null)}>
              Volver y registrar el pago
            </button>
            <button type="button" className="btn peligro ancho" disabled={ocupado} onClick={() => void cerrar(true)}>
              Cerrar de todos modos
            </button>
          </div>
        </Hoja>
      )}
    </>
  )
}

function MovimientoCaja({ m, cuentas, hostalId, onCambio, onQuitar }: { m: Movimiento; cuentas: string[]; hostalId: string; onCambio: (c: Partial<Movimiento>) => void; onQuitar: () => void }) {
  const archivo = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const otraCuenta = !cuentas.includes(m.cuenta)
  return (
    <div className="tarjeta" style={{ background: 'var(--surface-2)', marginBottom: 12 }}>
      <div className="tarjeta-cabeza" style={{ marginBottom: 8 }}>
        <b>{m.tipo === 'entregado' ? 'Efectivo entregado' : 'Depósito'}</b>
        <button type="button" className="btn chico fantasma" onClick={onQuitar}>
          Quitar
        </button>
      </div>
      <label className="campo">
        <span>Monto</span>
        <CampoMonto valor={m.monto} onCambio={(v) => onCambio({ monto: v })} autoFocus />
      </label>
      {m.tipo === 'depositado' ? (
        <>
          <div className="campo">
            <span>Cuenta</span>
            {cuentas.length > 0 && (
              <select className="entrada" value={otraCuenta ? '__otra' : m.cuenta} onChange={(e) => onCambio({ cuenta: e.target.value === '__otra' ? '' : e.target.value })}>
                {cuentas.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__otra">Otra cuenta…</option>
              </select>
            )}
            {(otraCuenta || !cuentas.length) && <input className="entrada" value={m.cuenta} onChange={(e) => onCambio({ cuenta: e.target.value })} placeholder="Banco y número de cuenta" />}
          </div>
          <label className="campo">
            <span>Referencia o número de boleta (opcional)</span>
            <input className="entrada" value={m.referencia} onChange={(e) => onCambio({ referencia: e.target.value })} />
          </label>
        </>
      ) : (
        <label className="campo">
          <span>Recibido por</span>
          <input className="entrada" value={m.recibido_por} onChange={(e) => onCambio({ recibido_por: e.target.value })} placeholder="Nombre de quien recibe" />
        </label>
      )}
      <label className="campo">
        <span>Entregado por</span>
        <input className="entrada" value={m.entregado_por} onChange={(e) => onCambio({ entregado_por: e.target.value })} />
      </label>
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setSubiendo(true)
          setError(null)
          try {
            onCambio({ foto_id: await subirFoto(hostalId, m.tipo === 'depositado' ? 'deposito' : 'voucher', f) })
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setSubiendo(false)
          }
        }}
      />
      <div className="acciones" style={{ alignItems: 'center' }}>
        <button type="button" className="btn chico" disabled={subiendo} onClick={() => archivo.current?.click()}>
          <Icono nombre="camara" tam={16} /> {subiendo ? 'Subiendo…' : m.foto_id ? 'Cambiar foto' : m.tipo === 'depositado' ? 'Foto del depósito' : 'Foto (opcional)'}
        </button>
        {m.foto_id && <span className="chip">✓ Foto guardada</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
