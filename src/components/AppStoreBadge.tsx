import { useEffect, useState } from 'react'
import { AppleIcon } from './Icons'

// La app de iOS en App Store Connect (ios/README.md). Mientras Apple no la publique, la búsqueda devuelve 0 resultados.
const APP_ID = '6828603679'
const LOOKUP = `https://itunes.apple.com/lookup?id=${APP_ID}&country=hn`
const FALLBACK_URL = `https://apps.apple.com/hn/app/id${APP_ID}`

/** «Pronto en el App Store» hasta que la app esté publicada; después, el enlace para descargarla. */
export default function AppStoreBadge() {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(LOOKUP)
      .then((res) => res.json())
      .then((data: { resultCount: number; results: { trackViewUrl?: string }[] }) => {
        if (!cancelled && data.resultCount > 0) setUrl(data.results[0].trackViewUrl ?? FALLBACK_URL)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (url) {
    return (
      <a className="btn btn-primary" href={url} target="_blank" rel="noopener">
        <AppleIcon /> Descargar en el App Store
      </a>
    )
  }
  return (
    <span className="chip chip-dark">
      <AppleIcon /> Pronto en el App Store
    </span>
  )
}
