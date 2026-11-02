package com.cristopherpineda.sularewards.ui.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cristopherpineda.sularewards.core.Auth
import com.cristopherpineda.sularewards.core.AuthConfig
import com.cristopherpineda.sularewards.core.Config
import com.cristopherpineda.sularewards.core.Session
import com.cristopherpineda.sularewards.core.userMessage
import com.cristopherpineda.sularewards.ui.FieldLabel
import com.cristopherpineda.sularewards.ui.FinePrint
import com.cristopherpineda.sularewards.ui.Haptics
import com.cristopherpineda.sularewards.ui.Input
import com.cristopherpineda.sularewards.ui.Links
import com.cristopherpineda.sularewards.ui.LogoMark
import com.cristopherpineda.sularewards.ui.Notice
import com.cristopherpineda.sularewards.ui.Panel
import com.cristopherpineda.sularewards.ui.PrimaryButton
import com.cristopherpineda.sularewards.ui.SecondaryButton
import com.cristopherpineda.sularewards.ui.Sula
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Entrar con Google o con un código de 6 dígitos por correo. Si es la primera vez, se crea la cuenta. */
@Composable
fun LoginScreen() {
    val c = Sula.colors
    val context = LocalContext.current
    val view = LocalView.current
    val scope = rememberCoroutineScope()

    var config by remember { mutableStateOf<AuthConfig?>(null) }
    var usingEmail by rememberSaveable { mutableStateOf(false) }
    var codeStep by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var wait by rememberSaveable { mutableIntStateOf(0) }

    LaunchedEffect(Unit) { config = Auth.config() }
    LaunchedEffect(wait) {
        if (wait > 0) {
            delay(1000)
            wait -= 1
        }
    }

    fun requestCode() {
        val trimmed = email.trim()
        if (busy || !trimmed.contains("@")) return
        scope.launch {
            busy = true
            error = null
            try {
                Auth.requestCode(trimmed)
                codeStep = true
                code = ""
                wait = 60
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage
            }
            busy = false
        }
    }

    fun verify() {
        if (busy || code.length != 6) return
        scope.launch {
            busy = true
            error = null
            try {
                Session.signIn(Auth.verify(email.trim(), code))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage
                Haptics.error(view)
                code = ""
            }
            busy = false
        }
    }

    fun google(clientId: String) {
        scope.launch {
            busy = true
            error = null
            try {
                Session.signIn(Auth.google(context, clientId))
            } catch (ignored: Auth.Cancelled) {
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage
                Haptics.error(view)
            }
            busy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(c.bg)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = Sula.gutter, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Spacer(Modifier.padding(top = 24.dp))
            LogoMark(76.dp)
            Text("Sula Rewards", color = c.ink, fontSize = 36.sp, fontWeight = FontWeight.Black)
            Text(
                "Tus tarjetas de lealtad de San Pedro Sula en un solo lugar. Y si tienes negocio, tu caja para sumar y canjear.",
                color = c.muted,
                fontSize = 17.sp,
                textAlign = TextAlign.Center,
            )
        }

        Panel {
            val googleId = config?.googleWebClientId
            if (googleId != null) {
                PrimaryButton("Continuar con Google", onClick = { google(googleId) }, enabled = !busy, icon = Icons.Filled.AccountCircle)
            }
            if (!usingEmail) {
                SecondaryButton("Entrar con mi correo", onClick = { usingEmail = true; error = null }, enabled = !busy, icon = Icons.Filled.Email)
            }
            if (busy && !usingEmail) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(color = c.muted) }
            }
            if (!usingEmail) error?.let { Notice(it) }
        }

        AnimatedVisibility(visible = usingEmail) {
            if (!codeStep) {
                Panel(spacing = 14.dp) {
                    FieldLabel("Tu correo")
                    Input(
                        value = email,
                        onValueChange = { email = it },
                        placeholder = "tucorreo@gmail.com",
                        keyboardType = KeyboardType.Email,
                        capitalization = KeyboardCapitalization.None,
                        autoCorrect = false,
                        onDone = ::requestCode,
                    )
                    FinePrint("Te enviaremos un código para entrar. Si es tu primera vez, se crea tu cuenta.")
                    error?.let { Notice(it) }
                    PrimaryButton("Enviarme un código", onClick = ::requestCode, enabled = email.contains("@"), busy = busy)
                }
            } else {
                Panel(spacing = 14.dp) {
                    Text(
                        buildAnnotatedString {
                            append("Escribe el código de 6 dígitos que enviamos a ")
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(email.trim()) }
                            append(".")
                        },
                        color = c.ink,
                        fontSize = 17.sp,
                    )
                    Input(
                        value = code,
                        onValueChange = { text ->
                            code = text.filter { it in '0'..'9' }.take(6)
                            if (code.length == 6) verify()
                        },
                        placeholder = "000000",
                        keyboardType = KeyboardType.NumberPassword,
                        enabled = !busy,
                        textStyle = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = 10.sp, textAlign = TextAlign.Center),
                    )
                    error?.let { Notice(it) }
                    PrimaryButton("Entrar", onClick = ::verify, enabled = code.length == 6, busy = busy)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { codeStep = false; error = null }) { Text("Cambiar correo", fontWeight = FontWeight.SemiBold) }
                        TextButton(onClick = ::requestCode, enabled = wait == 0 && !busy) {
                            Text(if (wait > 0) "Reenviar en $wait s" else "Reenviar código", fontWeight = FontWeight.SemiBold)
                        }
                    }
                    FinePrint("¿No llega? Revisa la carpeta de spam o promociones.")
                }
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            FinePrint("¿Qué hacemos con tus datos?")
            TextButton(onClick = { Links.open(context, Config.PRIVACY_URL) }) {
                Text("Lee la política de privacidad", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}
