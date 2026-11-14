import { useMemo, useState } from 'react'
import { fechaCorta } from '../../../shared/fechas'
import { NOMBRE_PAGO, type Registro } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { lempiras } from '../../lib/formato'
import { Hoja } from '../../components/ui'
import { useHoy } from './contexto'

/** Huéspedes de anoche que todavía no están en la noche de hoy (y cuya habitación sigue disponible). */
export function candidatosDeAyer(hoy: Registro[], anoche: Registro[]) {
  const ocupadas = new Set(hoy.filter((r) => r.modo === 'noche' || r.salida_en == null).map((r) => r.habitacion))
  for (const r of anoche) if (r.modo === 'hora' && r.salida_en == null) ocupadas.add(r.habitacion)
  return anoche.filter((r) => r.modo === 'noche' && r.salida_en == null && !ocupadas.has(r.habitacion))
}

export function CopiarAyer({ onCerrar }: { onCerrar: () => void }) {
  const { datos, hostalId, despuesDeGuardar, avisar } = useHoy()
  const candidatos = useMemo(() => (datos ? candidatosDeAyer(datos.hoy, datos.anoche) : []), [datos])
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [copiarPago, setCopiarPago] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  if (!datos) return null

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todos = elegidos.size === candidatos.length

  async function copiar() {
    setOcupado(true)
    try {
      const r = await api<{ copiados: unknown[]; omitidos: { habitacion: string; motivo: string }[] }>(`/hostales/${hostalId}/copiar`, {
        method: 'POST',
        json: { ids: [...elegidos], copiar_pago: copiarPago },
      })
      await despuesDeGuardar(`${r.copiados.length} ${r.copiados.length === 1 ? 'huésped sigue' : 'huéspedes siguen'} hospedados`)
      if (r.omitidos.length) avisar(r.omitidos.map((o) => o.motivo).join(' '), 'error')
      onCerrar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Hoja
      titulo="Copiar huéspedes de ayer"
      subtitulo={`De la noche del ${fechaCorta(datos.ayer)} a la de hoy`}
      onCerrar={onCerrar}
      pie={
        <button type="button" className="btn primario grande ancho" disabled={!elegidos.size || ocupado} onClick={() => void copiar()}>
          {ocupado ? 'Copiando…' : elegidos.size ? `Siguen ${elegidos.size} ${elegidos.size === 1 ? 'huésped' : 'huéspedes'}` : 'Elige quién sigue'}
        </button>
      }
    >
      {candidatos.length === 0 ? (
        <p className="vacio">No hay huéspedes de anoche por copiar.</p>
      ) : (
        <>
          <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="muted">Marca los que siguen hospedados.</span>
            <button type="button" className="btn chico" onClick={() => setElegidos(todos ? new Set() : new Set(candidatos.map((c) => c.id)))}>
              {todos ? 'Quitar todos' : 'Todos'}
            </button>
          </div>
          <ul className="lista">
            {candidatos.map((r) => (
              <li key={r.id}>
                <label className="casilla" style={{ flex: 1 }}>
                  <input type="checkbox" checked={elegidos.has(r.id)} onChange={() => alternar(r.id)} />
                  <span>
                    <b>
                      Hab. {r.habitacion} · {r.huesped}
                    </b>
                    <br />
                    <span className="muted peq">
                      {[r.empresa, r.tipo, lempiras(r.precio), r.pago ? NOMBRE_PAGO[r.pago] : 'sin pago'].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <label className="casilla" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={copiarPago} onChange={(e) => setCopiarPago(e.target.checked)} />
            <span>
              Copiar también la forma de pago <span className="muted peq">(el crédito siempre se copia; si no, queda «sin pago» para cobrar hoy)</span>
            </span>
          </label>
        </>
      )}
    </Hoja>
  )
}
