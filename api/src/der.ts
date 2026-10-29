// Lo mínimo de DER (ASN.1) para firmar los pases de Apple Wallet con WebCrypto, sin librerías:
// armar la firma PKCS#7 y leer el emisor y el número de serie del certificado.

export function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

export function tlv(tag: number, content: Uint8Array) {
  const len = content.length
  if (len < 0x80) return concat(Uint8Array.of(tag, len), content)
  const bytes: number[] = []
  for (let n = len; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256)
  return concat(Uint8Array.of(tag, 0x80 | bytes.length, ...bytes), content)
}

function compareBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
  return a.length - b.length
}

export const seq = (...items: Uint8Array[]) => tlv(0x30, concat(...items))
/** SET OF: DER pide los elementos ordenados por sus bytes. */
export const setOf = (...items: Uint8Array[]) => tlv(0x31, concat(...[...items].sort(compareBytes)))
/** Enteros chicos (0–127), lo único que usa la firma. */
export const smallInt = (n: number) => tlv(0x02, Uint8Array.of(n))
export const nullValue = () => Uint8Array.of(0x05, 0x00)
export const octets = (bytes: Uint8Array) => tlv(0x04, bytes)

export function oid(dotted: string) {
  const [first, second, ...rest] = dotted.split('.').map(Number)
  const out = [40 * first + second]
  for (const part of rest) {
    const chunk = [part & 0x7f]
    for (let v = Math.floor(part / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return tlv(0x06, Uint8Array.from(out))
}

export function utcTime(date: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  const s = `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  return tlv(0x17, new TextEncoder().encode(s))
}

export interface Node {
  tag: number
  start: number
  /** Dónde empieza el contenido (después de la etiqueta y el largo). */
  body: number
  end: number
}

export function readNode(buf: Uint8Array, offset = 0): Node {
  const tag = buf[offset]
  let len = buf[offset + 1]
  let body = offset + 2
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[body + i]
    body += n
  }
  if (body + len > buf.length) throw new Error('DER truncado')
  return { tag, start: offset, body, end: body + len }
}

export function children(buf: Uint8Array, node: Node) {
  const out: Node[] = []
  for (let offset = node.body; offset < node.end; ) {
    const child = readNode(buf, offset)
    out.push(child)
    offset = child.end
  }
  return out
}

export const bytesOf = (buf: Uint8Array, node: Node) => buf.subarray(node.start, node.end)

/** PEM → DER. Acepta los saltos de línea escritos como «\n» (así vienen en el JSON de Google). */
export function pemToDer(pem: string) {
  const b64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '')
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
}

const OID = {
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha256: '2.16.840.1.101.3.4.2.1',
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
}

/** Llave RSA privada en PEM, PKCS#8 («BEGIN PRIVATE KEY») o PKCS#1 («BEGIN RSA PRIVATE KEY»). */
export function importRsaKey(pem: string) {
  if (pem.includes('ENCRYPTED')) throw new Error('La llave privada tiene contraseña: expórtala sin contraseña (ver docs/wallet.md)')
  let der = pemToDer(pem)
  // PKCS#1 → PKCS#8: WebCrypto solo importa PKCS#8.
  if (pem.includes('BEGIN RSA PRIVATE KEY')) der = seq(smallInt(0), seq(oid(OID.rsaEncryption), nullValue()), octets(der))
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** IssuerAndSerialNumber del certificado: identifica quién firmó dentro del PKCS#7. */
export function issuerAndSerial(cert: Uint8Array) {
  const tbs = children(cert, readNode(cert))[0]
  const fields = children(cert, tbs)
  const i = fields[0].tag === 0xa0 ? 1 : 0 // [0] versión (opcional)
  return seq(bytesOf(cert, fields[i + 2]), bytesOf(cert, fields[i]))
}

/**
 * Firma PKCS#7 «detached» (SignedData sin el contenido) con SHA-256: la `signature` que Apple pide en el .pkpass
 * sobre manifest.json, con el certificado del Pass Type ID y el intermedio de Apple (WWDR).
 */
export async function signDetached(content: Uint8Array, certPem: string, keyPem: string, wwdrPem: string, signingTime = new Date()) {
  const cert = pemToDer(certPem)
  const wwdr = pemToDer(wwdrPem)
  const key = await importRsaKey(keyPem)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content))
  const sha256 = seq(oid(OID.sha256), nullValue())

  // Lo que se firma son los atributos codificados como SET; dentro del SignerInfo van con la etiqueta [0].
  const attrs = setOf(
    seq(oid(OID.contentType), setOf(oid(OID.data))),
    seq(oid(OID.signingTime), setOf(utcTime(signingTime))),
    seq(oid(OID.messageDigest), setOf(octets(digest))),
  )
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, attrs))
  const attrsBody = attrs.subarray(readNode(attrs).body)

  const signerInfo = seq(
    smallInt(1),
    issuerAndSerial(cert),
    sha256,
    tlv(0xa0, attrsBody),
    seq(oid(OID.rsaEncryption), nullValue()),
    octets(signature),
  )
  const signedData = seq(smallInt(1), setOf(sha256), seq(oid(OID.data)), tlv(0xa0, concat(cert, wwdr)), setOf(signerInfo))
  return seq(oid(OID.signedData), tlv(0xa0, signedData))
}
