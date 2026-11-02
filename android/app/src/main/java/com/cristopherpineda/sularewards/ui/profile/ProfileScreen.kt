package com.cristopherpineda.sularewards.ui.profile

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
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.Config
import com.cristopherpineda.sularewards.core.Fmt
import com.cristopherpineda.sularewards.core.HiddenBusinesses
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.Session
import com.cristopherpineda.sularewards.core.subtitle
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Links
import com.cristopherpineda.sularewards.ui.Page
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.RowDivider
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.SectionTitle
import com.cristopherpineda.sularewards.ui.Sula
import com.cristopherpineda.sularewards.ui.business.BusinessLogoEditor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Tus datos, tu negocio (logo y promociones), ayuda, salir y borrar la cuenta (lo pide Google Play). */
@Composable
fun ProfileScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val user = Session.user
    val business = BusinessStore.current
    val businesses = BusinessStore.businesses
    val hidden = HiddenBusinesses.slugs
    var confirmSignOut by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    var picking by remember { mutableStateOf(false) }

    Page(title = "Perfil", spacing = 18.dp) {
        // Tus datos
        Section("Tus datos", footer = "Con tu nombre y tu celular te unes a los programas desde la app.") {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { Nav.push(Screen.ProfileDetails()) }.padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(user?.fullName ?: "Agrega tu nombre", color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        user?.phone?.let { "+504 ${Fmt.phone(it)}" } ?: "Agrega tu celular para unirte a programas",
                        color = Sula.colors.muted,
                        fontSize = 14.sp,
                    )
                }
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Sula.colors.muted)
            }
            RowDivider()
            Row(Modifier.padding(vertical = 6.dp)) {
                Text("Correo", color = Sula.colors.ink, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Text(user?.email ?: "", color = Sula.colors.muted, fontSize = 16.sp)
            }
        }

        // Tu negocio
        if (business != null) {
            Section("Tu negocio") {
                Column {
                    Text(business.name, color = Sula.colors.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    Text(subtitle(business.category, business.city), color = Sula.colors.muted, fontSize = 14.sp)
                }
                BusinessLogoEditor(business)
                RowDivider()
                LinkRow("Promociones", Icons.Outlined.Campaign) { Nav.push(Screen.Promotions(business)) }
                LinkRow("Cambiar nombre o giro", null) { Nav.push(Screen.EditBusiness(business)) }
                if ((businesses?.size ?: 0) > 1) {
                    Box {
                        LinkRow("Negocio en caja: ${business.name}", null) { picking = true }
                        DropdownMenu(expanded = picking, onDismissRequest = { picking = false }) {
                            businesses.orEmpty().forEach { b ->
                                DropdownMenuItem(
                                    text = { Text(b.name, fontWeight = if (b.id == business.id) FontWeight.Bold else FontWeight.Normal) },
                                    onClick = {
                                        picking = false
                                        BusinessStore.choose(b.id)
                                    },
                                )
                            }
                        }
                    }
                }
                if ((businesses?.size ?: 0) < BusinessStore.MAX_BUSINESSES) {
                    LinkRow("Agregar otro negocio", null) { Nav.push(Screen.CreateBusiness) }
                }
                LinkRow("Abrir el panel web", Icons.Outlined.Language) { Links.open(context, Config.PANEL_URL) }
            }
        } else if (businesses != null) {
            Section("¿Tienes un negocio?", footer = "Crea tu programa de sellos, puntos, cashback o gift cards y suma en caja desde esta app.") {
                LinkRow("Registrar mi negocio", null) { Nav.push(Screen.CreateBusiness) }
            }
        }

        // Negocios ocultos
        if (hidden.isNotEmpty()) {
            Section("Negocios ocultos", footer = "Sus promociones no te salen en Explorar.") {
                hidden.sorted().forEach { slug ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(slug, color = Sula.colors.ink, fontSize = 15.sp, modifier = Modifier.weight(1f))
                        TextButton(onClick = { HiddenBusinesses.show(slug) }) { Text("Mostrar", fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }

        Section("Ayuda") {
            LinkRow("Soporte", Icons.Outlined.SupportAgent) { Links.open(context, Config.SUPPORT_URL) }
            LinkRow("Política de privacidad", Icons.Outlined.PrivacyTip) { Links.open(context, Config.PRIVACY_URL) }
        }

        Section("Tu cuenta", footer = "Se borran tu cuenta y, si tienes negocio, tus programas y las tarjetas de tus clientes. No se puede deshacer.") {
            SecondaryButton("Salir", onClick = { confirmSignOut = true })
            Box(contentAlignment = Alignment.Center) {
                SecondaryButton("Borrar mi cuenta", onClick = { confirmDelete = true }, enabled = !deleting, color = Sula.colors.danger)
                if (deleting) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Sula.colors.danger)
            }
        }

        FinePrint("Sula Rewards ${Config.version} · Hecho en San Pedro Sula", Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("¿Salir de Sula Rewards?") },
            text = { Text("Tus tarjetas siguen guardadas en tu cuenta para cuando vuelvas a entrar.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    scope.launch { Session.signOut() }
                }) { Text("Salir", color = Sula.colors.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text("Cancelar") } },
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("¿Borrar tu cuenta?") },
            text = {
                Text(
                    "Se borra tu cuenta para siempre. Si tienes negocio, también sus programas y las tarjetas y movimientos de todos tus " +
                        "clientes. Tus tarjetas como cliente siguen en cada negocio, pero ya no en esta app.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        deleting = true
                        try {
                            Session.deleteAccount()
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            deleteError = e.userMessage
                        }
                        deleting = false
                    }
                }) { Text("Borrar todo", color = Sula.colors.danger, fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancelar") } },
        )
    }

    deleteError?.let { message ->
        AlertDialog(
            onDismissRequest = { deleteError = null },
            title = { Text("No se pudo borrar la cuenta") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { deleteError = null }) { Text("Entendido") } },
        )
    }
}

/** Un grupo del perfil: título arriba, panel y una nota abajo. */
@Composable
private fun Section(title: String, footer: String? = null, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle(title)
        Panel(spacing = 8.dp) { content() }
        if (footer != null) FinePrint(footer, Modifier.padding(horizontal = 4.dp))
    }
}

@Composable
private fun LinkRow(title: String, icon: ImageVector?, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = Sula.colors.accent)
        Text(title, color = Sula.colors.accent, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Sula.colors.muted)
    }
}

