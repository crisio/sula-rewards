import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import AppStoreBadge from '../components/AppStoreBadge'
import Logo from '../components/Logo'
import WalletCard from '../components/WalletCard'
import { AppleIcon, GoogleWalletIcon, TypeIcon } from '../components/Icons'
import { savedCards } from '../lib/myCards'
import { DEFAULT_COLOR } from '../lib/format'
import type { ProgramType } from '../lib/types'

// Negocios de ejemplo para la pila del Wallet.
const DEMO = [
  { type: 'giftcard', businessName: 'Boutique Los Álamos', headline: { label: 'Gift card', value: 'L 500.00' } },
  { type: 'cashback', businessName: 'Súper Río Blanco', headline: { label: 'Cashback 5%', value: 'L 124.00' } },
  { type: 'puntos', businessName: 'Baleadas El Merendón', headline: { label: 'Puntos', value: '1,250' } },
] as const

const TYPES: { type: ProgramType; title: string; text: string; example: string }[] = [
  { type: 'sellos', title: 'Sellos', text: 'La clásica tarjetita de cartón, pero en el teléfono. Cada visita es un sello.', example: '8 cafés = 1 gratis' },
  { type: 'puntos', title: 'Puntos', text: 'Por cada L 100 de compra suman puntos que cambian por premios.', example: '10 puntos por cada L 100' },
  { type: 'cashback', title: 'Cashback', text: 'Un porcentaje de cada compra regresa como saldo para la próxima visita.', example: '5 % de vuelta en lempiras' },
  { type: 'giftcard', title: 'Gift cards', text: 'Tarjetas de regalo con saldo, para vender en caja y cobrar con el QR.', example: 'L 500 para regalar' },
]

// Capturas de la app de iOS (public/app), las mismas de la App Store.
const SHOTS = [
  { file: '01-tarjetas.jpg', alt: 'Mis tarjetas: las tarjetas de lealtad de cada negocio' },
  { file: '02-tarjeta.jpg', alt: 'Una tarjeta con su QR para caja y el botón para agregarla al Wallet' },
  { file: '03-explorar.jpg', alt: 'Explorar: promociones y negocios de San Pedro Sula' },
  { file: '06-caja-tarjeta.jpg', alt: 'La caja del negocio: 7 de 8 sellos y el botón +1 sello' },
]

export default function Landing() {
  const { user } = useAuth()
  const mine = savedCards()
  return (
    <>
      <header className="page topbar">
        <Logo />
        <Link className="btn btn-primary" to={user ? '/panel' : '/entrar'}>
          {user ? 'Mi panel' : 'Entrar'}
        </Link>
      </header>

      <main className="page">
        <section className="hero">
          <div className="stack" style={{ gap: 24 }}>
            <h1>
              Que tus clientes <em>vuelvan</em>. Su tarjeta vive en su Wallet.
            </h1>
            <p>Sellos, puntos, cashback y gift cards para los negocios de San Pedro Sula. Sin apps que descargar y sin tarjetas de cartón que se pierden.</p>
            <div className="chips" aria-label="Funciona con">
              <span className="chip chip-dark">
                <AppleIcon /> Apple Wallet
              </span>
              <span className="chip chip-light">
                <GoogleWalletIcon /> Google Wallet
              </span>
              <span className="chip chip-sellos">Sellos</span>
              <span className="chip chip-puntos">Puntos</span>
              <span className="chip chip-cashback">Cashback</span>
              <span className="chip chip-giftcard">Gift cards</span>
            </div>
            <div className="row">
              <Link className="btn btn-primary btn-big" to={user ? '/panel' : '/entrar'}>
                Crear mi programa gratis
              </Link>
              <AppStoreBadge />
            </div>
          </div>

          <div className="phone" aria-label="Ejemplo de tarjetas en el Wallet de un teléfono">
            <div className="phone-screen">
              <div className="phone-status">
                <span>9:41</span>
                <span>●●● ▮</span>
              </div>
              <div className="phone-title">Wallet</div>
              <div className="wallet-stack">
                {DEMO.map((card) => (
                  <WalletCard key={card.businessName} {...card} color={DEFAULT_COLOR[card.type]} compact />
                ))}
                <WalletCard
                  type="sellos"
                  color={DEFAULT_COLOR.sellos}
                  businessName="Café Guamilito"
                  headline={{ label: 'Sellos', value: '7/8' }}
                  stamps={7}
                  stampsGoal={8}
                  customerName="Gabriela Mejía"
                  reward="Café gratis"
                />
              </div>
            </div>
          </div>
        </section>

        {mine.length > 0 && (
          <section className="panel stack" style={{ marginBottom: 24 }}>
            <h2>Tus tarjetas</h2>
            <ul className="list">
              {mine.map((card) => (
                <li key={card.id}>
                  <Link className="list-item" to={`/tarjeta/${card.id}`}>
                    <span className="row">
                      <span className="dot" style={{ background: card.color }} />
                      <strong>{card.business}</strong>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="section">
          <h2>Así funciona</h2>
          <div className="steps">
            <div className="panel">
              <h3>Crea tu programa</h3>
              <p className="muted">En dos minutos: eliges sellos, puntos, cashback o gift card, el premio y el color de tu marca.</p>
            </div>
            <div className="panel">
              <h3>Tu cliente se une con un QR</h3>
              <p className="muted">Imprimes el cartel para el mostrador. Lo escanea, pone su nombre y celular, y guarda la tarjeta en Apple o Google Wallet.</p>
            </div>
            <div className="panel">
              <h3>En caja le sumas</h3>
              <p className="muted">Escaneas su tarjeta con el teléfono de la caja y le das el sello, los puntos o el cashback. Su tarjeta se actualiza sola.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="row spread app-head">
            <div className="stack" style={{ gap: 8 }}>
              <h2>La app para iPhone</h2>
              <p className="muted" style={{ margin: 0 }}>
                Tus clientes ven todas sus tarjetas y las promociones de Explorar. Tu negocio suma sellos y puntos con la cámara.
              </p>
            </div>
            <AppStoreBadge />
          </div>
          <div className="app-shots">
            {SHOTS.map((s) => (
              <img key={s.file} src={`${import.meta.env.BASE_URL}app/${s.file}`} alt={s.alt} width={460} height={1000} loading="lazy" />
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Cuatro formas de premiar</h2>
          <div className="types">
            {TYPES.map((t) => (
              <div key={t.type} className="panel stack" style={{ gap: 8 }}>
                <span className={`chip chip-${t.type}`} style={{ justifySelf: 'start' }}>
                  <TypeIcon type={t.type} /> {t.title}
                </span>
                <p style={{ margin: 0 }}>{t.text}</p>
                <span className="small muted">{t.example}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="panel stack">
            <h2>Hecho en San Pedro Sula</h2>
            <p className="muted" style={{ margin: 0 }}>
              Montos en lempiras, celulares de Honduras (+504) y la tarjeta se manda por WhatsApp. Para cafeterías, baleadas, salones, farmacias,
              boutiques y súper del Valle de Sula.
            </p>
          </div>
        </section>
      </main>

      <footer className="page footer row spread">
        <span>© {new Date().getFullYear()} Sula Rewards · San Pedro Sula, Honduras</span>
        <span>Los negocios de las tarjetas de ejemplo son ficticios.</span>
      </footer>
    </>
  )
}
