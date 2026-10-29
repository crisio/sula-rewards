import { zlibSync } from 'fflate'
import { concat } from './der'
import type { ProgramType } from './env'

// Imágenes de los pases, dibujadas en el Worker como en la tarjeta de la web (src/components/WalletCard.tsx): la tira
// de sellos, el logo (el ícono del programa en un cuadro blanco) y el ícono de las notificaciones. La tira es un PNG
// con paleta: todo es el color del programa mezclado con blanco, así que 17 tonos alcanzan para bordes suaves y el
// PNG sale chico y rápido. El logo lleva transparencia (RGBA).

const LEVELS = 16

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const head = new Uint8Array(8)
  const view = new DataView(head.buffer)
  view.setUint32(0, data.length)
  head.set(new TextEncoder().encode(type), 4)
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(concat(head.subarray(4), data)))
  return concat(head, data, crc)
}

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Arma el PNG con los pixeles ya comprimidos (`idat`). */
function pngFrom(width: number, height: number, colorType: 3 | 6, extra: Uint8Array[], idat: Uint8Array) {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, colorType, 0, 0, 0], 8) // 8 bits, sin entrelazado
  return concat(SIGNATURE, chunk('IHDR', ihdr), ...extra, chunk('IDAT', idat), chunk('IEND', new Uint8Array()))
}

const png = (width: number, height: number, colorType: 3 | 6, extra: Uint8Array[], raw: Uint8Array) =>
  pngFrom(width, height, colorType, extra, zlibSync(raw, { level: 6 }))

function palette(hex: string) {
  const [r, g, b] = rgbOf(hex)
  const out = new Uint8Array((LEVELS + 1) * 3)
  for (let l = 0; l <= LEVELS; l++) {
    const t = l / LEVELS
    out.set([r, g, b].map((v) => Math.round(v + (255 - v) * t)), l * 3)
  }
  return chunk('PLTE', out)
}

/** PNG indexado: `alpha` trae, por pixel, cuánto blanco lleva encima del color de fondo (0 a 1). */
function encode(width: number, height: number, hex: string, alpha: Float32Array) {
  const raw = new Uint8Array((width + 1) * height) // cada fila empieza con su filtro (0 = ninguno)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.round(alpha[y * width + x] * LEVELS)
  }
  return png(width, height, 3, [palette(hex)], raw)
}

/** PNG con transparencia: `pixels` trae RGBA por pixel. */
export function encodeRGBA(width: number, height: number, pixels: Uint8Array) {
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  return png(width, height, 6, [], raw)
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  const t = length2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / length2)
  const ex = px - (ax + t * dx)
  const ey = py - (ay + t * dy)
  return Math.sqrt(ex * ex + ey * ey)
}

type Path = readonly (readonly [number, number])[]

function distToPath(px: number, py: number, path: Path) {
  let d = Infinity
  for (let i = 1; i < path.length; i++) d = Math.min(d, distToSegment(px, py, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]))
  return d
}

/** Distancia con signo al borde de un rectángulo redondeado centrado en (0, 0): negativa adentro. */
export function roundedRectDist(px: number, py: number, halfWidth: number, halfHeight: number, radius: number) {
  const qx = Math.abs(px) - (halfWidth - radius)
  const qy = Math.abs(py) - (halfHeight - radius)
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius
}

/** Puntos de un arco de círculo (grados, con y hacia abajo como en SVG). */
const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = 12): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

const mirror = (path: Path): Path => path.map(([x, y]) => [24 - x, y])

// Los íconos de la web (src/components/Icons.tsx) como trazos en una caja de 24, de 2 de grueso.
const GIFT_BOW: Path = [[12, 8], [10.6, 6], [8.5, 5.3], [6.6, 5.8], [6, 7], [6.8, 7.8], [9, 8], [12, 8]]
const ICONS: Record<ProgramType, Path[]> = {
  // Taza
  sellos: [
    [[4, 8], [16, 8], [16, 13], ...arc(11, 13, 5, 0, 90), [9, 18], ...arc(9, 13, 5, 90, 180), [4, 8]],
    [[16, 10], [17.5, 10], ...arc(17.5, 12.5, 2.5, -90, 90), [16, 15]],
    [[7, 3], [7, 5]],
    [[11, 3], [11, 5]],
  ],
  // Estrella
  puntos: [[[12, 3], [14.7, 8.6], [20.8, 9.5], [16.4, 13.8], [17.4, 19.9], [12, 17], [6.6, 19.9], [7.6, 13.8], [3.2, 9.5], [9.3, 8.6], [12, 3]]],
  // Moneda
  cashback: [
    arc(12, 12, 9, 0, 360, 48),
    [[9, 9.5], [9.4, 8.3], [10.6, 7.6], [12, 7.5], [13.4, 7.6], [14.6, 8.3], [15, 9.5], [14.3, 10.6], [12, 11.7], [9.7, 12.6], [9, 14], [9.5, 15.3], [10.7, 15.9], [12, 16], [13.4, 15.9], [14.6, 15.2], [15, 14]],
    [[12, 5.5], [12, 7.5]],
    [[12, 16.5], [12, 18.5]],
  ],
  // Regalo
  giftcard: [
    [[5, 8], [19, 8], ...arc(19, 10, 2, -90, 0, 4), [21, 19], ...arc(19, 19, 2, 0, 90, 4), [5, 21], ...arc(5, 19, 2, 90, 180, 4), [3, 10], ...arc(5, 10, 2, 180, 270, 4)],
    [[12, 8], [12, 21]],
    [[3, 12], [21, 12]],
    GIFT_BOW,
    mirror(GIFT_BOW),
  ],
}

// La palomita de los sellos llenos (CheckIcon de la web), de 3 de grueso.
const CHECK: Path = [[5, 12.5], [9.5, 17], [19, 7.5]]

// Las imágenes solo dependen de sus datos: se guardan las últimas para no volver a dibujarlas en cada pase.
const cache = new Map<string, Uint8Array>()
function cached(key: string, draw: () => Uint8Array) {
  let image = cache.get(key)
  if (!image) {
    image = draw()
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, image)
  }
  return image
}

/**
 * La tira de sellos, como en la tarjeta de la web: un panel claro con un círculo punteado por sello, blancos y con
 * palomita los que ya tiene. Apple la muestra en 375×144 puntos (storeCard) y Google como heroImage (375×123). Deja
 * margen a los lados para que no se corte. Hasta 10 sellos en una fila; más, en dos.
 *
 * Para que el Worker no gaste CPU, cada tipo de sello (vacío o lleno) se dibuja una vez y se copia a su lugar.
 */
export function stampStrip(color: string, goal: number, filled: number, scale = 2, heightPt = 123) {
  const width = Math.round(375 * scale)
  const height = Math.round(heightPt * scale)
  // Los pixeles no dependen del color (solo la paleta): se comprimen una vez por acomodo y sirven para todos los programas.
  const idat = cached(`strip:${goal}:${filled}:${scale}:${heightPt}`, () => {
    const rows = goal > 10 ? 2 : 1
    const perRow = Math.ceil(goal / rows)
    const pad = Math.round(12 * scale)
    const gap = Math.round(8 * scale)
    const d = Math.floor(
      Math.min((width - 32 * scale - 2 * pad - (perRow - 1) * gap) / perRow, (height - 20 * scale - 2 * pad - (rows - 1) * gap) / rows, 52 * scale),
    )
    const panelW = perRow * d + (perRow - 1) * gap + 2 * pad
    const panelH = rows * d + (rows - 1) * gap + 2 * pad
    const left = Math.round((width - panelW) / 2)
    const top = Math.round((height - panelH) / 2)
    const level = (v: number) => Math.round(v * LEVELS)
    const raw = new Uint8Array((width + 1) * height) // cada fila: su filtro (0 = ninguno) y el tono de cada pixel

    // El panel: 10 % de blanco, con esquinas redondeadas.
    const radius = 14 * scale
    const inside = level(0.1)
    for (let y = top; y < top + panelH; y++) {
      const py = y + 0.5 - top - panelH / 2
      const row = y * (width + 1) + 1
      raw.fill(inside, row + left, row + left + panelW)
      if (Math.abs(py) < panelH / 2 - radius) continue
      for (let x = left; x < left + panelW; x++) {
        const px = x + 0.5 - left - panelW / 2
        if (Math.abs(px) >= panelW / 2 - radius) raw[row + x] = level(clamp01(0.5 - roundedRectDist(px, py, panelW / 2, panelH / 2, radius)) * 0.1)
      }
    }

    // Los dos sellos: vacío (borde punteado) y lleno (blanco con palomita), sobre el panel.
    const r = d / 2
    const ring = 2 * scale
    const ringR = r - ring / 2
    const dashes = Math.max(8, Math.round((2 * Math.PI * ringR) / (6 * scale)))
    const period = (2 * Math.PI * ringR) / dashes
    const u = (0.55 * d) / 24 // la palomita ocupa el 55 % del sello
    const tile = (full: boolean) => {
      const out = new Uint8Array(d * d)
      for (let y = 0; y < d; y++) {
        for (let x = 0; x < d; x++) {
          const dx = x + 0.5 - r
          const dy = y + 0.5 - r
          const dist = Math.sqrt(dx * dx + dy * dy)
          let v = 0.1
          if (full) {
            const disc = clamp01(r + 0.5 - dist)
            if (disc > 0) v = v * (1 - disc) + disc * (1 - clamp01(1.5 * u + 0.5 - distToPath(dx / u + 12, dy / u + 12, CHECK) * u))
          } else {
            const band = clamp01(ring / 2 + 0.5 - Math.abs(dist - ringR))
            if (band > 0) {
              // Borde punteado: dentro de cada periodo, el 55 % es trazo; la orilla de cada trazo se suaviza.
              const t = ((((Math.atan2(dy, dx) / (2 * Math.PI)) * dashes) % 1) + 1) % 1
              const edge = t < 0.55 ? Math.min(t, 0.55 - t) * period : -Math.min(t - 0.55, 1 - t) * period
              const a = band * clamp01(edge + 0.5) * 0.55
              v = v * (1 - a) + a
            }
          }
          out[y * d + x] = level(v)
        }
      }
      return out
    }
    const tiles = { empty: filled < goal ? tile(false) : null, full: filled > 0 ? tile(true) : null }
    for (let i = 0; i < goal; i++) {
      const source = i < filled ? tiles.full! : tiles.empty!
      const x = left + pad + (i % perRow) * (d + gap)
      const y = top + pad + Math.floor(i / perRow) * (d + gap)
      for (let ty = 0; ty < d; ty++) raw.set(source.subarray(ty * d, ty * d + d), (y + ty) * (width + 1) + 1 + x)
    }
    return zlibSync(raw, { level: 6 })
  })
  return pngFrom(width, height, 3, [palette(color)], idat)
}

/** El logo del pase, como en la tarjeta de la web: el ícono del tipo de programa en su color, en un cuadro blanco. */
export function programLogo(type: ProgramType, color: string, size: number) {
  return cached(`logo:${type}:${color}:${size}`, () => {
    const [r, g, b] = rgbOf(color)
    const half = size / 2
    const u = (size * 0.6) / 24 // el ícono ocupa 18 de los 30 puntos del cuadro
    // Distancia de cada pixel al trazo más cercano; solo se calcula cerca de cada segmento.
    const dist = new Float32Array(size * size).fill(Infinity)
    const at = (v: number) => half + (v - 12) * u
    for (const path of ICONS[type]) {
      for (let i = 1; i < path.length; i++) {
        const [ax, ay, bx, by] = [at(path[i - 1][0]), at(path[i - 1][1]), at(path[i][0]), at(path[i][1])]
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - u - 1))
        const x1 = Math.min(size, Math.ceil(Math.max(ax, bx) + u + 1))
        const y0 = Math.max(0, Math.floor(Math.min(ay, by) - u - 1))
        const y1 = Math.min(size, Math.ceil(Math.max(ay, by) + u + 1))
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) dist[y * size + x] = Math.min(dist[y * size + x], distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by))
        }
      }
    }
    const pixels = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const box = clamp01(0.5 - roundedRectDist(x + 0.5 - half, y + 0.5 - half, half, half, size * 0.3))
        if (box === 0) continue
        const ink = clamp01(u + 0.5 - dist[y * size + x]) // trazo de 2 de grueso: medio ancho = u
        const i = (y * size + x) * 4
        pixels[i] = Math.round(255 + (r - 255) * ink)
        pixels[i + 1] = Math.round(255 + (g - 255) * ink)
        pixels[i + 2] = Math.round(255 + (b - 255) * ink)
        pixels[i + 3] = Math.round(box * 255)
      }
    }
    return encodeRGBA(size, size, pixels)
  })
}

/** Ícono del programa: un anillo blanco sobre su color (Apple lo usa en notificaciones; Google como logo). */
export function programIcon(color: string, size: number) {
  return cached(`icon:${color}:${size}`, () => {
    const alpha = new Float32Array(size * size)
    const c = size / 2
    const outer = size * 0.3
    const inner = size * 0.15
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
        alpha[y * size + x] = clamp01(outer + 0.5 - d) * clamp01(d - inner + 0.5)
      }
    }
    return encode(size, size, color, alpha)
  })
}
