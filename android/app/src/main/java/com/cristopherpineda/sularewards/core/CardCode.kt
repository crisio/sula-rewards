package com.cristopherpineda.sularewards.core

/**
 * El código de la tarjeta: 12 caracteres en base32 de Crockford (api/src/crypto.ts). Es lo que trae el QR y se muestra
 * como K7M2-Q9XD-3F8A para dictarlo o escribirlo en caja.
 */
object CardCode {
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    /** Lo mismo que normalizeCardId en la API: minúsculas, guiones y espacios, O por 0, I y L por 1. */
    fun normalize(text: String): String =
        text.uppercase()
            .filter { !it.isWhitespace() && it != '-' }
            .replace('O', '0')
            .replace('I', '1')
            .replace('L', '1')

    /** El id si lo escrito es un código válido. */
    fun id(text: String): String? {
        val id = normalize(text)
        return if (id.length == 12 && id.all { it in ALPHABET }) id else null
    }

    /** K7M2Q9XD3F8A → «K7M2-Q9XD-3F8A» */
    fun format(id: String): String = id.chunked(4).joinToString("-")

    sealed interface Scan {
        data class Card(val id: String) : Scan
        /** El QR del cartel del mostrador (/unete/<negocio>): trae el enlace del negocio, no una tarjeta. */
        data class JoinPoster(val slug: String) : Scan
        data object Unknown : Scan
    }

    /** Lo que leyó la cámara: el id de 12 caracteres (Apple Wallet, Google Wallet y la web) o un enlace con /tarjeta/<id>. */
    fun read(payload: String): Scan {
        val text = payload.trim()
        fun after(marker: String): String? {
            val at = text.indexOf(marker)
            if (at < 0) return null
            return text.substring(at + marker.length).takeWhile { it != '/' && it != '?' && it != '#' }
        }
        after("/tarjeta/")?.let { rest -> return id(rest)?.let { Scan.Card(it) } ?: Scan.Unknown }
        after("/unete/")?.let { slug -> return if (slug.isEmpty()) Scan.Unknown else Scan.JoinPoster(slug) }
        return id(text)?.let { Scan.Card(it) } ?: Scan.Unknown
    }
}
