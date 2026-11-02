package com.cristopherpineda.sularewards.ui.customer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.CardProgram
import com.cristopherpineda.sularewards.core.DirectoryBusiness
import com.cristopherpineda.sularewards.core.FeedPromotion
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.HiddenBusinesses
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.PublicBusiness
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.Session
import com.cristopherpineda.sularewards.core.WalletStore
import com.cristopherpineda.sularewards.core.jsonOf
import com.cristopherpineda.sularewards.core.subtitle
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.BusinessLogo
import com.cristopherpineda.sularewards.ui.EmptyState
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PhoneInput
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.ProgramIcon
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.text.Normalizer

/** Lo último que se bajó de Explorar, para que al regresar de un negocio no vuelva a cargar desde cero. */
private object ExploreCache {
    var promotions: List<FeedPromotion>? = null
    var businesses: List<DirectoryBusiness>? = null
}

/** «Café» encuentra «cafe» y «CAFÉ». */
private fun fold(text: String) = Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

/** La pestaña Explorar: las promociones y los negocios de Sula Rewards. */
@Composable
fun ExploreScreen() {
    var promotions by remember { mutableStateOf(ExploreCache.promotions) }
    var businesses by remember { mutableStateOf(ExploreCache.businesses) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    val hidden = HiddenBusinesses.slugs

    suspend fun load() {
        try {
            coroutineScope {
                val promos = async { Api.request<List<FeedPromotion>>("GET", "/public/promotions") }
                val list = async { Api.request<List<DirectoryBusiness>>("GET", "/public/businesses") }
                promotions = promos.await().also { ExploreCache.promotions = it }
                businesses = list.await().also { ExploreCache.businesses = it }
            }
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }
    LaunchedEffect(Unit) { load() }

    fun matches(business: DirectoryBusiness): Boolean {
        val q = fold(query.trim())
        return q.isEmpty() || fold(business.name).contains(q) || fold(business.category ?: "").contains(q)
    }

    Page(title = "Explorar", onRefresh = { load() }) {
        Input(
            value = query,
            onValueChange = { query = it },
            placeholder = "Buscar negocio",
            capitalization = KeyboardCapitalization.None,
            prefix = null,
        )
        val promos = promotions
        val list = businesses
        when {
            promos == null && error != null -> Notice(error!!)
            promos == null || list == null -> Loading()
            else -> {
                val visiblePromotions = promos.filter { it.business.slug !in hidden && matches(it.business) }
                val visibleBusinesses = list.filter { it.slug !in hidden && matches(it) }
                if (visiblePromotions.isNotEmpty()) {
                    SectionTitle("Promociones")
                    visiblePromotions.forEach { promotion ->
                        PromotionCard(
                            promotion,
                            onReport = { Nav.push(Screen.ReportPromotion(promotion)) },
                            onHide = { HiddenBusinesses.hide(promotion.business.slug) },
                        )
                    }
                }
                SectionTitle("Negocios en Sula Rewards", Modifier.padding(top = 4.dp))
                if (visibleBusinesses.isEmpty()) {
                    FinePrint(if (query.isBlank()) "Pronto habrá más negocios aquí." else "Ningún negocio con esa búsqueda.")
                } else {
                    Panel(padding = 14.dp, spacing = 0.dp) {
                        visibleBusinesses.forEachIndexed { index, business ->
                            BusinessRow(business)
                            if (index < visibleBusinesses.lastIndex) RowDivider(startPadding = 60.dp)
                        }
                    }
                }
                if (hidden.isNotEmpty()) {
                    FinePrint(
                        "Ocultaste ${if (hidden.size == 1) "un negocio" else "${hidden.size} negocios"}. Los puedes volver a mostrar en Perfil.",
                    )
                }
            }
        }
    }
}

@Composable
private fun BusinessRow(business: DirectoryBusiness) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { Nav.push(Screen.BusinessPage(business.slug)) }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        BusinessLogo(business.logoUrl, business.name, 46.dp)
        Column(Modifier.weight(1f)) {
            Text(business.name, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text(subtitle(business.category, business.city), color = Sula.colors.muted, fontSize = 14.sp)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Sula.colors.muted)
    }
}

/** Una promoción en Explorar: el negocio, el título, el detalle y hasta cuándo. Se puede reportar u ocultar el negocio. */
@Composable
private fun PromotionCard(promotion: FeedPromotion, onReport: () -> Unit, onHide: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Panel(spacing = 10.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(
                modifier = Modifier.weight(1f).clickable { Nav.push(Screen.BusinessPage(promotion.business.slug)) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BusinessLogo(promotion.business.logoUrl, promotion.business.name, 40.dp)
                Column {
                    Text(promotion.business.name, color = Sula.colors.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    promotion.business.category?.let { Text(it, color = Sula.colors.muted, fontSize = 12.sp) }
                }
            }
            Box {
                IconButton(onClick = { menu = true }) {
                    Icon(Icons.Outlined.MoreHoriz, contentDescription = "Opciones de la promoción", tint = Sula.colors.muted)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Reportar promoción") },
                        leadingIcon = { Icon(Icons.Outlined.Flag, contentDescription = null) },
                        onClick = { menu = false; onReport() },
                    )
                    DropdownMenuItem(
                        text = { Text("Ocultar este negocio") },
                        leadingIcon = { Icon(Icons.Outlined.VisibilityOff, contentDescription = null) },
                        onClick = { menu = false; onHide() },
                    )
                }
            }
        }
        Text(promotion.title, color = Sula.colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        promotion.body?.let { Text(it, color = Sula.colors.ink, fontSize = 15.sp) }
        promotion.endsOn?.let { Until(it) }
    }
}

@Composable
private fun Until(day: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Outlined.CalendarToday, contentDescription = null, tint = Sula.colors.muted, modifier = Modifier.size(14.dp))
        Text(Fmt.until(day), color = Sula.colors.muted, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

/** Reportar una promoción (engañosa, ofensiva…). Con varios reportes se pausa sola hasta revisarla. */
@Composable
fun ReportPromotionScreen(promotion: FeedPromotion) {
    val scope = rememberCoroutineScope()
    var reason by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }

    Page(title = "Reportar promoción", onBack = { Nav.pop() }) {
        Panel {
            if (sent) {
                Notice("Gracias. Revisaremos esta promoción y, si no cumple, la quitaremos.", success = true)
                PrimaryButton("Listo", onClick = { Nav.pop() })
            } else {
                Text("«${promotion.title}» de ${promotion.business.name}", color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                FieldLabel("¿Qué tiene de malo? (opcional)")
                Input(value = reason, onValueChange = { reason = it }, placeholder = "Es engañosa, ofensiva…", singleLine = false, minLines = 3)
                error?.let { Notice(it) }
                PrimaryButton("Reportar", busy = busy, onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        try {
                            Api.send("POST", "/promotions/${promotion.id}/report", jsonOf("reason" to reason))
                            sent = true
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.userMessage
                        }
                        busy = false
                    }
                })
            }
        }
    }
}

/** La página de un negocio: sus promociones y sus programas para unirse desde la app. */
@Composable
fun BusinessPublicScreen(slug: String) {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var business by remember { mutableStateOf<PublicBusiness?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var joining by remember { mutableStateOf<String?>(null) }
    var joinError by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            business = Api.request<PublicBusiness>("GET", "/public/b/$slug")
            error = null
            if (WalletStore.cards == null) WalletStore.refresh()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }
    LaunchedEffect(slug) { load() }

    fun join(program: CardProgram) {
        val user = Session.user ?: return
        if (user.fullName.isNullOrBlank() || user.phone.isNullOrBlank()) {
            Nav.push(Screen.ProfileDetails(joinSlug = slug, joinProgramId = program.id))
            return
        }
        scope.launch {
            joining = program.id
            joinError = null
            try {
                val card = WalletStore.join(slug, program.id)
                Haptics.success(view)
                Nav.push(Screen.CustomerCard(card.id))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                joinError = e.userMessage
                Haptics.error(view)
            }
            joining = null
        }
    }

    Page(title = business?.name ?: "Negocio", onBack = { Nav.pop() }, onRefresh = { load() }) {
        val shown = business
        when {
            shown != null -> {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    BusinessLogo(shown.logoUrl, shown.name, 88.dp)
                    Text(shown.name, color = Sula.colors.ink, fontSize = 28.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                    Text(subtitle(shown.category, shown.city), color = Sula.colors.muted, fontSize = 15.sp)
                }
                if (shown.promotions.isNotEmpty()) {
                    SectionTitle("Promociones")
                    shown.promotions.forEach { promotion ->
                        Panel(spacing = 6.dp) {
                            Text(promotion.title, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                            promotion.body?.let { Text(it, color = Sula.colors.ink, fontSize = 15.sp) }
                            promotion.endsOn?.let { Until(it) }
                        }
                    }
                }
                SectionTitle("Únete y gana")
                if (shown.programs.isEmpty()) FinePrint("Este negocio no tiene programas abiertos por ahora.")
                shown.programs.forEach { program ->
                    Panel {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            ProgramIcon(program.type, program.color, 44.dp)
                            Column {
                                Text(program.name, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                                Text(program.rules, color = Sula.colors.muted, fontSize = 14.sp)
                            }
                        }
                        val mine = WalletStore.cardInProgram(program.id)
                        if (mine != null) {
                            SecondaryButton(
                                "Ver mi tarjeta · ${mine.headline.value}",
                                onClick = { Nav.push(Screen.CustomerCard(mine.id)) },
                                icon = Icons.Outlined.AccountBalanceWallet,
                            )
                        } else {
                            PrimaryButton("Unirme", onClick = { join(program) }, busy = joining == program.id, enabled = joining == null)
                        }
                    }
                }
                joinError?.let { Notice(it) }
            }
            error != null -> EmptyState("No encontramos este negocio", error)
            else -> Loading()
        }
    }
}

/** Nombre y celular del cliente (PATCH /me). Si viene de «Unirme», al guardar se une al programa. */
@Composable
fun ProfileDetailsScreen(joinSlug: String?, joinProgramId: String?) {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val user = Session.user
    var name by rememberSaveable { mutableStateOf(user?.fullName ?: "") }
    var phone by rememberSaveable { mutableStateOf(user?.phone?.let { Fmt.phone(it) } ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val joining = joinSlug != null && joinProgramId != null
    val canSave = name.trim().length >= 2 && Fmt.phoneDigits(phone) != null

    Page(title = if (joining) "Para unirte" else "Tus datos", onBack = { Nav.pop() }) {
        Panel(spacing = 10.dp) {
            if (joining) FinePrint("El negocio te reconoce en caja por tu nombre y tu celular.")
            FieldLabel("Tu nombre", Modifier.padding(top = 4.dp))
            Input(value = name, onValueChange = { name = it }, placeholder = "Gabriela Mejía", capitalization = KeyboardCapitalization.Words)
            FieldLabel("Tu celular", Modifier.padding(top = 6.dp))
            PhoneInput(phone) { phone = it }
            if (phone.isNotEmpty() && Fmt.phoneDigits(phone) == null) {
                FinePrint("Un número de Honduras de 8 dígitos que empieza con 2, 3, 7, 8 o 9.")
            }
            error?.let { Notice(it) }
            PrimaryButton(
                if (joining) "Guardar y unirme" else "Guardar",
                enabled = canSave,
                busy = busy,
                modifier = Modifier.padding(top = 10.dp),
                onClick = {
                    val digits = Fmt.phoneDigits(phone) ?: return@PrimaryButton
                    scope.launch {
                        busy = true
                        error = null
                        try {
                            Session.update(name.trim(), digits)
                            if (joinSlug != null && joinProgramId != null) {
                                val card = WalletStore.join(joinSlug, joinProgramId)
                                Haptics.success(view)
                                Nav.replace(Screen.CustomerCard(card.id))
                            } else {
                                Nav.pop()
                            }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.userMessage
                            Haptics.error(view)
                        }
                        busy = false
                    }
                },
            )
        }
    }
}
