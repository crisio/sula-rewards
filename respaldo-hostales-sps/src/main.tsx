import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { aplicarTema } from './components/Marco'
import { recordar } from './lib/api'
import { SesionProvider } from './lib/sesion'
import './styles.css'

const tema = recordar.leer('hs_tema')
if (tema === 'claro' || tema === 'oscuro') aplicarTema(tema)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
)
