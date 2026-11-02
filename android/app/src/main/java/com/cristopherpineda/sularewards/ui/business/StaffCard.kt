package com.cristopherpineda.sularewards.ui.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.outlined.OpenInBrowser
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.Config
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.MovementKind
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.ProgramType
import com.cristopherpineda.sularewards.core.StaffCard
import com.cristopherpineda.sularewards.core.jsonOf
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.EmptyState
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.LempirasInput
import com.cristopherpineda.sularewards.ui.Links
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import com.cristopherpineda.sularewards.ui.TintedButton
import com.cristopherpineda.sularewards.ui.WalletCard
import com.cristopherpineda.sularewards.ui.customer.History
import com.cristopherpineda.sularewards.ui.hexColor
import com.cristopherpineda.sularewards.ui.rememberToast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * La tarjeta en caja: sumar sellos, registrar compras, canjear, cobrar o recargar, el historial y mandarla por WhatsApp
 * (src/pages/StaffCardPage.tsx).
 */
@Composable
fun StaffCardScreen(cardId: String, isNew: Boolean) {
    val view = LocalView.current
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var card by remember { mutableStateOf<StaffCard?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var confirmRedeem by remember { mutableStateOf(false) }
    var purchase by rememberSaveable { mutableStateOf("") }
    var spend by rememberSaveable { mutableStateOf("") }
    var topUp by rememberSaveable { mutableStateOf("") }

    suspend fun load() {
        try {
            card = Api.request<StaffCard>("GET", "/cards/$cardId")
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }
    LaunchedEffect(cardId) { load() }

    /** Mensaje corto después de cada movimiento. */
    fun feedback(next: StaffCard): String {
        val r = next.result ?: return "Listo"
        return when (r.kind) {
            MovementKind.SELLO -> if (r.rewards > 0) "¡Premio desbloqueado! ${next.program.reward ?: ""}" else "Sello agregado: ${next.headline.value}"
            MovementKind.CANJE -> "Premio canjeado"
            MovementKind.COMPRA -> if (r.points > 0) "+${Fmt.number(r.points)} puntos" else "+${Fmt.lempiras(r.cents)} de cashback"
            MovementKind.USO -> "Cobrado: ${Fmt.lempiras(-r.cents)}. Queda ${Fmt.lempiras(next.balanceCents)}"
            MovementKind.RECARGA, MovementKind.ALTA -> "Recarga lista: ${Fmt.lempiras(next.balanceCents)}"
        }
    }

    /** Manda el movimiento; si sale bien, limpia el campo del monto y trae el historial con el movimiento nuevo. */
    fun act(action: String, amountCents: Int? = null, count: Int? = null, onDone: () -> Unit = {}) {
        val current = card ?: return
        if (busy) return
        scope.launch {
            busy = true
            actionError = null
            try {
                val next = Api.request<StaffCard>(
                    "POST",
                    "/cards/${current.id}/actions",
                    body = jsonOf("action" to action, "amount_cents" to amountCents, "count" to count),
                ).copy(movements = current.movements)
                card = next
                toast.show(feedback(next))
                val r = next.result
                if (r != null && (r.rewards > 0 || r.kind == MovementKind.CANJE)) Haptics.success(view) else Haptics.tap(view)
                onDone()
                focus.clearFocus()
                busy = false
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                actionError = e.userMessage
                Haptics.error(view)
                busy = false
            }
        }
    }

    Page(
        title = card?.program?.name ?: "Tarjeta",
        onBack = { Nav.pop() },
        onRefresh = { load() },
        overlay = { toast.Host(Modifier.align(Alignment.BottomCenter)) },
    ) {
        val shown = card
        when {
            shown != null -> {
                val p = shown.program
                if (isNew) Notice("Tarjeta creada. Mándasela por WhatsApp para que la guarde en su Wallet.", success = true)
                WalletCard(
                    type = p.type,
                    color = p.color,
                    businessName = shown.business.name,
                    headline = shown.headline,
                    logoUrl = shown.business.logoUrl,
                    customerName = shown.customerName,
                    reward = p.reward,
                    stamps = shown.stamps,
                    stampsGoal = p.stampsGoal,
                )
                Text(
                    shown.status,
                    color = Sula.colors.ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                Panel(spacing = 14.dp) {
                    when (p.type) {
                        ProgramType.SELLOS -> {
                            PrimaryButton("+1 sello", onClick = { act("sello") }, big = true, icon = Icons.Filled.AddCircle, enabled = !busy)
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                listOf(2, 3).forEach { n ->
                                    Box(Modifier.weight(1f)) {
                                        SecondaryButton("+$n sellos", onClick = { act("sello", count = n) }, enabled = !busy)
                                    }
                                }
                            }
                            if (shown.rewards > 0) {
                                TintedButton("Canjear premio: ${p.reward ?: ""}", hexColor(p.color), onClick = { confirmRedeem = true }, enabled = !busy)
                            }
                        }
                        ProgramType.PUNTOS -> {
                            AmountForm("Monto de la compra", purchase, { purchase = it }, "Sumar puntos", busy,
                                preview = { "= ${Fmt.number(p.pointsFor(it))} puntos" }) { cents -> act("compra", amountCents = cents) { purchase = "" } }
                            TintedButton(
                                "Canjear ${p.reward ?: "premio"} (${Fmt.number(p.rewardPoints ?: 0)} puntos)",
                                hexColor(p.color),
                                onClick = { confirmRedeem = true },
                                enabled = !busy && shown.points >= (p.rewardPoints ?: 0),
                            )
                        }
                        ProgramType.CASHBACK -> {
                            AmountForm("Monto de la compra", purchase, { purchase = it }, "Registrar compra", busy,
                                preview = { "Gana ${Fmt.lempiras(p.cashbackFor(it))} de cashback" }) { cents -> act("compra", amountCents = cents) { purchase = "" } }
                            if (shown.balanceCents > 0) {
                                RowDivider()
                                AmountForm("Pagar con su saldo (tiene ${Fmt.lempiras(shown.balanceCents)})", spend, { spend = it }, "Usar saldo", busy) { cents ->
                                    act("uso", amountCents = cents) { spend = "" }
                                }
                            }
                        }
                        ProgramType.GIFTCARD -> {
                            AmountForm("Cobrar con la gift card (tiene ${Fmt.lempiras(shown.balanceCents)})", spend, { spend = it }, "Cobrar", busy) { cents ->
                                act("uso", amountCents = cents) { spend = "" }
                            }
                            RowDivider()
                            AmountForm("Recargar saldo", topUp, { topUp = it }, "Recargar", busy) { cents ->
                                act("recarga", amountCents = cents) { topUp = "" }
                            }
                        }
                    }
                    actionError?.let { Notice(it) }
                }

                // El cliente y cómo mandarle su tarjeta.
                val link = Config.cardUrl(shown.id)
                val message = "¡Hola ${Fmt.firstName(shown.customerName)}! Esta es tu tarjeta de ${shown.business.name}. Guárdala en tu Wallet: $link"
                Panel {
                    SectionTitle("Cliente")
                    Column {
                        Text(shown.customerName, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        SelectionContainer {
                            Text("${Fmt.phone(shown.phone)} · Código ${shown.code}", color = Sula.colors.muted, fontSize = 14.sp)
                        }
                    }
                    PrimaryButton("Mandar tarjeta por WhatsApp", icon = Icons.AutoMirrored.Filled.Chat, onClick = {
                        Links.whatsApp(context, shown.phone, message)
                    })
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) {
                            SecondaryButton("Compartir", icon = Icons.Outlined.Share, onClick = { Links.shareText(context, message) })
                        }
                        Box(Modifier.weight(1f)) {
                            SecondaryButton("Ver como cliente", icon = Icons.Outlined.OpenInBrowser, onClick = { Links.open(context, link) })
                        }
                    }
                }
                History(shown.movements)
            }
            error != null -> EmptyState("No se pudo abrir la tarjeta", error)
            else -> Loading()
        }
    }

    val shown = card
    if (confirmRedeem && shown != null) {
        AlertDialog(
            onDismissRequest = { confirmRedeem = false },
            title = { Text("¿Canjear el premio?") },
            text = {
                Text(
                    if (shown.program.type == ProgramType.PUNTOS) {
                        "Se descuentan ${Fmt.number(shown.program.rewardPoints ?: 0)} puntos de la tarjeta de ${shown.customerName}."
                    } else {
                        "Se descuenta un premio de la tarjeta de ${shown.customerName}."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmRedeem = false
                    act("canje")
                }) { Text("Canjear: ${shown.program.reward ?: "premio"}", fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmRedeem = false }) { Text("Cancelar") } },
        )
    }
}

/** Un monto en lempiras con su botón (y, si aplica, lo que gana el cliente con ese monto). */
@Composable
private fun AmountForm(
    label: String,
    text: String,
    onText: (String) -> Unit,
    button: String,
    busy: Boolean,
    preview: ((Int) -> String)? = null,
    submit: (Int) -> Unit,
) {
    val cents = Fmt.parseLempiras(text)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FieldLabel(label)
        LempirasInput(text, onText, enabled = !busy, onDone = { if (cents != null) submit(cents) })
        if (cents != null && preview != null) {
            Text(preview(cents), color = Sula.colors.muted, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        }
        PrimaryButton(button, onClick = { if (cents != null) submit(cents) }, enabled = cents != null, busy = busy)
    }
}
