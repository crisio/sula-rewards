package com.cristopherpineda.sularewards.ui.customer

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.aspectRatio
import com.cristopherpineda.sularewards.core.Api
import com.cristopherpineda.sularewards.core.CardCode
import com.cristopherpineda.sularewards.core.CustomerCard
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.GoogleSaveUrl
import com.cristopherpineda.sularewards.core.Movement
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.Tab
import com.cristopherpineda.sularewards.core.WalletStore
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.EmptyState
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.Links
import com.cristopherpineda.sularewards.ui.Loading
import com.cristopherpineda.sularewards.ui.LogoMark
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.QrCode
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.Scanner
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import com.cristopherpineda.sularewards.ui.WalletCard
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** La pestaña Tarjetas: las tarjetas del cliente en todos los negocios. */
@Composable
fun WalletScreen() {
    val cards = WalletStore.cards
    val error = WalletStore.error
    LaunchedEffect(Unit) { WalletStore.refresh() }

    Page(
        title = "Mis tarjetas",
        actions = {
            IconButton(onClick = { Nav.push(Screen.AddCard) }) { Icon(Icons.Filled.Add, contentDescription = "Agregar tarjeta") }
        },
        onRefresh = { WalletStore.refresh() },
        spacing = 16.dp,
    ) {
        when {
            cards != null && cards.isEmpty() -> Panel(spacing = 14.dp) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Spacer(Modifier.padding(top = 8.dp))
                    LogoMark(64.dp)
                    Text("Todavía no tienes tarjetas", color = Sula.colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "Únete a un negocio desde Explorar, o agrega la tarjeta que te dieron en caja con su QR o su código.",
                        color = Sula.colors.muted,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                    )
                }
                PrimaryButton("Explorar negocios", onClick = { Nav.select(Tab.EXPLORE) }, icon = Icons.Filled.Explore)
                SecondaryButton("Agregar mi tarjeta", onClick = { Nav.push(Screen.AddCard) }, icon = Icons.Filled.Add)
            }
            cards != null -> cards.forEach { card ->
                WalletCard(
                    type = card.program.type,
                    color = card.program.color,
                    businessName = card.business.name,
                    headline = card.headline,
                    logoUrl = card.business.logoUrl,
                    customerName = card.customerName,
                    reward = card.program.reward,
                    stamps = card.stamps,
                    stampsGoal = card.program.stampsGoal,
                    modifier = Modifier.clickable { Nav.push(Screen.CustomerCard(card.id)) },
                )
            }
            error != null -> Notice(error)
            else -> Loading()
        }
    }
}

/** Agregar una tarjeta: escanear su QR (o el cartel de un negocio) o escribir el código. */
@Composable
fun AddCardScreen() {
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()
    var code by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun add(text: String) {
        val id = CardCode.id(text) ?: return
        if (busy) return
        scope.launch {
            busy = true
            error = null
            try {
                val card = WalletStore.add(id)
                Haptics.success(view)
                Nav.replace(Screen.CustomerCard(card.id))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage
                Haptics.error(view)
            }
            busy = false
        }
    }

    fun scan() {
        scope.launch {
            error = null
            val payload = try {
                Scanner.scan(context)
            } catch (e: Scanner.Unavailable) {
                error = e.message
                null
            } ?: return@launch
            when (val result = CardCode.read(payload)) {
                is CardCode.Scan.Card -> add(result.id)
                is CardCode.Scan.JoinPoster -> Nav.replace(Screen.BusinessPage(result.slug))
                CardCode.Scan.Unknown -> error = "Ese QR no es de una tarjeta de Sula Rewards."
            }
        }
    }

    Page(title = "Agregar tarjeta", onBack = { Nav.pop() }) {
        Panel(spacing = 14.dp) {
            PrimaryButton("Escanear el QR", onClick = ::scan, big = true, icon = Icons.Filled.QrCodeScanner, enabled = !busy)
            FinePrint("El de tu tarjeta (en la web o en tu Wallet), o el cartel del mostrador para unirte a un negocio.")
            FieldLabel("O escribe el código de tu tarjeta", Modifier.padding(top = 8.dp))
            Input(
                value = code,
                onValueChange = { code = it },
                placeholder = "K7M2-Q9XD-3F8A",
                capitalization = KeyboardCapitalization.Characters,
                autoCorrect = false,
                onDone = { add(code) },
            )
            error?.let { Notice(it) }
            PrimaryButton("Agregar tarjeta", onClick = { add(code) }, enabled = CardCode.id(code) != null, busy = busy)
        }
    }
}

/** Una tarjeta del cliente: el QR para caja, cómo va, su historial y guardarla en Google Wallet. */
@Composable
fun CustomerCardScreen(cardId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var card by remember { mutableStateOf(WalletStore.card(cardId)) }
    var error by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            val fresh = Api.request<CustomerCard>("GET", "/wallet/cards/$cardId")
            card = fresh
            WalletStore.upsert(fresh)
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (card == null) error = e.userMessage
        }
    }
    LaunchedEffect(cardId) { load() }

    Page(
        title = card?.business?.name ?: "Tarjeta",
        onBack = { Nav.pop() },
        actions = {
            IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, contentDescription = "Más") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(
                    text = { Text("Quitar de la app") },
                    leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                    onClick = {
                        menu = false
                        confirmRemove = true
                    },
                )
            }
        },
        onRefresh = { load() },
    ) {
        val shown = card
        when {
            shown != null -> {
                WalletCard(
                    type = shown.program.type,
                    color = shown.program.color,
                    businessName = shown.business.name,
                    headline = shown.headline,
                    logoUrl = shown.business.logoUrl,
                    customerName = shown.customerName,
                    reward = shown.program.reward,
                    stamps = shown.stamps,
                    stampsGoal = shown.program.stampsGoal,
                )
                Text(
                    shown.status,
                    color = Sula.colors.ink,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                QrPanel(shown.id, shown.code)
                if (shown.wallet.google) GoogleWalletButton(shown.id)
                History(shown.movements)
                SecondaryButton(
                    "Ver ${shown.business.name}",
                    onClick = { Nav.push(Screen.BusinessPage(shown.business.slug)) },
                    icon = Icons.Outlined.Storefront,
                )
            }
            error != null -> EmptyState("No se pudo abrir la tarjeta", error)
            else -> Loading()
        }
    }

    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("¿Quitar esta tarjeta de la app?") },
            text = { Text("No pierdes tus sellos ni tu saldo: la tarjeta sigue en el negocio y la puedes volver a agregar con su código.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false
                    scope.launch {
                        try {
                            WalletStore.remove(cardId)
                            Nav.pop()
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            error = e.userMessage
                            android.widget.Toast.makeText(context, e.userMessage, android.widget.Toast.LENGTH_LONG).show()
                        }
                    }
                }) { Text("Quitar", color = Sula.colors.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancelar") } },
        )
    }
}

/** El QR de la tarjeta en un cuadro blanco (también en modo oscuro, para que la cámara de caja lo lea bien). */
@Composable
fun QrPanel(cardId: String, code: String) {
    val qr = remember(cardId) { QrCode.bitmap(cardId).asImageBitmap() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(Sula.radius))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(
            bitmap = qr,
            contentDescription = "QR de tu tarjeta $code",
            filterQuality = FilterQuality.None,
            contentScale = ContentScale.Fit,
            modifier = Modifier.widthIn(max = 220.dp).fillMaxWidth().aspectRatio(1f),
        )
        SelectionContainer {
            Text(code, color = Color(0xFF1D1B26), fontSize = 20.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
        }
        Text("Muéstralo en caja para sumar o canjear", color = Color(0xFF6B6880), fontSize = 13.sp)
    }
}

/** «Agregar a Google Wallet»: la API arma el enlace firmado y Google Wallet lo abre. */
@Composable
private fun GoogleWalletButton(cardId: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PrimaryButton(
            "Agregar a Google Wallet",
            busy = busy,
            icon = Icons.Outlined.AccountBalanceWallet,
            onClick = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        val save = Api.request<GoogleSaveUrl>("GET", "/public/cards/$cardId/google")
                        Links.open(context, save.url)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = e.userMessage
                    }
                    busy = false
                }
            },
        )
        error?.let { Notice(it) }
    }
}

/** Los movimientos de la tarjeta, del más reciente al más viejo. */
@Composable
fun History(movements: List<Movement>?) {
    if (movements.isNullOrEmpty()) return
    Panel(spacing = 0.dp) {
        SectionTitle("Movimientos", Modifier.padding(bottom = 8.dp))
        movements.forEachIndexed { index, m ->
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
                Text(m.summary, color = Sula.colors.ink, fontSize = 15.sp, modifier = Modifier.weight(1f))
                Spacer(Modifier.padding(start = 8.dp))
                Text(Fmt.dateTime(m.createdAt), color = Sula.colors.muted, fontSize = 13.sp)
            }
            if (index < movements.lastIndex) RowDivider()
        }
    }
}
