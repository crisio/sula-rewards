package com.cristopherpineda.sularewards.ui.business

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.CardRow
import com.cristopherpineda.sularewards.core.CreatedCard
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.Headline
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Program
import com.cristopherpineda.sularewards.core.ProgramDetail
import com.cristopherpineda.sularewards.core.ProgramType
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.jsonOf
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.LempirasInput
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PhoneInput
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.ProgramIcon
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import com.cristopherpineda.sularewards.ui.WalletCard
import com.cristopherpineda.sularewards.ui.hexColor
import com.cristopherpineda.sularewards.ui.icon
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Un programa: sus números, dar de alta clientes (o vender gift cards) y buscar a sus clientes. */
@Composable
fun ProgramScreen(programId: String) {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<ProgramDetail?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var cards by remember { mutableStateOf<List<CardRow>?>(null) }
    var cardsError by remember { mutableStateOf<String?>(null) }
    var toggling by remember { mutableStateOf(false) }

    suspend fun loadProgram() {
        try {
            detail = Api.programDetail(programId)
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }

    suspend fun loadCards() {
        val q = query.trim()
        try {
            cards = Api.request<List<CardRow>>("GET", "/programs/$programId/cards", query = if (q.isEmpty()) emptyMap() else mapOf("q" to q))
            cardsError = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            cardsError = e.userMessage
        }
    }

    LaunchedEffect(programId) { loadProgram() }
    // Busca 300 ms después de dejar de escribir.
    LaunchedEffect(query) {
        if (query.isNotEmpty()) delay(300)
        loadCards()
    }

    Page(
        title = detail?.program?.name ?: "Programa",
        onBack = { Nav.pop() },
        onRefresh = {
            loadProgram()
            loadCards()
        },
    ) {
        val shown = detail
        when {
            shown != null -> {
                val program = shown.program
                Panel(spacing = 14.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        ProgramIcon(program.type, program.color, 48.dp)
                        Column {
                            Text(program.name, color = Sula.colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            Text("${program.type.label} · ${shown.business.name}", color = Sula.colors.muted, fontSize = 14.sp)
                        }
                    }
                    Text(program.rules, color = Sula.colors.ink, fontSize = 16.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        Stat(Fmt.number(shown.stats.cards), if (shown.stats.cards == 1) "cliente" else "clientes")
                        if (program.type == ProgramType.SELLOS) Stat(Fmt.number(shown.stats.rewardsPending), "premios por canjear")
                        if (program.type == ProgramType.CASHBACK || program.type == ProgramType.GIFTCARD) {
                            Stat(Fmt.lempiras(shown.stats.balanceCents), "saldo de clientes")
                        }
                    }
                    RowDivider()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            if (program.isActive) "Activo" else "Pausado: no acepta clientes ni movimientos",
                            color = Sula.colors.muted,
                            fontSize = 14.sp,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(enabled = !toggling, onClick = {
                            scope.launch {
                                toggling = true
                                try {
                                    val updated = Api.request<Program>("PATCH", "/programs/$programId", body = jsonOf("active" to !program.isActive))
                                    detail = shown.copy(program = program.copy(active = updated.active))
                                    Haptics.tap(view)
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = e.userMessage
                                    Haptics.error(view)
                                }
                                toggling = false
                            }
                        }) { Text(if (program.isActive) "Pausar" else "Reactivar", fontWeight = FontWeight.SemiBold) }
                    }
                }
                error?.let { Notice(it) }
                if (program.isActive) {
                    PrimaryButton(
                        if (program.type == ProgramType.GIFTCARD) "Vender gift card" else "Nuevo cliente",
                        onClick = { Nav.push(Screen.NewCustomer(program)) },
                        big = true,
                        icon = Icons.Outlined.PersonAdd,
                    )
                }
                Panel {
                    SectionTitle("Clientes")
                    Input(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Nombre, celular o código",
                        capitalization = KeyboardCapitalization.None,
                        autoCorrect = false,
                    )
                    val list = cards
                    when {
                        cardsError != null -> Notice(cardsError!!)
                        list == null -> Loading(Modifier.padding(bottom = 16.dp))
                        list.isEmpty() -> FinePrint(
                            if (query.isBlank()) "Todavía no hay clientes. Pon el cartel con el QR en el mostrador o dalos de alta aquí."
                            else "Nadie con esa búsqueda.",
                        )
                        else -> {
                            Column {
                                list.forEachIndexed { index, card ->
                                    CustomerRow(card)
                                    if (index < list.lastIndex) RowDivider()
                                }
                            }
                            if (list.size == 50) {
                                FinePrint("Se muestran los 50 más recientes. Busca por nombre, celular o código para encontrar a alguien más.")
                            }
                        }
                    }
                }
            }
            error != null -> Notice(error!!)
            else -> Loading()
        }
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(value, color = Sula.colors.ink, fontSize = 24.sp, fontWeight = FontWeight.Black)
        Text(label, color = Sula.colors.muted, fontSize = 13.sp)
    }
}

@Composable
private fun CustomerRow(card: CardRow) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable { Nav.push(Screen.StaffCard(card.id)) }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(card.customerName, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text("${Fmt.phone(card.phone)} · ${card.code}", color = Sula.colors.muted, fontSize = 13.sp)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(card.headline.value, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            if (card.rewards > 0) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.semantics {
                        contentDescription = "${card.rewards} ${if (card.rewards == 1) "premio" else "premios"} por canjear"
                    },
                ) {
                    Icon(Icons.Filled.CardGiftcard, contentDescription = null, tint = Sula.colors.accent, modifier = Modifier.size(14.dp))
                    Text(" ${card.rewards}", color = Sula.colors.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** Alta de un cliente desde caja. La gift card sale con el saldo que pagó el cliente. */
@Composable
fun NewCustomerScreen(program: Program) {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val isGift = program.type == ProgramType.GIFTCARD
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val canSubmit = name.trim().length >= 2 && Fmt.phoneDigits(phone) != null && (!isGift || Fmt.parseLempiras(amount) != null)

    Page(title = if (isGift) "Vender gift card" else "Nuevo cliente", onBack = { Nav.pop() }) {
        Panel(spacing = 10.dp) {
            FieldLabel("Nombre")
            Input(value = name, onValueChange = { name = it }, placeholder = "Gabriela Mejía", capitalization = KeyboardCapitalization.Words, autoCorrect = false)
            FieldLabel("Celular", Modifier.padding(top = 6.dp))
            PhoneInput(phone) { phone = it }
            if (phone.isNotEmpty() && Fmt.phoneDigits(phone) == null) {
                FinePrint("Un número de Honduras de 8 dígitos que empieza con 2, 3, 7, 8 o 9.")
            }
            if (isGift) {
                FieldLabel("Saldo", Modifier.padding(top = 6.dp))
                LempirasInput(amount, { amount = it })
            }
            error?.let { Notice(it) }
            PrimaryButton("Crear tarjeta", enabled = canSubmit, busy = busy, modifier = Modifier.padding(top = 10.dp), onClick = {
                val digits = Fmt.phoneDigits(phone) ?: return@PrimaryButton
                scope.launch {
                    busy = true
                    error = null
                    try {
                        val body = jsonOf(
                            "customer_name" to name.trim(),
                            "phone" to digits,
                            "initial_cents" to if (isGift) Fmt.parseLempiras(amount) else null,
                        )
                        val card = Api.request<CreatedCard>("POST", "/programs/${program.id}/cards", body = body)
                        Haptics.success(view)
                        Nav.replace(Screen.StaffCard(card.id, isNew = true))
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = e.userMessage
                        Haptics.error(view)
                    }
                    busy = false
                }
            })
            FinePrint("Un número tiene una sola tarjeta por programa. Si ya tiene, búscalo en la lista de clientes.")
        }
    }
}

/** Crear un programa: sellos, puntos, cashback o gift card, con el color de la marca (src/pages/NewProgram.tsx). */
@Composable
fun NewProgramScreen() {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val business = BusinessStore.current
    var type by rememberSaveable { mutableStateOf(ProgramType.SELLOS) }
    var name by rememberSaveable { mutableStateOf("") }
    var color by rememberSaveable { mutableStateOf<String?>(null) }
    var stampsGoal by rememberSaveable { mutableIntStateOf(8) }
    var reward by rememberSaveable { mutableStateOf("") }
    var pointsPer100 by rememberSaveable { mutableStateOf("10") }
    var rewardPoints by rememberSaveable { mutableStateOf("100") }
    var cashbackPercent by rememberSaveable { mutableStateOf("5") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val cardColor = color ?: type.defaultColor
    val points = pointsPer100.toIntOrNull()
    val cost = rewardPoints.filter { it != ',' }.toIntOrNull()
    // «2.5» % → 250 puntos básicos.
    val cashbackBp = cashbackPercent.replace(',', '.').toDoubleOrNull()?.let { (it * 100).roundToInt() }
    val preview = when (type) {
        ProgramType.SELLOS -> Headline("SELLOS", "3/$stampsGoal")
        ProgramType.PUNTOS -> Headline("PUNTOS", "250")
        ProgramType.CASHBACK -> Headline("CASHBACK ${cashbackPercent.ifEmpty { "0" }}%", Fmt.lempiras(1240))
        ProgramType.GIFTCARD -> Headline("GIFT CARD", Fmt.lempiras(50000))
    }
    val canSubmit = when (type) {
        ProgramType.SELLOS -> reward.isNotBlank()
        ProgramType.PUNTOS -> reward.isNotBlank() && (points ?: 0) >= 1 && (cost ?: 0) >= 1
        ProgramType.CASHBACK -> (cashbackBp ?: 0) in 10..5000
        ProgramType.GIFTCARD -> true
    }

    Page(title = "Nuevo programa", onBack = { Nav.pop() }) {
        // Los cuatro tipos en una cuadrícula de 2×2.
        ProgramType.entries.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { option ->
                    val selected = type == option
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 112.dp)
                            .background(Sula.colors.surface, RoundedCornerShape(16.dp))
                            .border(if (selected) 2.5.dp else 1.dp, if (selected) Sula.colors.ink else Sula.colors.line, RoundedCornerShape(16.dp))
                            .clickable {
                                type = option
                                color = null
                            }
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(option.icon, contentDescription = null, tint = hexColor(option.defaultColor))
                        Text(option.label, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        Text(option.hint, color = Sula.colors.muted, fontSize = 13.sp)
                    }
                }
            }
        }

        WalletCard(
            type = type,
            color = cardColor,
            businessName = business?.name ?: "Tu negocio",
            headline = preview,
            customerName = "Gabriela Mejía",
            reward = if (type == ProgramType.SELLOS || type == ProgramType.PUNTOS) reward.ifEmpty { "Tu premio" } else null,
            stamps = 3,
            stampsGoal = stampsGoal,
        )

        Panel(spacing = 10.dp) {
            FieldLabel("Nombre del programa")
            Input(value = name, onValueChange = { name = it }, placeholder = type.defaultName)
            when (type) {
                ProgramType.SELLOS -> {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                        FieldLabel("Sellos para el premio: $stampsGoal", Modifier.weight(1f))
                        FilledTonalIconButton(onClick = { if (stampsGoal > 2) stampsGoal-- }, enabled = stampsGoal > 2) {
                            Icon(Icons.Filled.Remove, contentDescription = "Menos sellos")
                        }
                        FilledTonalIconButton(onClick = { if (stampsGoal < 20) stampsGoal++ }, enabled = stampsGoal < 20) {
                            Icon(Icons.Filled.Add, contentDescription = "Más sellos")
                        }
                    }
                    FieldLabel("Premio")
                    Input(value = reward, onValueChange = { reward = it }, placeholder = "Café gratis")
                }
                ProgramType.PUNTOS -> {
                    FieldLabel("Puntos por cada L 100 de compra", Modifier.padding(top = 6.dp))
                    Input(value = pointsPer100, onValueChange = { pointsPer100 = it }, placeholder = "10", keyboardType = KeyboardType.Number)
                    FieldLabel("Puntos para el premio")
                    Input(value = rewardPoints, onValueChange = { rewardPoints = it }, placeholder = "100", keyboardType = KeyboardType.Number)
                    FieldLabel("Premio")
                    Input(value = reward, onValueChange = { reward = it }, placeholder = "Baleada sencilla gratis")
                    if (points != null && cost != null && points > 0 && cost > 0) {
                        FinePrint("Tu cliente gana el premio al gastar unos ${Fmt.lempiras((cost + points - 1) / points * 10_000)}.")
                    }
                }
                ProgramType.CASHBACK -> {
                    FieldLabel("Porcentaje de cashback", Modifier.padding(top = 6.dp))
                    Input(value = cashbackPercent, onValueChange = { cashbackPercent = it }, placeholder = "5", keyboardType = KeyboardType.Decimal, suffix = "%")
                    FinePrint("En una compra de L 500 le regresan ${Fmt.lempiras(50_000 * (cashbackBp ?: 0) / 10_000)}. Entre 0.1 % y 50 %.")
                }
                ProgramType.GIFTCARD -> FinePrint(
                    "Las gift cards se venden en caja con el saldo que pagó el cliente, y se cobran escaneando su QR.",
                    Modifier.padding(top = 4.dp),
                )
            }
            FieldLabel("Color de la tarjeta", Modifier.padding(top = 6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Sula.swatches.forEach { swatch ->
                    val selected = cardColor == swatch
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .border(2.dp, if (selected) Sula.colors.ink else Color.Transparent, CircleShape)
                            .padding(4.dp)
                            .background(hexColor(swatch), CircleShape)
                            .clickable { color = swatch }
                            .semantics { contentDescription = "Color $swatch" + if (selected) ", elegido" else "" },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }

        error?.let { Notice(it) }
        PrimaryButton("Crear programa", big = true, busy = busy, enabled = canSubmit && business != null, onClick = {
            val current = business ?: return@PrimaryButton
            scope.launch {
                busy = true
                error = null
                val body = jsonOf(
                    "type" to type.apiName,
                    "name" to name.trim().ifEmpty { type.defaultName },
                    "color" to cardColor,
                    "stamps_goal" to if (type == ProgramType.SELLOS) stampsGoal else null,
                    "reward" to if (type == ProgramType.SELLOS || type == ProgramType.PUNTOS) reward else null,
                    "points_per_100" to if (type == ProgramType.PUNTOS) (points ?: 0) else null,
                    "reward_points" to if (type == ProgramType.PUNTOS) (cost ?: 0) else null,
                    "cashback_bp" to if (type == ProgramType.CASHBACK) (cashbackBp ?: 0) else null,
                )
                try {
                    val program = Api.request<Program>("POST", "/businesses/${current.id}/programs", body = body)
                    Haptics.success(view)
                    ProgramsCache.byBusiness.remove(current.id)
                    // Esta pantalla se cambia por la del programa nuevo.
                    Nav.replace(Screen.Program(program.id))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    error = e.userMessage
                    Haptics.error(view)
                }
                busy = false
            }
        })
    }
}
