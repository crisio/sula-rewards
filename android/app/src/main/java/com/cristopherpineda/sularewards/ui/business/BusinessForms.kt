package com.cristopherpineda.sularewards.ui.business

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.Business
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Promotion
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.jsonOf
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.BusinessLogo
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.LogoImage
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Los giros del panel web (src/pages/PanelHome.tsx). */
val businessCategories = listOf(
    "Cafetería", "Restaurante", "Baleadas", "Panadería", "Salón de belleza", "Barbería", "Farmacia", "Boutique", "Supermercado",
    "Gimnasio", "Otro",
)

/** Nombre y giro del negocio: para crearlo o para cambiarlos. */
@Composable
private fun BusinessFields(name: String, onName: (String) -> Unit, category: String, onCategory: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FieldLabel("Nombre")
        Input(value = name, onValueChange = onName, placeholder = "Café Guamilito", capitalization = KeyboardCapitalization.Words)
        FieldLabel("Giro", Modifier.padding(top = 6.dp))
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Sula.colors.sunken, RoundedCornerShape(14.dp))
                    .clickable { open = true }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    category.ifEmpty { "Elige uno (opcional)" },
                    color = if (category.isEmpty()) Sula.colors.muted else Sula.colors.ink,
                    fontSize = 17.sp,
                    modifier = Modifier.weight(1f),
                )
                Icon(Icons.Filled.UnfoldMore, contentDescription = null, tint = Sula.colors.muted)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text("Ninguno") }, onClick = { onCategory(""); open = false })
                businessCategories.forEach { option ->
                    DropdownMenuItem(text = { Text(option) }, onClick = { onCategory(option); open = false })
                }
            }
        }
    }
}

/** Registrar un negocio (el primero o uno más): cómo se llama y su giro. */
@Composable
fun CreateBusinessScreen() {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val first = BusinessStore.businesses.isNullOrEmpty()

    Page(title = if (first) "Registrar mi negocio" else "Otro negocio", onBack = { Nav.pop() }) {
        Panel(spacing = 16.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionTitle("¿Cómo se llama tu negocio?")
                FinePrint("Así aparece en la tarjeta de tus clientes.")
            }
            BusinessFields(name, { name = it }, category, { category = it })
            error?.let { Notice(it) }
            PrimaryButton("Crear mi negocio", busy = busy, enabled = name.trim().length >= 2, onClick = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        val business = Api.request<Business>(
                            "POST",
                            "/businesses",
                            body = jsonOf("name" to name.trim(), "category" to category.ifEmpty { null }),
                        )
                        BusinessStore.added(business)
                        Haptics.success(view)
                        Nav.pop()
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

/** Cambiar el nombre o el giro (PATCH /businesses/:id). */
@Composable
fun EditBusinessScreen(business: Business) {
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf(business.name) }
    var category by rememberSaveable { mutableStateOf(business.category ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Page(title = "Tu negocio", onBack = { Nav.pop() }) {
        Panel(spacing = 16.dp) {
            BusinessFields(name, { name = it }, category, { category = it })
            FinePrint("El enlace para unirse no cambia: los carteles que ya imprimiste siguen funcionando.")
            error?.let { Notice(it) }
            PrimaryButton("Guardar", busy = busy, enabled = name.trim().length >= 2, onClick = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        val updated = Api.request<Business>(
                            "PATCH",
                            "/businesses/${business.id}",
                            body = jsonOf("name" to name.trim(), "category" to category),
                        )
                        BusinessStore.updated(updated.copy(programs = business.programs))
                        Nav.pop()
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

/** Subir, cambiar o quitar el logo del negocio. Se recorta a un cuadrado de 360×360 y sale en las tarjetas y en el Wallet. */
@Composable
fun BusinessLogoEditor(business: Business) {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            error = null
            try {
                val png = LogoImage.squarePng(context, uri) ?: throw IllegalStateException()
                val updated = Api.request<Business>(
                    "PUT",
                    "/businesses/${business.id}/logo",
                    bytes = png,
                    contentType = "image/png",
                    timeoutSeconds = 60,
                )
                BusinessStore.updated(updated.copy(programs = business.programs))
                Haptics.success(view)
            } catch (e: CancellationException) {
                throw e
            } catch (e: IllegalStateException) {
                error = "No se pudo leer esa imagen. Prueba con otra."
            } catch (e: Exception) {
                error = e.userMessage
                Haptics.error(view)
            }
            busy = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(contentAlignment = Alignment.Center) {
                BusinessLogo(business.logoUrl, business.name, 64.dp)
                if (busy) CircularProgressIndicator(modifier = Modifier.size(28.dp), color = Sula.colors.muted)
            }
            Column {
                TextButton(enabled = !busy, onClick = {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text(if (business.logoUrl == null) "Subir logo" else "Cambiar logo", fontWeight = FontWeight.SemiBold) }
                if (business.logoUrl != null) {
                    TextButton(enabled = !busy, onClick = {
                        scope.launch {
                            busy = true
                            error = null
                            try {
                                val updated = Api.request<Business>("DELETE", "/businesses/${business.id}/logo")
                                BusinessStore.updated(updated.copy(programs = business.programs))
                            } catch (e: CancellationException) {
                                throw e
                            } catch (e: Exception) {
                                error = e.userMessage
                            }
                            busy = false
                        }
                    }) { Text("Quitar logo", color = Sula.colors.danger, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        FinePrint("Cuadrado. Sale en la tarjeta de tus clientes y en su Wallet.")
        error?.let { Notice(it) }
    }
}

/** Las promociones del negocio: las ven todos los clientes en Explorar mientras estén activas y vigentes. */
@Composable
fun PromotionsScreen(business: Business) {
    val scope = rememberCoroutineScope()
    var promotions by remember { mutableStateOf<List<Promotion>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Promotion?>(null) }

    suspend fun load() {
        try {
            promotions = Api.request<List<Promotion>>("GET", "/businesses/${business.id}/promotions")
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }
    LaunchedEffect(business.id) { load() }

    fun toggle(promotion: Promotion) {
        scope.launch {
            try {
                val updated = Api.request<Promotion>("PATCH", "/promotions/${promotion.id}", body = jsonOf("active" to !promotion.isActive))
                promotions = promotions?.map { if (it.id == updated.id) updated else it }
                error = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage
            }
        }
    }

    Page(
        title = "Promociones",
        onBack = { Nav.pop() },
        actions = {
            IconButton(onClick = { Nav.push(Screen.NewPromotion(business)) }) { Icon(Icons.Filled.Add, contentDescription = "Nueva promoción") }
        },
        onRefresh = { load() },
        spacing = 14.dp,
    ) {
        FinePrint("Tus promociones salen en Explorar de la app de Sula Rewards para todos los clientes. Puedes tener hasta 5 activas.")
        error?.let { Notice(it) }
        val list = promotions
        when {
            list == null && error == null -> Loading()
            list == null -> {}
            list.isEmpty() -> Panel(spacing = 10.dp) {
                Text("Todavía no tienes promociones", color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                FinePrint("Por ejemplo: «2×1 en baleadas los martes» o «Café gratis en tu cumpleaños».")
                PrimaryButton("Nueva promoción", onClick = { Nav.push(Screen.NewPromotion(business)) })
            }
            else -> list.forEach { promotion ->
                Panel(modifier = Modifier.alpha(if (promotion.isActive && !promotion.isExpired) 1f else 0.7f), spacing = 8.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(promotion.title, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        when {
                            promotion.isExpired -> Text("Vencida", color = Sula.colors.danger, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            !promotion.isActive -> Text("Pausada", color = Sula.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    promotion.body?.let { Text(it, color = Sula.colors.ink, fontSize = 15.sp) }
                    Text(promotion.endsOn?.let { Fmt.until(it) } ?: "Sin fecha de fin", color = Sula.colors.muted, fontSize = 13.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (!promotion.isExpired) {
                            Box(Modifier.weight(1f)) {
                                SecondaryButton(if (promotion.isActive) "Pausar" else "Reactivar", onClick = { toggle(promotion) })
                            }
                        }
                        Box(Modifier.weight(1f)) {
                            SecondaryButton("Borrar", onClick = { deleting = promotion }, color = Sula.colors.danger)
                        }
                    }
                }
            }
        }
    }

    deleting?.let { promotion ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("¿Borrar esta promoción?") },
            text = { Text(promotion.title) },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    scope.launch {
                        try {
                            Api.send("DELETE", "/promotions/${promotion.id}")
                            promotions = promotions?.filterNot { it.id == promotion.id }
                            error = null
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.userMessage
                        }
                    }
                }) { Text("Borrar", color = Sula.colors.danger) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancelar") } },
        )
    }
}

/** Nueva promoción: título, detalle y, si tiene, la fecha en que termina. */
@Composable
fun NewPromotionScreen(business: Business) {
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var title by rememberSaveable { mutableStateOf("") }
    var details by rememberSaveable { mutableStateOf("") }
    var hasEnd by rememberSaveable { mutableStateOf(false) }
    var endsOn by rememberSaveable { mutableStateOf(Fmt.todayUtcMillis() + 7L * 24 * 60 * 60 * 1000) }
    var picking by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Page(title = "Nueva promoción", onBack = { Nav.pop() }) {
        Panel(spacing = 10.dp) {
            FieldLabel("Título")
            Input(value = title, onValueChange = { title = it }, placeholder = "2×1 en baleadas los martes")
            FieldLabel("Detalle (opcional)", Modifier.padding(top = 6.dp))
            Input(value = details, onValueChange = { details = it }, placeholder = "De 2 a 5 pm, en todas las sucursales", singleLine = false, minLines = 2)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                Text("Tiene fecha de fin", color = Sula.colors.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Switch(
                    checked = hasEnd,
                    onCheckedChange = { hasEnd = it },
                    colors = SwitchDefaults.colors(checkedTrackColor = Sula.colors.accent),
                )
            }
            if (hasEnd) {
                SecondaryButton("Termina el ${Fmt.until(Fmt.isoDay(endsOn)).removePrefix("Hasta el ")}", onClick = { picking = true })
            }
            error?.let { Notice(it) }
            PrimaryButton("Publicar promoción", busy = busy, enabled = title.trim().length >= 3, modifier = Modifier.padding(top = 10.dp), onClick = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        Api.request<Promotion>(
                            "POST",
                            "/businesses/${business.id}/promotions",
                            body = jsonOf(
                                "title" to title.trim(),
                                "body" to details.trim().ifEmpty { null },
                                "ends_on" to if (hasEnd) Fmt.isoDay(endsOn) else null,
                            ),
                        )
                        Haptics.success(view)
                        Nav.pop()
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

    if (picking) {
        val today = Fmt.todayUtcMillis()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = endsOn,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis >= today
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { endsOn = it }
                    picking = false
                }) { Text("Listo") }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text("Cancelar") } },
        ) {
            DatePicker(state = state)
        }
    }
}
