package com.cristopherpineda.sularewards

import com.cristopherpineda.sularewards.core.Fmt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FmtTest {
    @Test
    fun lempiras() {
        assertEquals("L 1,234.50", Fmt.lempiras(123450))
        assertEquals("L 0.05", Fmt.lempiras(5))
        assertEquals("L 1,000,000.00", Fmt.lempiras(100_000_000))
    }

    @Test
    fun numbersAndPercent() {
        assertEquals("1,250", Fmt.number(1250))
        assertEquals("5", Fmt.percent(500))
        assertEquals("2.5", Fmt.percent(250))
    }

    @Test
    fun parseLempiras() {
        assertEquals(125050, Fmt.parseLempiras("1,250.5"))
        assertEquals(8000, Fmt.parseLempiras("L 80"))
        assertEquals(1250, Fmt.parseLempiras("12,50"))
        assertEquals(125000, Fmt.parseLempiras("1,250"))
        assertEquals(1200, Fmt.parseLempiras("12."))
        assertNull(Fmt.parseLempiras("0"))
        assertNull(Fmt.parseLempiras(".5"))
        assertNull(Fmt.parseLempiras("12.345"))
        assertNull(Fmt.parseLempiras("abc"))
        assertNull(Fmt.parseLempiras("12345678"))
    }

    @Test
    fun phones() {
        assertEquals("98765432", Fmt.phoneDigits("9876-5432"))
        assertEquals("98765432", Fmt.phoneDigits("+504 9876 5432"))
        assertEquals("22345678", Fmt.phoneDigits("2234-5678"))
        assertNull(Fmt.phoneDigits("1234-5678"))
        assertNull(Fmt.phoneDigits("9876-543"))
        assertEquals("9876-5432", Fmt.phone("+50498765432"))
        assertEquals("Gabriela", Fmt.firstName("Gabriela Mejía"))
    }

    @Test
    fun dates() {
        assertEquals("Hasta el 31 de diciembre", Fmt.until("2026-12-31"))
        assertEquals("ayer", Fmt.until("ayer"))
        // 17:58 UTC son las 11:58 en Honduras (UTC−6, sin horario de verano).
        val text = Fmt.dateTime("2026-10-29T17:58:26.123Z")
        assertTrue(text, text.startsWith("29 oct") && text.contains("11:58"))
        assertEquals("", Fmt.dateTime("no es fecha"))
        assertEquals("2026-12-31", Fmt.isoDay(1798675200000L))
        assertTrue(Fmt.today().matches(Regex("\\d{4}-\\d{2}-\\d{2}")))
    }
}
