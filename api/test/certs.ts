import { concat, nullValue, oid, seq, setOf, smallInt, tlv, utcTime } from '../src/der'

// Llaves y certificados de prueba (hacen las veces de los de Apple y Google).

export const toPem = (label: string, der: ArrayBuffer | Uint8Array) =>
  `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`

/** exportKey regresa ArrayBuffer para spki/pkcs8 (JsonWebKey solo con 'jwk'). */
export const exportDer = async (format: 'spki' | 'pkcs8', key: CryptoKey) => (await crypto.subtle.exportKey(format, key)) as ArrayBuffer

export const rsaKeys = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>

/** Certificado X.509 autofirmado (solo para las pruebas: hace las veces del de Apple). */
export async function selfSigned(cn: string, keys: CryptoKeyPair) {
  const name = seq(setOf(seq(oid('2.5.4.3'), tlv(0x0c, new TextEncoder().encode(cn)))))
  const alg = seq(oid('1.2.840.113549.1.1.11'), nullValue())
  const tbs = seq(
    tlv(0xa0, smallInt(2)),
    smallInt(7),
    alg,
    name,
    seq(utcTime(new Date('2026-01-01T00:00:00Z')), utcTime(new Date('2036-01-01T00:00:00Z'))),
    name,
    new Uint8Array(await exportDer('spki', keys.publicKey)),
  )
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, tbs))
  return toPem('CERTIFICATE', seq(tbs, alg, tlv(0x03, concat(Uint8Array.of(0), signature))))
}

/** Llave privada (RSA o EC) en PEM PKCS#8, como la .p8 de Apple. */
export const pkcs8Pem = async (key: CryptoKey) => toPem('PRIVATE KEY', await exportDer('pkcs8', key))
