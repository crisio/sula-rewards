package com.cristopherpineda.sularewards.ui.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Print
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.Business
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.CardCode
import com.cristopherpineda.sularewards.core.Config
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Program
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.subtitle
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.EmptyState
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.Links
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.LogoMark
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.Poster
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.ProgramIcon
import com.cristopherpineda.sularewards.ui.QrCode
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.Scanner
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Los programas de cada negocio que ya se bajaron: al regresar de un programa, la caja no parpadea. */
internal object ProgramsCache {
    val byBusiness = mutableStateMapOf<String, List<Program>>()
}

/** La pestaña Mi negocio: la caja si ya tiene negocio; si no, la invitación a registrarlo. */
@Composable
fun BusinessTab() {
    val businesses = BusinessStore.businesses
    val error = BusinessStore.error
    val scope = rememberCoroutineScope()
    when {
        !businesses.isNullOrEmpty() -> HomeScreen()
        businesses == null && error != null -> Page(title = "Mi negocio") {
            EmptyState("No pudimos abrir tu negocio", error, action = "Intentar de nuevo", onAction = { scope.launch { BusinessStore.refresh() } })
        }
        businesses == null -> Page(title = "Mi negocio") { Loading() }
        else -> BusinessIntro()
    }
}

/** Para quien todavía no tiene negocio: qué es y el botón para registrarlo. */
@Composable
private fun BusinessIntro() {
    Page(title = "Mi negocio") {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LogoMark(56.dp)
            Text("Tu programa de lealtad, en el Wallet de tus clientes", color = Sula.colors.ink, fontSize = 28.sp, fontWeight = FontWeight.Black, lineHeight = 32.sp)
            Text(
                "Sin tarjetas de papel ni apps que descargar: tus clientes escanean el QR del mostrador y tú les sumas en caja.",
                color = Sula.colors.muted,
                fontSize = 16.sp,
            )
        }
        Panel(spacing = 14.dp) {
            Feature(Icons.Filled.LocalCafe, "Sellos", "8 cafés = 1 gratis")
            Feature(Icons.Filled.Star, "Puntos", "Por cada L 100 de compra")
            Feature(Icons.Filled.Payments, "Cashback", "Un % de vuelta en saldo")
            Feature(Icons.Filled.CardGiftcard, "Gift cards", "Se venden y se cobran en caja")
            Feature(Icons.Filled.Campaign, "Promociones", "Las ven todos en Explorar")
        }
        PrimaryButton("Registrar mi negocio", onClick = { Nav.push(Screen.CreateBusiness) }, big = true)
        FinePrint("Es gratis. Puedes tener hasta 5 negocios con la misma cuenta.")
    }
}

@Composable
private fun Feature(icon: ImageVector, title: String, detail: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(icon, contentDescription = null, tint = Sula.colors.accent, modifier = Modifier.width(32.dp))
        Column {
            Text(title, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text(detail, color = Sula.colors.muted, fontSize = 14.sp)
        }
    }
}

/** Inicio de la caja: escanear, escribir el código, los programas y el QR para que los clientes se unan. */
@Composable
private fun HomeScreen() {
    val business = BusinessStore.current ?: return
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    val programs = ProgramsCache.byBusiness[business.id]
    var error by remember { mutableStateOf<String?>(null) }
    var code by rememberSaveable { mutableStateOf("") }
    var codeError by remember { mutableStateOf<String?>(null) }
    var switcher by remember { mutableStateOf(false) }

    suspend fun loadPrograms() {
        try {
            ProgramsCache.byBusiness[business.id] = Api.request<List<Program>>("GET", "/businesses/${business.id}/programs")
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }
    LaunchedEffect(business.id) { loadPrograms() }

    fun openCode() {
        val id = CardCode.id(code)
        if (id == null) {
            codeError = "El código tiene 12 letras y números, como K7M2-Q9XD-3F8A."
            Haptics.error(view)
            return
        }
        codeError = null
        code = ""
        Nav.push(Screen.StaffCard(id))
    }

    fun scan() {
        scope.launch {
            codeError = null
            val payload = try {
                Scanner.scan(context)
            } catch (e: Scanner.Unavailable) {
                codeError = e.message
                null
            } ?: return@launch
            when (val result = CardCode.read(payload)) {
                is CardCode.Scan.Card -> Nav.push(Screen.StaffCard(result.id))
                is CardCode.Scan.JoinPoster -> {
                    codeError = "Ese QR es para que tus clientes se unan. Escanea el de su tarjeta."
                    Haptics.error(view)
                }
                CardCode.Scan.Unknown -> {
                    codeError = "Ese QR no es de una tarjeta de Sula Rewards."
                    Haptics.error(view)
                }
            }
        }
    }

    val businesses = BusinessStore.businesses.orEmpty()
    Page(
        title = business.name,
        actions = {
            if (businesses.size > 1) {
                Box {
                    IconButton(onClick = { switcher = true }) { Icon(Icons.Outlined.SwapHoriz, contentDescription = "Cambiar de negocio") }
                    DropdownMenu(expanded = switcher, onDismissRequest = { switcher = false }) {
                        businesses.forEach { b ->
                            DropdownMenuItem(
                                text = { Text(b.name, fontWeight = if (b.id == business.id) FontWeight.Bold else FontWeight.Normal) },
                                onClick = {
                                    switcher = false
                                    BusinessStore.choose(b.id)
                                },
                            )
                        }
                    }
                }
            }
        },
        onRefresh = { loadPrograms() },
    ) {
        subtitle(business.category, business.city).takeIf { it.isNotEmpty() }?.let {
            Text(it, color = Sula.colors.muted, fontSize = 15.sp, modifier = Modifier.padding(top = 0.dp))
        }

        Panel {
            PrimaryButton("Escanear tarjeta", onClick = ::scan, big = true, icon = Icons.Filled.QrCodeScanner)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) {
                    Input(
                        value = code,
                        onValueChange = { code = it },
                        placeholder = "Código: K7M2-Q9XD-3F8A",
                        capitalization = KeyboardCapitalization.Characters,
                        autoCorrect = false,
                        onDone = ::openCode,
                    )
                }
                SecondaryButton("Abrir", onClick = ::openCode, enabled = code.isNotBlank(), modifier = Modifier.width(96.dp))
            }
            codeError?.let { Notice(it) }
        }

        Panel(spacing = 14.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SectionTitle("Tus programas", Modifier.weight(1f))
                TextButton(onClick = { Nav.push(Screen.NewProgram) }) {
                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(" Nuevo", fontWeight = FontWeight.SemiBold)
                }
            }
            when {
                programs == null && error != null -> Notice(error!!)
                programs == null -> Loading(Modifier.padding(bottom = 16.dp))
                programs.isEmpty() -> {
                    FinePrint("Todavía no tienes programas. Crea el primero: por ejemplo, 8 sellos y el noveno café gratis.")
                    PrimaryButton("Crear mi primer programa", onClick = { Nav.push(Screen.NewProgram) })
                }
                else -> Column {
                    programs.forEachIndexed { index, program ->
                        ProgramRow(program)
                        if (index < programs.lastIndex) RowDivider(startPadding = 54.dp)
                    }
                }
            }
        }

        JoinPoster(business)
    }
}

@Composable
private fun ProgramRow(program: Program) {
    val count = program.cards ?: 0
    val detail = "${program.type.label} · $count ${if (count == 1) "cliente" else "clientes"}" + if (!program.isActive) " · pausado" else ""
    Row(
        modifier = Modifier.fillMaxWidth().clickable { Nav.push(Screen.Program(program.id)) }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ProgramIcon(program.type, program.color)
        Column(Modifier.weight(1f)) {
            Text(program.name, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Text(detail, color = Sula.colors.muted, fontSize = 14.sp)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Sula.colors.muted)
    }
}

/** El QR del mostrador: el cliente lo escanea, pone su nombre y su celular y guarda la tarjeta en su Wallet. */
@Composable
private fun JoinPoster(business: Business) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val url = Config.joinUrl(business.slug)
    val qr = remember(url) { QrCode.bitmap(url).asImageBitmap() }
    var busy by remember { mutableStateOf(false) }

    Panel(spacing = 14.dp) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SectionTitle("Cartel para el mostrador")
            FinePrint("Tus clientes escanean este QR, ponen su nombre y celular y guardan su tarjeta en el Wallet de su teléfono.")
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Image(
                bitmap = qr,
                contentDescription = "QR para unirse a ${business.name}",
                filterQuality = FilterQuality.None,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .widthIn(max = 224.dp)
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .padding(12.dp),
            )
        }
        SelectionContainer { Text(url, color = Sula.colors.muted, fontSize = 13.sp) }
        PrimaryButton("Compartir o imprimir el cartel", busy = busy, icon = Icons.Outlined.Print, onClick = {
            scope.launch {
                busy = true
                val poster = withContext(Dispatchers.Default) { Poster.render(business.name, url) }
                Links.shareImage(context, poster, "cartel-${business.slug}.png", "Cartel de ${business.name}")
                busy = false
            }
        })
        SecondaryButton("Compartir enlace", icon = Icons.Outlined.Share, onClick = {
            Links.shareText(context, "Únete a ${business.name} y guarda tu tarjeta en el Wallet: $url", "Únete a ${business.name}")
        })
    }
}
