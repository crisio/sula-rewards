package com.cristopherpineda.sularewards

import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.AuthConfig
import com.cristopherpineda.sularewards.core.CustomerCard
import com.cristopherpineda.sularewards.core.MovementKind
import com.cristopherpineda.sularewards.core.Program
import com.cristopherpineda.sularewards.core.ProgramExtras
import com.cristopherpineda.sularewards.core.ProgramType
import com.cristopherpineda.sularewards.core.jsonOf
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Las respuestas de la API (api/src) se leen igual que en la app de iPhone. */
class ModelsTest {
    @Test
    fun program() {
        val text = """
            {"id":"p1","business_id":"b1","type":"puntos","name":"Puntos","color":"#f2820f","reward":"Postre","stamps_goal":null,
             "points_per_100":10,"reward_points":200,"cashback_bp":null,"active":1,"created_at":"2026-10-01T00:00:00.000Z",
             "business":{"id":"b1","name":"Café","slug":"cafe","category":null,"city":"San Pedro Sula","logo_url":null},
             "stats":{"cards":3,"rewards_pending":0,"balance_cents":0}}
        """.trimIndent()
        val program = Api.json.decodeFromString<Program>(text)
        assertEquals(ProgramType.PUNTOS, program.type)
        assertEquals(10, program.pointsPer100)
        assertEquals("10 puntos por cada L 100 · 200 puntos = Postre", program.rules)
        assertEquals(25, program.pointsFor(25_000))
        assertTrue(program.isActive)
        val extras = Api.json.decodeFromString<ProgramExtras>(text)
        assertEquals(3, extras.stats.cards)
        assertEquals("San Pedro Sula", extras.business.city)
    }

    @Test
    fun customerCard() {
        val text = """
            {"id":"K7M2Q9XD3F8A","code":"K7M2-Q9XD-3F8A","customer_name":"Gabriela","stamps":3,"rewards":0,"points":0,
             "balance_cents":0,"headline":{"label":"SELLOS","value":"3/8"},"status":"Le faltan 5 sellos",
             "program":{"id":"p1","type":"sellos","name":"Café","color":"#4f3fe0","reward":"Café gratis","stamps_goal":8},
             "business":{"name":"Café","slug":"cafe","city":"San Pedro Sula","logo_url":"https://x/logo.png"},
             "wallet":{"apple":true,"google":false},
             "movements":[{"id":"m1","kind":"sello","stamps":1,"rewards":0,"points":0,"cents":0,"purchase_cents":null,"created_at":"2026-10-29T17:58:26.123Z"}],
             "url":"https://crisio.github.io/sula-rewards/tarjeta/K7M2Q9XD3F8A"}
        """.trimIndent()
        val card = Api.json.decodeFromString<CustomerCard>(text)
        assertEquals("Gabriela", card.customerName)
        assertEquals(8, card.program.stampsGoal)
        assertEquals("https://x/logo.png", card.business.logoUrl)
        assertFalse(card.wallet.google)
        assertEquals(MovementKind.SELLO, card.movements!!.single().kind)
        assertEquals("+1 sello", card.movements!!.single().summary)
    }

    @Test
    fun authConfigAndBodies() {
        val config = Api.json.decodeFromString<AuthConfig>("""{"apple":true,"google_ios_client_id":null,"google_web_client_id":"web.apps.googleusercontent.com"}""")
        assertEquals("web.apps.googleusercontent.com", config.googleWebClientId)
        assertNull(config.googleIosClientId)
        val body = jsonOf("customer_name" to "Ana", "phone" to "98765432", "initial_cents" to null, "active" to false)
        assertEquals("""{"customer_name":"Ana","phone":"98765432","active":false}""", body.toString())
    }
}
