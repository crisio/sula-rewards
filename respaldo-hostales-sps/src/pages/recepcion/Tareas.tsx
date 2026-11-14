import { useState } from 'react'
import { horaHN } from '../../../shared/fechas'
import { NOMBRE_TURNO, type Tarea } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { Cargando } from '../../components/ui'
import { useHoy } from './contexto'

export default function Tareas() {
  const { datos, despuesDeGuardar, avisar } = useHoy()
  const [ocupada, setOcupada] = useState<string | null>(null)
  if (!datos) return <Cargando />
  const pendientes = datos.tareas.filter((t) => !t.hecha_en)
  const hechas = datos.tareas.filter((t) => t.hecha_en)

  async function marcar(t: Tarea, hecha: boolean) {
    setOcupada(t.id)
    try {
      await api(`/tareas/${t.id}`, { method: 'PATCH', json: { hecha } })
      await despuesDeGuardar(hecha ? 'Tarea hecha' : 'Tarea pendiente otra vez')
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setOcupada(null)
    }
  }

  return (
    <>
      <div className="tarjeta">
        <div className="tarjeta-cabeza">
          <h2>Tareas de este turno</h2>
          <span className="muted">{pendientes.length ? `${pendientes.length} pendientes` : 'Todo hecho'}</span>
        </div>
        {pendientes.length === 0 ? (
          <p className="vacio">No hay tareas pendientes. El dueño las asigna desde su panel.</p>
        ) : (
          <ul className="lista">
            {pendientes.map((t) => (
              <li key={t.id}>
                <label className="casilla" style={{ flex: 1 }}>
                  <input type="checkbox" checked={false} disabled={ocupada === t.id} onChange={() => void marcar(t, true)} />
                  <span>
                    <b>{t.texto}</b>
                    <br />
                    <span className="muted peq">{[t.usuario ? `Para ${t.usuario}` : 'Para cualquiera', t.turno ? `turno de ${NOMBRE_TURNO[t.turno].toLowerCase()}` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hechas.length > 0 && (
        <div className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Hechas</h2>
          <ul className="lista">
            {hechas.map((t) => (
              <li key={t.id}>
                <label className="casilla" style={{ flex: 1 }}>
                  <input type="checkbox" checked disabled={ocupada === t.id} onChange={() => void marcar(t, false)} />
                  <span>
                    <span style={{ textDecoration: 'line-through' }}>{t.texto}</span>
                    <br />
                    <span className="muted peq">
                      Hecha por {t.hecha_por_nombre} · {horaHN(t.hecha_en!)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
