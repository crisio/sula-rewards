import { unzlibSync } from 'fflate'
import { clamp01, encodeRGBA, roundedRectDist } from './images'
import { fail } from './errors'

// El logo del negocio. La app y el panel lo recortan a un cuadrado de 360×360 y lo mandan en PNG; aquí se lee, se
// pone sobre blanco y se sacan las versiones del pase de Apple Wallet (30, 60 y 90 pixeles = 30 puntos en @1x, @2x y
// @3x, con las esquinas redondeadas como el cuadrito del ícono). 360 es múltiplo de 30, 60 y 90: se reduce promediando.

export const LOGO_SIZE = 360
const MAX_BYTES = 1_500_000

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Canales por tipo de color: gris, RGB, paleta, gris con alfa, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Lee un PNG de 8 o 16 bits (gris, RGB, gris con alfa o RGBA; o paleta de 8 bits), sin entrelazar, a RGBA de 8 bits. */
export function decodePng(bytes: Uint8Array) {
  const bad: () => never = () => fail(400, 'El logo debe ser una imagen PNG')
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) bad()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const idat: Uint8Array[] = []
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      depth = data[8]
      colorType = data[9]
      if (data[12] !== 0) fail(400, 'El logo no puede ser un PNG entrelazado')
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') transparency = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }
  const channels = CHANNELS[colorType]
  if (!width || !height || !channels || !idat.length || !(depth === 8 || (depth === 16 && colorType !== 3))) bad()
  if (colorType === 3 && !palette) bad()

  let raw: Uint8Array
  try {
    raw = unzlibSync(idat.length === 1 ? idat[0] : concatAll(idat))
  } catch {
    bad()
  }
  const bpp = channels * (depth / 8)
  const stride = width * bpp
  if (raw.length < (stride + 1) * height) bad()

  // Quita los filtros de cada fila (ninguno, sub, arriba, promedio, Paeth).
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      const x = src[i]
      out[i] = filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b : filter === 3 ? x + ((a + b) >> 1) : filter === 4 ? x + paeth(a, b, c) : bad()
    }
  }

  // A RGBA de 8 bits (de 16 bits se toma el byte alto).
  const rgba = new Uint8Array(width * height * 4)
  const step = depth / 8
  for (let p = 0; p < width * height; p++) {
    const s = (k: number) => pixels[p * bpp + k * step]
    let r: number, g: number, b: number, a: number
    if (colorType === 0) [r, g, b, a] = [s(0), s(0), s(0), 255]
    else if (colorType === 2) [r, g, b, a] = [s(0), s(1), s(2), 255]
    else if (colorType === 4) [r, g, b, a] = [s(0), s(0), s(0), s(1)]
    else if (colorType === 6) [r, g, b, a] = [s(0), s(1), s(2), s(3)]
    else {
      const index = s(0)
      ;[r, g, b] = [palette![index * 3], palette![index * 3 + 1], palette![index * 3 + 2]]
      a = transparency && index < transparency.length ? transparency[index] : 255
    }
    rgba.set([r, g, b, a], p * 4)
  }
  return { width, height, rgba }
}

function concatAll(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Pone la imagen sobre blanco (lo transparente queda blanco, como el cuadrito del ícono). */
function onWhite(rgba: Uint8Array) {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255
    out[i] = Math.round(rgba[i] * a + 255 * (1 - a))
    out[i + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a))
    out[i + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a))
    out[i + 3] = 255
  }
  return out
}

/** Reduce un cuadrado de `size` a `size / factor` promediando bloques, y le redondea las esquinas (30 % del lado). */
function shrinkRounded(rgba: Uint8Array, size: number, factor: number) {
  const out = size / factor
  const pixels = new Uint8Array(out * out * 4)
  const half = out / 2
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      const sum = [0, 0, 0]
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * size + x * factor + dx) * 4
          sum[0] += rgba[i]
          sum[1] += rgba[i + 1]
          sum[2] += rgba[i + 2]
        }
      }
      const i = (y * out + x) * 4
      const n = factor * factor
      pixels.set([Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)], i)
      pixels[i + 3] = Math.round(clamp01(0.5 - roundedRectDist(x + 0.5 - half, y + 0.5 - half, half, half, out * 0.3)) * 255)
    }
  }
  return encodeRGBA(out, out, pixels)
}

/** Valida el PNG que subió el negocio y saca el logo sobre blanco y las tres versiones del pase. */
export function processLogo(bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES) fail(413, 'El logo pesa demasiado (máximo 1.5 MB)')
  const { width, height, rgba } = decodePng(bytes)
  if (width !== LOGO_SIZE || height !== LOGO_SIZE) fail(400, `El logo debe ser un cuadrado de ${LOGO_SIZE}×${LOGO_SIZE} pixeles`)
  const white = onWhite(rgba)
  return {
    original: encodeRGBA(LOGO_SIZE, LOGO_SIZE, white),
    pass1x: shrinkRounded(white, LOGO_SIZE, 12),
    pass2x: shrinkRounded(white, LOGO_SIZE, 6),
    pass3x: shrinkRounded(white, LOGO_SIZE, 4),
  }
}

/** D1 regresa los BLOB como ArrayBuffer o como arreglo de números, según la versión. */
export const blobBytes = (value: unknown) =>
  value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : Uint8Array.from(value as number[])

/** Para guardar en D1: un ArrayBuffer con solo esos bytes. */
export const toBlob = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

/** URL pública del logo (con la versión, para que al cambiarlo no salga el anterior de la caché). */
export const logoUrl = (origin: string, business: { id: string; logo_version: number | null }) =>
  business.logo_version ? `${origin}/public/logos/${business.id}.png?v=${business.logo_version}` : null

/** El negocio como lo ven el panel y la app: con la URL de su logo. */
export const businessJson = <T extends { id: string; logo_version: number | null }>(origin: string, business: T) => ({
  ...business,
  logo_url: logoUrl(origin, business),
})
