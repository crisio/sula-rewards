import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { recordar } from './lib/api'
import { useSesion } from './lib/sesion'
import { Marco } from './components/Marco'
import { Cargando } from './components/ui'
import Entrar from './pages/Entrar'
import { ProveedorHoy, useHoy } from './pages/recepcion/contexto'
import Tablero from './pages/recepcion/Tablero'
import Tareas from './pages/recepcion/Tareas'
import Cierre from './pages/recepcion/Cierre'
import Hoy from './pages/dueno/Hoy'
import Mes from './pages/dueno/Mes'
import Caja from './pages/dueno/Caja'
import Creditos from './pages/dueno/Creditos'
import { Mas, TareasDueno, Historial, Empresas, Personal, Hostales, AjustesPagina, Importar } from './pages/dueno/Mas'

export default function App() {
  const s = useSesion()
  if (s.estado === 'cargando') return <Cargando />
  if (s.estado === 'fuera' || !s.usuario) return <Entrar />
  if (s.usuario.rol === 'recepcion') {
    if (!s.usuario.hostal_id) return <p className="pagina">Tu usuario no tiene hostal asignado. Pide al dueño que lo revise.</p>
    return <RutasRecepcion hostalId={s.usuario.hostal_id} verMes={Boolean(s.ajustes?.recepcion_ve_mes)} />
  }
  return <RutasDueno />
}

function RutasRecepcion({ hostalId, verMes }: { hostalId: string; verMes: boolean }) {
  return (
    <ProveedorHoy hostalId={hostalId}>
      <Routes>
        <Route element={<MarcoRecepcion />}>
          <Route index element={<Tablero rutaCierre="/cierre" />} />
          <Route path="tareas" element={<Tareas />} />
          <Route path="cierre" element={<Cierre />} />
          {verMes && <Route path="mes" element={<Mes hostalId={hostalId} />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProveedorHoy>
  )
}

function MarcoRecepcion() {
  const { datos, turno } = useHoy()
  const { ajustes } = useSesion()
  const pendientes = datos?.tareas.filter((t) => !t.hecha_en).length ?? 0
  return (
    <Marco
      titulo={datos?.hostal.nombre ?? 'Recepción'}
      pestanas={[
        { to: '/', texto: 'Recepción', end: true },
        { to: '/tareas', texto: 'Tareas', contador: pendientes },
        { to: '/cierre', texto: turno?.cerrado_en ? 'Turno cerrado' : 'Cierre de turno' },
        ...(ajustes?.recepcion_ve_mes ? [{ to: '/mes', texto: 'Mes' }] : []),
      ]}
    >
      <Outlet />
    </Marco>
  )
}

const SECCIONES: Record<string, string> = { recepcion: 'Recepción', mes: 'Contabilidad', caja: 'Caja' }
const TITULOS: Record<string, string> = {
  '/': 'Hoy',
  '/creditos': 'Créditos',
  '/tareas': 'Tareas',
  '/historial': 'Historial',
  '/empresas': 'Empresas',
  '/personal': 'Personal',
  '/hostales': 'Hostales y precios',
  '/ajustes': 'Permisos y bloqueo',
  '/importar': 'Importar CSV',
}

function RutasDueno() {
  return (
    <Routes>
      <Route element={<MarcoDueno />}>
        <Route index element={<Hoy />} />
        <Route path="h/:h/recepcion" element={<RecepcionDueno />} />
        <Route path="h/:h/mes" element={<Mes />} />
        <Route path="h/:h/caja" element={<Caja />} />
        <Route path="creditos" element={<Creditos />} />
        <Route path="mas" element={<Mas />} />
        <Route path="tareas" element={<TareasDueno />} />
        <Route path="historial" element={<Historial />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="personal" element={<Personal />} />
        <Route path="hostales" element={<Hostales />} />
        <Route path="ajustes" element={<AjustesPagina />} />
        <Route path="importar" element={<Importar />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function RecepcionDueno() {
  const { h } = useParams()
  return (
    <ProveedorHoy key={h} hostalId={h!}>
      <Tablero />
    </ProveedorHoy>
  )
}

export function useHostalDueno() {
  const { hostales } = useSesion()
  const { pathname } = useLocation()
  const enRuta = pathname.match(/^\/h\/([^/]+)\/(\w+)/)
  const guardado = recordar.leer('hs_hostal_dueno')
  const id = enRuta?.[1] ?? (hostales.some((h) => h.id === guardado) ? guardado! : hostales[0]?.id)
  return { id, seccion: enRuta?.[2] ?? null, hostal: hostales.find((h) => h.id === id) ?? null }
}

function MarcoDueno() {
  const { hostales } = useSesion()
  const { id, seccion, hostal } = useHostalDueno()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    if (id) recordar.guardar('hs_hostal_dueno', id)
  }, [id])
  const titulo = seccion ? (hostal?.nombre ?? '') : (TITULOS[pathname] ?? 'Más')
  return (
    <Marco
      titulo={titulo}
      hostales={seccion ? hostales.map((h) => ({ id: h.id, nombre: h.nombre, habitaciones: h.habitaciones.filter((x) => x.activa).length })) : undefined}
      hostalActual={id}
      onHostal={(nuevo) => navigate(`/h/${nuevo}/${seccion ?? 'recepcion'}`)}
      pestanas={[
        { to: '/', texto: 'Hoy', end: true },
        { to: `/h/${id}/recepcion`, texto: SECCIONES.recepcion },
        { to: `/h/${id}/mes`, texto: SECCIONES.mes },
        { to: `/h/${id}/caja`, texto: SECCIONES.caja },
        { to: '/creditos', texto: 'Créditos' },
        { to: '/mas', texto: 'Más' },
      ]}
    >
      <Outlet />
    </Marco>
  )
}
