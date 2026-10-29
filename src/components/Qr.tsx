import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Código QR como imagen (para la tarjeta en caja o el cartel del mostrador). */
export default function Qr({ value, alt, size = 440 }: { value: string; alt: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc, () => setSrc(null))
  }, [value, size])
  return src ? <img src={src} alt={alt} width={size / 2} height={size / 2} /> : <div style={{ width: size / 2, height: size / 2 }} />
}
