import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { isConfigured } from './lib/api'
import Landing from './pages/Landing'

// La página de inicio va en el bundle inicial; lo demás se carga al entrar.
const Login = lazy(() => import('./pages/Login'))
const PanelHome = lazy(() => import('./pages/PanelHome'))
const NewProgram = lazy(() => import('./pages/NewProgram'))
const ProgramPage = lazy(() => import('./pages/ProgramPage'))
const StaffCardPage = lazy(() => import('./pages/StaffCardPage'))
const Scan = lazy(() => import('./pages/Scan'))
const Join = lazy(() => import('./pages/Join'))
const PublicCard = lazy(() => import('./pages/PublicCard'))

function NeedsApi({ children }: { children: ReactNode }) {
  if (isConfigured) return children
  return (
    <main className="page narrow" style={{ paddingTop: 48 }}>
      <div className="panel stack">
        <h2>Falta conectar la API</h2>
        <p className="muted">Define VITE_API_URL en .env.local (local) o como variable del repositorio en GitHub. Revisa el README.</p>
      </div>
    </main>
  )
}

/** El panel del comercio pide sesión; al entrar regresa a donde iba. */
function Private({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<p className="center muted" style={{ paddingTop: 80 }}>Cargando…</p>}>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="entrar" element={<NeedsApi><Login /></NeedsApi>} />
        <Route path="unete/:slug" element={<NeedsApi><Join /></NeedsApi>} />
        <Route path="tarjeta/:id" element={<NeedsApi><PublicCard /></NeedsApi>} />
        <Route path="panel" element={<NeedsApi><Private><PanelHome /></Private></NeedsApi>} />
        <Route path="panel/programas/nuevo" element={<NeedsApi><Private><NewProgram /></Private></NeedsApi>} />
        <Route path="panel/programas/:id" element={<NeedsApi><Private><ProgramPage /></Private></NeedsApi>} />
        <Route path="panel/tarjetas/:id" element={<NeedsApi><Private><StaffCardPage /></Private></NeedsApi>} />
        <Route path="panel/escanear" element={<NeedsApi><Private><Scan /></Private></NeedsApi>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
