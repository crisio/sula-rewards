package com.cristopherpineda.sularewards.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Lo que manda la API (api/src). Las llaves llegan en snake_case y el decodificador las pasa a camelCase (Api.json).

@Serializable
data class User(
    val id: String,
    val email: String,
    val fullName: String? = null,
    /** Su celular como cliente (+504XXXXXXXX): con él se une a programas desde la app. */
    val phone: String? = null,
)

@Serializable
data class Business(
    val id: String,
    val name: String,
    val slug: String,
    val category: String? = null,
    val city: String,
    /** Cuántos programas tiene (solo en GET /businesses). */
    val programs: Int? = null,
    /** El logo que subió el negocio (URL con versión), o null. */
    val logoUrl: String? = null,
)

@Serializable
enum class ProgramType(val label: String, val hint: String, val defaultName: String, val defaultColor: String) {
    @SerialName("sellos") SELLOS("Sellos", "Un sello por visita o por compra", "Tarjeta de sellos", "#4f3fe0"),
    @SerialName("puntos") PUNTOS("Puntos", "Puntos según lo que gastan", "Puntos", "#f2820f"),
    @SerialName("cashback") CASHBACK("Cashback", "Un % de vuelta en saldo", "Cashback", "#16a34a"),
    @SerialName("giftcard") GIFTCARD("Gift card", "Saldo de regalo para cobrar", "Gift card", "#2e2b38");

    /** Como viaja en la API. */
    val apiName: String get() = name.lowercase()
}

/** Lo que define cada programa. Cada tipo usa sus campos (ver api/src/rules.ts). */
interface ProgramRules {
    val type: ProgramType
    val reward: String?
    val stampsGoal: Int?
    val pointsPer100: Int?
    val rewardPoints: Int?
    val cashbackBp: Int?

    /** «8 sellos = Café gratis», «10 puntos por cada L 100 · 200 puntos = Postre»… */
    val rules: String
        get() = when (type) {
            ProgramType.SELLOS -> "${stampsGoal ?: 0} sellos = ${reward ?: ""}"
            ProgramType.PUNTOS -> "${pointsPer100 ?: 0} puntos por cada L 100 · ${Fmt.number(rewardPoints ?: 0)} puntos = ${reward ?: ""}"
            ProgramType.CASHBACK -> "${Fmt.percent(cashbackBp ?: 0)}% de cada compra regresa como saldo"
            ProgramType.GIFTCARD -> "Saldo de regalo que se cobra en caja"
        }

    fun pointsFor(cents: Int): Int = (cents.toLong() * (pointsPer100 ?: 0) / 10_000).toInt()
    fun cashbackFor(cents: Int): Int = (cents.toLong() * (cashbackBp ?: 0) / 10_000).toInt()
}

@Serializable
data class Program(
    val id: String,
    val businessId: String,
    override val type: ProgramType,
    val name: String,
    val color: String,
    override val reward: String? = null,
    override val stampsGoal: Int? = null,
    @SerialName("points_per_100") override val pointsPer100: Int? = null,
    override val rewardPoints: Int? = null,
    override val cashbackBp: Int? = null,
    val active: Int = 1,
    /** Cuántos clientes tiene (solo en la lista del negocio). */
    val cards: Int? = null,
) : ProgramRules {
    val isActive: Boolean get() = active != 0
}

/** GET /programs/:id trae el programa con su negocio y sus números en el mismo objeto. */
@Serializable
data class ProgramExtras(val business: Business, val stats: Stats) {
    @Serializable
    data class Stats(val cards: Int, val rewardsPending: Int, val balanceCents: Int)
}

data class ProgramDetail(val program: Program, val business: Business, val stats: ProgramExtras.Stats)

/** Lo grande de la tarjeta, como en el Wallet: «SELLOS 7/8», «PUNTOS 1,250». */
@Serializable
data class Headline(val label: String, val value: String)

/** El programa como viaja dentro de la tarjeta (y en la página pública del negocio). */
@Serializable
data class CardProgram(
    val id: String,
    override val type: ProgramType,
    val name: String,
    val color: String,
    override val reward: String? = null,
    override val stampsGoal: Int? = null,
    @SerialName("points_per_100") override val pointsPer100: Int? = null,
    override val rewardPoints: Int? = null,
    override val cashbackBp: Int? = null,
) : ProgramRules

@Serializable
data class CardBusiness(
    val name: String,
    val slug: String,
    val city: String,
    val category: String? = null,
    val logoUrl: String? = null,
)

@Serializable
enum class MovementKind {
    @SerialName("alta") ALTA,
    @SerialName("sello") SELLO,
    @SerialName("compra") COMPRA,
    @SerialName("canje") CANJE,
    @SerialName("uso") USO,
    @SerialName("recarga") RECARGA,
}

@Serializable
data class Movement(
    val id: String,
    val kind: MovementKind,
    val stamps: Int = 0,
    val rewards: Int = 0,
    val points: Int = 0,
    val cents: Int = 0,
    val purchaseCents: Int? = null,
    val createdAt: String,
) {
    /** «+1 sello», «Compra de L 250.00 · +25 puntos»… */
    val summary: String
        get() = when (kind) {
            MovementKind.ALTA -> if (cents > 0) "Tarjeta creada con ${Fmt.lempiras(cents)}" else "Tarjeta creada"
            MovementKind.SELLO -> {
                val prize = if (rewards > 0) " · ¡${if (rewards == 1) "premio" else "$rewards premios"}!" else ""
                "+$stamps ${if (stamps == 1) "sello" else "sellos"}$prize"
            }
            MovementKind.COMPRA -> {
                val earned = if (points > 0) "+${Fmt.number(points)} puntos" else "+${Fmt.lempiras(cents)}"
                "Compra de ${Fmt.lempiras(purchaseCents ?: 0)} · $earned"
            }
            MovementKind.CANJE -> if (points != 0) "Canjeó premio (−${Fmt.number(-points)} puntos)" else "Canjeó premio"
            MovementKind.USO -> "Usó ${Fmt.lempiras(-cents)}"
            MovementKind.RECARGA -> "Recarga de ${Fmt.lempiras(cents)}"
        }
}

/** Lo que cambió con el último movimiento (POST /cards/:id/actions). */
@Serializable
data class ActionResult(
    val kind: MovementKind,
    val stamps: Int = 0,
    val rewards: Int = 0,
    val points: Int = 0,
    val cents: Int = 0,
)

/** La tarjeta vista desde caja (GET /cards/:id): con celular, correo e historial. */
@Serializable
data class StaffCard(
    val id: String,
    val code: String,
    val customerName: String,
    val stamps: Int = 0,
    val rewards: Int = 0,
    val points: Int = 0,
    val balanceCents: Int = 0,
    val headline: Headline,
    val status: String,
    val program: CardProgram,
    val business: CardBusiness,
    val phone: String,
    val email: String? = null,
    val movements: List<Movement>? = null,
    val result: ActionResult? = null,
)

/** Un cliente en la lista del programa (GET /programs/:id/cards). */
@Serializable
data class CardRow(
    val id: String,
    val code: String,
    val customerName: String,
    val phone: String,
    val headline: Headline,
    val rewards: Int = 0,
)

/** POST /programs/:id/cards */
@Serializable
data class CreatedCard(val id: String)

/** Si la tarjeta se puede guardar en Apple Wallet o en Google Wallet (según lo que tenga configurado la API). */
@Serializable
data class WalletAvailability(val apple: Boolean = false, val google: Boolean = false)

/** Una tarjeta en la cuenta del cliente (GET /wallet, /wallet/cards/:id). Sin celular ni correo. */
@Serializable
data class CustomerCard(
    val id: String,
    val code: String,
    val customerName: String,
    val stamps: Int = 0,
    val rewards: Int = 0,
    val points: Int = 0,
    val balanceCents: Int = 0,
    val headline: Headline,
    val status: String,
    val program: CardProgram,
    val business: CardBusiness,
    val wallet: WalletAvailability = WalletAvailability(),
    val movements: List<Movement>? = null,
)

/** Promoción de un negocio, como la ve el cliente. */
@Serializable
data class BusinessPromotion(
    val id: String,
    val title: String,
    val body: String? = null,
    val endsOn: String? = null,
    val createdAt: String,
)

/** Un negocio en «Explorar» (GET /public/businesses y dentro de cada promoción). */
@Serializable
data class DirectoryBusiness(
    val name: String,
    val slug: String,
    val category: String? = null,
    val city: String,
    val logoUrl: String? = null,
    val programs: Int? = null,
)

/** GET /public/promotions */
@Serializable
data class FeedPromotion(
    val id: String,
    val title: String,
    val body: String? = null,
    val endsOn: String? = null,
    val createdAt: String,
    val business: DirectoryBusiness,
)

/** GET /public/b/:slug: el negocio con sus programas abiertos y sus promociones vigentes. */
@Serializable
data class PublicBusiness(
    val name: String,
    val slug: String,
    val city: String,
    val category: String? = null,
    val logoUrl: String? = null,
    val programs: List<CardProgram> = emptyList(),
    val promotions: List<BusinessPromotion> = emptyList(),
)

/** Una promoción vista por su dueño (GET /businesses/:id/promotions). */
@Serializable
data class Promotion(
    val id: String,
    val businessId: String,
    val title: String,
    val body: String? = null,
    val endsOn: String? = null,
    val active: Int = 1,
    val createdAt: String,
) {
    val isActive: Boolean get() = active != 0
    val isExpired: Boolean get() = endsOn?.let { it < Fmt.today() } ?: false
}

/** Qué formas de entrar están listas (GET /auth/config). En Android se entra con Google con el client ID «web». */
@Serializable
data class AuthConfig(
    val apple: Boolean = false,
    val googleIosClientId: String? = null,
    val googleWebClientId: String? = null,
)

/** POST /auth/verify, /auth/google */
@Serializable
data class SignedIn(val token: String, val user: User)

/** GET /public/cards/:id/google: el enlace para guardar la tarjeta en Google Wallet. */
@Serializable
data class GoogleSaveUrl(val url: String)

/** El texto que se muestra debajo del nombre: «Cafetería · San Pedro Sula». */
fun subtitle(category: String?, city: String?): String =
    listOfNotNull(category, city).filter { it.isNotBlank() }.joinToString(" · ")
