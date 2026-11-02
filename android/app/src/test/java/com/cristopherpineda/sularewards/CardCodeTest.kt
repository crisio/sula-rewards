package com.cristopherpineda.sularewards

import com.cristopherpineda.sularewards.core.CardCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CardCodeTest {
    @Test
    fun normalizesWhatPeopleType() {
        assertEquals("K7M2Q9XD3F8A", CardCode.id("k7m2-q9xd-3f8a"))
        assertEquals("K7M2Q9XD3F8A", CardCode.id(" K7M2 Q9XD 3F8A "))
        // O por 0, I y L por 1 (base32 de Crockford).
        assertEquals("K7M2Q9XD3F01", CardCode.id("K7M2-Q9XD-3FOL"))
        assertNull(CardCode.id("K7M2-Q9XD-3F8"))
        assertNull(CardCode.id("K7M2-Q9XD-3F8U"))
        assertEquals("K7M2-Q9XD-3F8A", CardCode.format("K7M2Q9XD3F8A"))
    }

    @Test
    fun readsWhatTheCameraSees() {
        assertEquals(CardCode.Scan.Card("K7M2Q9XD3F8A"), CardCode.read("K7M2Q9XD3F8A"))
        assertEquals(CardCode.Scan.Card("K7M2Q9XD3F8A"), CardCode.read("https://crisio.github.io/sula-rewards/tarjeta/K7M2Q9XD3F8A?x=1"))
        assertEquals(CardCode.Scan.JoinPoster("cafe-guamilito"), CardCode.read("https://crisio.github.io/sula-rewards/unete/cafe-guamilito"))
        assertEquals(CardCode.Scan.Unknown, CardCode.read("https://example.com"))
        assertEquals(CardCode.Scan.Unknown, CardCode.read("https://crisio.github.io/sula-rewards/tarjeta/xyz"))
    }
}
