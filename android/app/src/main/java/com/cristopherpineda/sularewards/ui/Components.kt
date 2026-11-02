package com.cristopherpineda.sularewards.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.cristopherpineda.sularewards.core.ProgramType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Piezas de la interfaz, como las de la web (src/styles.css) y la app de iPhone: paneles, botones en cápsula y avisos.

/** Panel redondeado sobre el fondo. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    padding: Dp = 18.dp,
    spacing: Dp = 12.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Sula.colors.surface, RoundedCornerShape(Sula.radius))
            .padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing),
        content = content,
    )
}

/** Botón principal: oscuro sobre fondo claro (claro en modo oscuro), como .btn-primary de la web. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    big: Boolean = false,
    icon: ImageVector? = null,
) {
    val c = Sula.colors
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = modifier.fillMaxWidth().heightIn(min = if (big) 64.dp else 52.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = c.ink,
            contentColor = c.bg,
            disabledContainerColor = c.ink.copy(alpha = if (busy) 0.8f else 0.3f),
            disabledContentColor = c.bg.copy(alpha = 0.9f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.size(22.dp), color = c.bg, strokeWidth = 2.5.dp)
        } else {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(if (big) 24.dp else 20.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(text, fontSize = if (big) 19.sp else 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        }
    }
}

/** Botón secundario: fondo hundido y texto oscuro. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    color: Color? = null,
) {
    val c = Sula.colors
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = 50.dp),
        shape = CircleShape,
        border = BorderStroke(1.dp, c.line),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = c.sunken,
            contentColor = color ?: c.ink,
            disabledContainerColor = c.sunken.copy(alpha = 0.5f),
            disabledContentColor = c.muted,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}

/** Botón con el color del programa (canjear el premio). */
@Composable
fun TintedButton(text: String, color: Color, onClick: () -> Unit, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = CircleShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = color,
            contentColor = Color.White,
            disabledContainerColor = color.copy(alpha = 0.4f),
            disabledContentColor = Color.White.copy(alpha = 0.8f),
        ),
    ) {
        Text(text, fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.semantics { heading() },
        color = Sula.colors.ink,
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
    )
}

/** Etiqueta de un campo de formulario. */
@Composable
fun FieldLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, color = Sula.colors.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
}

/** Texto chico gris. */
@Composable
fun FinePrint(text: String, modifier: Modifier = Modifier, textAlign: TextAlign? = null) {
    Text(text, modifier = modifier, color = Sula.colors.muted, fontSize = 13.sp, lineHeight = 18.sp, textAlign = textAlign)
}

/** Mensaje dentro de un panel («Código incorrecto», «Tarjeta creada…»). */
@Composable
fun Notice(text: String, success: Boolean = false) {
    val color = if (success) Sula.colors.success else Sula.colors.danger
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(color.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            if (success) Icons.Filled.CheckCircle else Icons.Filled.Warning,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(18.dp).padding(top = 1.dp),
        )
        Text(text, color = color, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

/** Campo de texto con fondo hundido. */
@Composable
fun Input(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    autoCorrect: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    prefix: String? = null,
    suffix: String? = null,
    enabled: Boolean = true,
    textStyle: TextStyle = TextStyle(fontSize = 17.sp),
    onDone: (() -> Unit)? = null,
) {
    val c = Sula.colors
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        textStyle = textStyle.copy(color = c.ink),
        cursorBrush = SolidColor(c.accent),
        keyboardOptions = KeyboardOptions(
            capitalization = capitalization,
            autoCorrectEnabled = autoCorrect,
            keyboardType = keyboardType,
            imeAction = if (onDone != null) androidx.compose.ui.text.input.ImeAction.Done else androidx.compose.ui.text.input.ImeAction.Default,
        ),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { field ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(c.sunken, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (prefix != null) Text(prefix, color = c.muted, fontSize = textStyle.fontSize, fontWeight = FontWeight.Bold)
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(placeholder, style = textStyle.copy(color = c.muted.copy(alpha = 0.7f)))
                    field()
                }
                if (suffix != null) Text(suffix, color = c.muted, fontSize = textStyle.fontSize, fontWeight = FontWeight.Bold)
            }
        },
    )
}

/** Monto en lempiras con la «L» adelante. Acepta «1,250.50». */
@Composable
fun LempirasInput(value: String, onValueChange: (String) -> Unit, enabled: Boolean = true, onDone: (() -> Unit)? = null) {
    Input(
        value = value,
        onValueChange = onValueChange,
        placeholder = "0.00",
        prefix = "L",
        keyboardType = KeyboardType.Decimal,
        enabled = enabled,
        textStyle = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
        onDone = onDone,
    )
}

/** Celular de Honduras: «+504» y los 8 dígitos. */
@Composable
fun PhoneInput(value: String, onValueChange: (String) -> Unit) {
    Input(value = value, onValueChange = onValueChange, placeholder = "9876-5432", prefix = "+504", keyboardType = KeyboardType.Phone)
}

val ProgramType.icon: ImageVector
    get() = when (this) {
        ProgramType.SELLOS -> Icons.Filled.LocalCafe
        ProgramType.PUNTOS -> Icons.Filled.Star
        ProgramType.CASHBACK -> Icons.Filled.Payments
        ProgramType.GIFTCARD -> Icons.Filled.CardGiftcard
    }

/** El ícono del tipo de programa en un cuadrito del color del programa. */
@Composable
fun ProgramIcon(type: ProgramType, color: String, size: Dp = 40.dp) {
    Box(
        modifier = Modifier.size(size).background(hexColor(color), RoundedCornerShape(size * 0.28f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(type.icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * 0.5f))
    }
}

/** El logo del negocio en un cuadro blanco redondeado; sin logo, la inicial de su nombre. */
@Composable
fun BusinessLogo(url: String?, name: String, size: Dp = 44.dp) {
    val shape = RoundedCornerShape(size * 0.28f)
    Box(
        modifier = Modifier
            .size(size)
            .clip(shape)
            .background(Color.White)
            .border(1.dp, Sula.colors.line, shape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.take(1).uppercase(),
            color = Sula.sellos,
            fontSize = (size.value * 0.42f).sp,
            fontWeight = FontWeight.Black,
        )
        if (url != null) {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** Cuatro puntos, uno por tipo de programa: sellos, puntos, cashback y gift cards (public/favicon.svg). */
@Composable
fun LogoMark(size: Dp = 64.dp) {
    Canvas(Modifier.size(size)) {
        val unit = this.size.width / 64f
        drawRoundRect(Sula.logoInk, cornerRadius = CornerRadius(16 * unit, 16 * unit))
        listOf(Triple(22f, 22f, Sula.sellos), Triple(42f, 22f, Sula.puntos), Triple(22f, 42f, Sula.cashback), Triple(42f, 42f, Sula.logoLight))
            .forEach { (x, y, color) -> drawCircle(color, radius = 9 * unit, center = Offset(x * unit, y * unit)) }
    }
}

@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.TopCenter) {
        CircularProgressIndicator(color = Sula.colors.muted)
    }
}

/** Cuando algo no se pudo abrir: título, explicación y, si hay, un botón para reintentar. */
@Composable
fun EmptyState(title: String, message: String?, action: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 48.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, color = Sula.colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        if (message != null) Text(message, color = Sula.colors.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
        if (action != null && onAction != null) PrimaryButton(action, onAction, modifier = Modifier.padding(top = 8.dp))
    }
}

/** Aviso que aparece abajo unos segundos (después de cada movimiento en caja). */
class ToastState {
    var text by mutableStateOf<String?>(null)
        private set
    private var serial by mutableStateOf(0)

    fun show(message: String) {
        text = message
        serial++
    }

    @Composable
    fun Host(modifier: Modifier = Modifier) {
        val current = serial
        LaunchedEffect(current) {
            if (text != null) {
                delay(3000)
                if (serial == current) text = null
            }
        }
        AnimatedVisibility(
            visible = text != null,
            modifier = modifier,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
        ) {
            Text(
                text ?: "",
                color = Sula.colors.bg,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(horizontal = Sula.gutter, vertical = 16.dp)
                    .shadow(12.dp, CircleShape)
                    .background(Sula.colors.ink, CircleShape)
                    .padding(horizontal = 20.dp, vertical = 14.dp),
            )
        }
    }
}

@Composable
fun rememberToast() = remember { ToastState() }

/**
 * Una pantalla: barra de arriba con el título (y la flecha para regresar si no es el inicio de la pestaña), fondo de
 * la app y contenido que se desplaza y se actualiza al jalar hacia abajo.
 */
@Composable
fun Page(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable () -> Unit = {},
    onRefresh: (suspend () -> Unit)? = null,
    overlay: @Composable BoxScope.() -> Unit = {},
    spacing: Dp = 20.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Sula.colors
    Scaffold(
        containerColor = c.bg,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        title,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.Bold,
                        fontSize = if (onBack == null) 26.sp else 19.sp,
                    )
                },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Regresar") }
                    }
                },
                actions = { actions() },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bg, scrolledContainerColor = c.bg, titleContentColor = c.ink),
            )
        },
    ) { inner ->
        val body: @Composable () -> Unit = {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(start = Sula.gutter, end = Sula.gutter, top = 4.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(spacing),
                content = content,
            )
        }
        Box(Modifier.fillMaxSize().padding(inner)) {
            if (onRefresh != null) {
                var refreshing by remember { mutableStateOf(false) }
                val scope = rememberCoroutineScope()
                PullToRefreshBox(
                    isRefreshing = refreshing,
                    onRefresh = {
                        scope.launch {
                            refreshing = true
                            try {
                                onRefresh()
                            } finally {
                                refreshing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                ) { body() }
            } else {
                body()
            }
            overlay()
        }
    }
}

/** Fila tocable de una lista dentro de un panel (un negocio, un programa, un cliente). */
@Composable
fun RowDivider(startPadding: Dp = 0.dp) {
    Box(
        Modifier
            .padding(start = startPadding)
            .fillMaxWidth()
            .defaultMinSize(minHeight = 1.dp)
            .background(Sula.colors.line),
    )
}

/** Texto en mayúsculas y chiquito de la tarjeta («CLIENTE», «PREMIO»). */
@Composable
fun CardLabel(text: String) {
    Text(text, color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
}
