package com.cristopherpineda.sularewards.core

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Formatos de Honduras: lempiras (los montos viajan en centavos), celulares de 8 dígitos y hora de Tegucigalpa. */
object Fmt {
    val locale: Locale = Locale.forLanguageTag("es-HN")
    val zone: ZoneId = ZoneId.of("America/Tegucigalpa")

    // Como en la web: L 1,234.50 y 1,250 (coma para miles, punto para decimales).
    private val symbols = DecimalFormatSymbols(Locale.US)

    /** 123450 → «L 1,234.50» */
    fun lempiras(cents: Int): String = "L " + DecimalFormat("#,##0.00", symbols).format(cents / 100.0)

    /** 1250 → «1,250» */
    fun number(n: Int): String = DecimalFormat("#,##0", symbols).format(n.toLong())

    /** Puntos básicos → porcentaje: 500 → «5», 250 → «2.5». */
    fun percent(bp: Int): String = if (bp % 100 == 0) (bp / 100).toString() else (bp / 100.0).toString()

    /** Lo que escribe el cajero («1,250.5», «L 80», «12,50») → centavos, o null si no es un monto. */
    fun parseLempiras(text: String): Int? {
        var s = text.replace("L", "", ignoreCase = true).filterNot { it.isWhitespace() }
        // Teclado con coma decimal: «12,50» (una sola coma con 1 o 2 decimales y sin punto).
        if (!s.contains('.') && s.count { it == ',' } == 1 && s.length - s.indexOf(',') <= 3) {
            s = s.replace(',', '.')
        }
        s = s.replace(",", "")
        val parts = s.split('.')
        if (parts.size !in 1..2) return null
        val whole = parts[0]
        if (whole.length !in 1..7 || !whole.all(::isDigit)) return null
        var cents = whole.toInt() * 100
        if (parts.size == 2) {
            val fraction = parts[1]
            if (fraction.length > 2 || !fraction.all(::isDigit)) return null
            if (fraction.isNotEmpty()) cents += fraction.padEnd(2, '0').toInt()
        }
        return if (cents > 0) cents else null
    }

    /** «9876-5432», «+504 98765432»… → «98765432» si es un número de Honduras (empieza con 2, 3, 7, 8 o 9). */
    fun phoneDigits(text: String): String? {
        var digits = text.filter(::isDigit)
        if (digits.length == 11 && digits.startsWith("504")) digits = digits.drop(3)
        return if (digits.length == 8 && digits[0] in "23789") digits else null
    }

    /** +50498765432 → «9876-5432» */
    fun phone(e164: String): String {
        val digits = e164.removePrefix("+504")
        return if (digits.length == 8) "${digits.take(4)}-${digits.takeLast(4)}" else e164
    }

    fun firstName(name: String): String = name.trim().split(' ').firstOrNull { it.isNotEmpty() } ?: name

    private val dateTimeFormatter = DateTimeFormatter.ofPattern("d MMM, h:mm a", locale)

    /** «2026-10-29T17:58:26.123Z» → «29 oct, 11:58 a. m.» (hora de Honduras) */
    fun dateTime(iso: String): String =
        runCatching { dateTimeFormatter.format(Instant.parse(iso).atZone(zone)) }.getOrDefault("")

    private val dayFormatter = DateTimeFormatter.ofPattern("d 'de' MMMM", locale)

    /** Hoy en Honduras: «2026-10-29». Las fechas de las promociones son días de calendario. */
    fun today(): String = LocalDate.now(zone).toString()

    /** «2026-12-31» → «Hasta el 31 de diciembre». */
    fun until(day: String): String =
        runCatching { "Hasta el " + dayFormatter.format(LocalDate.parse(day)) }.getOrDefault(day)

    /** Lo que da el calendario de Material (medianoche UTC del día elegido) → «2026-12-31». */
    fun isoDay(utcMillis: Long): String = Instant.ofEpochMilli(utcMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    /** Medianoche UTC de hoy en Honduras: el primer día que se puede elegir en el calendario. */
    fun todayUtcMillis(): Long = LocalDate.now(zone).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    private fun isDigit(c: Char) = c in '0'..'9'
}
