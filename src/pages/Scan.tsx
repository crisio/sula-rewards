import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PanelBar from '../components/PanelBar'

/** Del QR sale el id de la tarjeta; si alguien imprimió el enlace (/tarjeta/<id>), se toma el final. */
function cardIdFrom(text: string) {
  const fromUrl = text.match(/\/tarjeta\/([0-9A-Za-z-]+)/)?.[1]
  const raw = (fromUrl ?? text).trim().toUpperCase().replace(/-/g, '')
  return /^[0-9A-Z]{12}$/.test(raw) ? raw : null
}

export default function Scan() {
  const navigate = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [notCard, setNotCard] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        setError('No pudimos abrir la cámara. Dale permiso en el navegador o escribe el código a mano en el panel.')
        return
      }
      if (stopped || !video.current) return
      video.current.srcObject = stream
      await video.current.play().catch(() => {})
      // jsQR se carga solo aquí (no hace falta en el resto de la app).
      const { default: jsQR } = await import('jsqr')

      const tick = () => {
        if (stopped) return
        const v = video.current
        if (v && ctx && v.readyState >= v.HAVE_ENOUGH_DATA) {
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0)
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            const id = cardIdFrom(code.data)
            if (id) {
              navigator.vibrate?.(80)
              navigate(`/panel/tarjetas/${id}`, { replace: true })
              return
            }
            setNotCard(true)
          }
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [navigate])

  return (
    <main className="page narrow">
      <PanelBar back="/panel" title="Panel" />
      <div className="stack scanner">
        <h1 style={{ fontSize: 24 }}>Escanea la tarjeta del cliente</h1>
        <p className="muted" style={{ margin: 0 }}>
          Pídele que abra su tarjeta en el Wallet y apunta la cámara al QR.
        </p>
        {error ? <p className="notice notice-error">{error}</p> : <video ref={video} playsInline muted />}
        {notCard && <p className="notice">Ese QR no es de una tarjeta de Sula Rewards.</p>}
      </div>
    </main>
  )
}
