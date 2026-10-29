import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from './Logo'

/** Barra del panel del comercio: logo, regreso opcional y salir. */
export default function PanelBar({ back, title }: { back?: string; title?: string }) {
  const { signOut } = useAuth()
  return (
    <header className="topbar no-print">
      {back ? (
        <Link to={back} className="btn btn-ghost" aria-label="Regresar">
          ‹ {title ?? 'Regresar'}
        </Link>
      ) : (
        <Logo to="/panel" />
      )}
      <button className="btn btn-ghost" onClick={() => void signOut()}>
        Salir
      </button>
    </header>
  )
}
