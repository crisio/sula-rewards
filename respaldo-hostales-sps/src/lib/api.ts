// Conexión con la API. Guarda la diferencia con el reloj del servidor: la app nunca depende de la hora del teléfono.

const CLAVE_TOKEN = 'hs_token'

function leer(clave: string) {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string | null) {
  try {
    if (valor == null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch {
    /* modo privado: la sesión dura lo que dure la pestaña */
  }
}

let token: string | null = leer(CLAVE_TOKEN)
let diferencia = 0

export const tieneToken = () => Boolean(token)
export function fijarToken(t: string | null) {
  token = t
  guardar(CLAVE_TOKEN, t)
}

/** Hora del servidor (ms), aunque el teléfono tenga la fecha mal. */
export const ahoraServidor = () => Date.now() + diferencia

export class ErrorApi extends Error {
  constructor(
    message: string,
    public status: number,
    public datos: any = null,
  ) {
    super(message)
  }
}

// --- Estado de conexión (el puntito «En línea» del encabezado) ---
let enLinea = true
const oyentesLinea = new Set<(v: boolean) => void>()
function marcarEnLinea(v: boolean) {
  if (v === enLinea) return
  enLinea = v
  oyentesLinea.forEach((f) => f(v))
}
export const estaEnLinea = () => enLinea
export function alCambiarConexion(f: (v: boolean) => void) {
  oyentesLinea.add(f)
  return () => oyentesLinea.delete(f)
}

// --- Sesión vencida ---
const oyentesSesion = new Set<() => void>()
export function alTerminarSesion(f: () => void) {
  oyentesSesion.add(f)
  return () => oyentesSesion.delete(f)
}

interface Opciones {
  method?: string
  json?: unknown
  body?: BodyInit
  headers?: Record<string, string>
}

async function pedir(ruta: string, op: Opciones = {}) {
  const headers = new Headers(op.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let body = op.body
  if (op.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(op.json)
  }
  let res: Response
  try {
    res = await fetch('/api' + ruta, { method: op.method ?? (body ? 'POST' : 'GET'), headers, body })
  } catch {
    marcarEnLinea(false)
    throw new ErrorApi('Sin conexión. Revisa el internet e intenta otra vez.', 0)
  }
  marcarEnLinea(true)
  const ahora = Number(res.headers.get('X-Ahora'))
  if (ahora) diferencia = ahora - Date.now()
  if (res.status === 401 && token && ruta !== '/entrar') {
    fijarToken(null)
    oyentesSesion.forEach((f) => f())
  }
  return res
}

export async function api<T = any>(ruta: string, op: Opciones = {}): Promise<T> {
  const res = await pedir(ruta, op)
  const datos = res.headers.get('Content-Type')?.includes('json') ? await res.json().catch(() => null) : null
  if (!res.ok) throw new ErrorApi(datos?.error ?? `Error ${res.status}`, res.status, datos)
  return datos as T
}

/** Una foto guardada (voucher o depósito) como URL para <img>. */
export async function urlDeFoto(id: string) {
  const res = await pedir(`/fotos/${id}`)
  if (!res.ok) throw new ErrorApi('No se pudo abrir la foto.', res.status)
  return URL.createObjectURL(await res.blob())
}

export const recordar = {
  leer: (clave: string) => leer(clave),
  guardar: (clave: string, valor: string | null) => guardar(clave, valor),
}
