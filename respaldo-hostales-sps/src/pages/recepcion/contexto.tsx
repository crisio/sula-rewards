import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Empresa, Hostal, Registro, Tarea, TipoHabitacion, Turno } from '../../../shared/reglas'
import { api } from '../../lib/api'
import { useAviso, useCarga, useVigilar } from '../../lib/hooks'
import { useSesion } from '../../lib/sesion'
import { AvisoFlotante } from '../../components/ui'

export interface DatosHoy {
  fecha: string
  ayer: string
  ahora: number
  version: number
  hostal: Hostal
  hoy: Registro[]
  anoche: Registro[]
  turnos: Turno[]
  nota_anterior: Turno | null
  dia_cerrado: boolean
  tareas: Tarea[]
  ver_totales: boolean
}

export interface Sugerencias {
  huespedes: { huesped: string; empresa: string | null; tipo: TipoHabitacion; fecha: string }[]
  tipos: Record<string, TipoHabitacion>
}

interface ContextoHoy {
  hostalId: string
  datos: DatosHoy | null
  error: string | null
  recargar: () => Promise<void>
  sugerencias: Sugerencias
  empresas: Empresa[]
  recargarEmpresas: () => Promise<void>
  /** Turno de quien está en recepción (null para el dueño o si aún no se abrió). */
  turno: Turno | null
  mensajeTurno: string | null
  abrirTurno: (siguiente?: boolean) => Promise<void>
  fijarTurno: (t: Turno | null) => void
  avisar: (texto: string, tipo?: 'ok' | 'error') => void
  /** Después de guardar: recarga el día, las sugerencias y las empresas. */
  despuesDeGuardar: (texto?: string) => Promise<void>
}

const Contexto = createContext<ContextoHoy | null>(null)

export function useHoy() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useHoy fuera de ProveedorHoy')
  return c
}

export function ProveedorHoy({ hostalId, children, alGuardar }: { hostalId: string; children: ReactNode; alGuardar?: () => void }) {
  const { usuario } = useSesion()
  const hoy = useCarga<DatosHoy>(`/hostales/${hostalId}/hoy`)
  const sug = useCarga<Sugerencias>(`/hostales/${hostalId}/sugerencias`)
  const emp = useCarga<{ empresas: Empresa[] }>('/empresas')
  const { aviso, mostrar } = useAviso()
  const [turno, setTurno] = useState<Turno | null>(null)
  const [mensajeTurno, setMensajeTurno] = useState<string | null>(null)

  useVigilar(`/hostales/${hostalId}/version`, () => void hoy.recargar())

  const abrirTurno = useCallback(
    async (siguiente = false) => {
      if (usuario?.rol !== 'recepcion') return
      try {
        const r = await api<{ turno: Turno | null; mensaje?: string }>(`/hostales/${hostalId}/turnos/actual`, { method: 'POST', json: { siguiente } })
        setTurno(r.turno)
        setMensajeTurno(r.mensaje ?? null)
      } catch (e) {
        mostrar((e as Error).message, 'error')
      }
    },
    [hostalId, usuario?.rol, mostrar],
  )

  useEffect(() => {
    void abrirTurno()
  }, [abrirTurno])

  // Si el turno cambió en otro teléfono (por ejemplo, se cerró), se refleja aquí.
  useEffect(() => {
    if (!turno || !hoy.datos) return
    const t = hoy.datos.turnos.find((x) => x.id === turno.id)
    if (t && (t.cerrado_en !== turno.cerrado_en || t.usuario !== turno.usuario)) setTurno(t)
  }, [hoy.datos, turno])

  const despuesDeGuardar = useCallback(
    async (texto?: string) => {
      if (texto) mostrar(texto)
      alGuardar?.()
      await Promise.all([hoy.recargar(), sug.recargar(), emp.recargar()])
    },
    [hoy, sug, emp, mostrar, alGuardar],
  )

  return (
    <Contexto.Provider
      value={{
        hostalId,
        datos: hoy.datos,
        error: hoy.error,
        recargar: hoy.recargar,
        sugerencias: sug.datos ?? { huespedes: [], tipos: {} },
        empresas: emp.datos?.empresas ?? [],
        recargarEmpresas: emp.recargar,
        turno,
        mensajeTurno,
        abrirTurno,
        fijarTurno: setTurno,
        avisar: mostrar,
        despuesDeGuardar,
      }}
    >
      {children}
      <AvisoFlotante aviso={aviso} />
    </Contexto.Provider>
  )
}
