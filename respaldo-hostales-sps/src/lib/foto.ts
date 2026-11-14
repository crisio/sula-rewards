import { api } from './api'

/** Reduce la foto en el teléfono (máx. 1600 px, JPEG) para que suba rápido y pese poco. */
export async function comprimir(archivo: File, maxLado = 1600, calidad = 0.72): Promise<Blob> {
  const imagen = await createImageBitmap(archivo)
  const escala = Math.min(1, maxLado / Math.max(imagen.width, imagen.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(imagen.width * escala)
  canvas.height = Math.round(imagen.height * escala)
  canvas.getContext('2d')!.drawImage(imagen, 0, 0, canvas.width, canvas.height)
  imagen.close()
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la foto.'))), 'image/jpeg', calidad))
}

export async function subirFoto(hostalId: string, tipo: 'voucher' | 'deposito', archivo: File) {
  const blob = await comprimir(archivo)
  const r = await api<{ id: string }>(`/hostales/${hostalId}/fotos?tipo=${tipo}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } })
  return r.id
}
