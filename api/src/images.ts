import { zlibSync } from 'fflate'
import { concat } from './der'

// Imágenes de los pases, dibujadas en el Worker: el ícono del programa y la tira de sellos (los círculos de la
// tarjeta, llenos con palomita los que ya tiene). PNG con paleta: todo es el color del programa mezclado con
// blanco, así que 17 tonos alcanzan para bordes suaves y el PNG sale chico y rápido.

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

/** PNG indexado: `alpha` trae, por pixel, cuánto blanco lleva encima del color de fondo (0 a 1). */
function encode(width: number, height: number, hex: string, alpha: Float32Array) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const palette = new Uint8Array((LEVELS + 1) * 3)
  for (let l = 0; l <= LEVELS; l++) {
    const t = l / LEVELS
    palette.set([r, g, b].map((v) => Math.round(v + (255 - v) * t)), l * 3)
  }
  const raw = new Uint8Array((width + 1) * height) // cada fila empieza con su filtro (0 = ninguno)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.round(alpha[y * width + x] * LEVELS)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 3, 0, 0, 0], 8) // 8 bits, paleta, sin entrelazado
  return concat(SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', palette), chunk('IDAT', zlibSync(raw, { level: 6 })), chunk('IEND', new Uint8Array()))
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Palomita dentro de un círculo de radio 1 (y hacia abajo).
const CHECK = [
  [-0.42, 0.02],
  [-0.12, 0.32],
  [0.44, -0.28],
] as const

/** Cuánto blanco lleva un pixel a (dx, dy) del centro de un sello de radio r. */
function stampAlpha(dx: number, dy: number, r: number, filled: boolean) {
  const d = Math.hypot(dx, dy) - r
  if (!filled) {
    const ring = Math.max(1.5, r * 0.07)
    return clamp01(ring / 2 + 0.5 - Math.abs(d + ring / 2)) * 0.55
  }
  const disc = clamp01(0.5 - d)
  if (disc === 0) return 0
  const width = r * 0.14
  const dist = Math.min(
    distToSegment(dx, dy, CHECK[0][0] * r, CHECK[0][1] * r, CHECK[1][0] * r, CHECK[1][1] * r),
    distToSegment(dx, dy, CHECK[1][0] * r, CHECK[1][1] * r, CHECK[2][0] * r, CHECK[2][1] * r),
  )
  return disc * (1 - clamp01(width / 2 + 0.5 - dist))
}

/**
 * La tira de sellos del pase (Apple: strip de la storeCard, 375×123 puntos; Google: heroImage). Hasta 10 sellos
 * en una fila; más, en dos.
 */
export function stampStrip(color: string, goal: number, filled: number, scale = 2) {
  const width = 375 * scale
  const height = 123 * scale
  const rows = goal > 10 ? 2 : 1
  const perRow = Math.ceil(goal / rows)
  const pitch = Math.min((width - 24 * scale) / perRow, (height - 16 * scale) / rows)
  const r = pitch * 0.4
  const x0 = (width - pitch * perRow) / 2
  const y0 = (height - pitch * rows) / 2
  const alpha = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y - y0) / pitch)
    if (row < 0 || row >= rows) continue
    for (let x = 0; x < width; x++) {
      const col = Math.floor((x - x0) / pitch)
      const index = row * perRow + col
      if (col < 0 || col >= perRow || index >= goal) continue
      alpha[y * width + x] = stampAlpha(x - (x0 + (col + 0.5) * pitch), y - (y0 + (row + 0.5) * pitch), r, index < filled)
    }
  }
  return encode(width, height, color, alpha)
}

/** Ícono del programa: un anillo blanco sobre su color (Apple lo usa en notificaciones; Google como logo). */
export function programIcon(color: string, size: number) {
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
}
