package com.cristopherpineda.sularewards.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Los colores de la web (src/styles.css) y de la app de iPhone, con su versión para modo oscuro. */
@Immutable
data class SulaColors(
    val bg: Color,
    val surface: Color,
    val sunken: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val danger: Color,
    val success: Color,
)

private val Light = SulaColors(
    bg = Color(0xFFF1ECFB),
    surface = Color(0xFFFFFFFF),
    sunken = Color(0xFFF7F4FD),
    ink = Color(0xFF1D1B26),
    muted = Color(0xFF6B6880),
    line = Color(0xFFE2DCF0),
    accent = Color(0xFF4F3FE0),
    danger = Color(0xFFC8323C),
    success = Color(0xFF15803D),
)

private val Dark = SulaColors(
    bg = Color(0xFF14121B),
    surface = Color(0xFF1F1C29),
    sunken = Color(0xFF26222F),
    ink = Color(0xFFF3F0FA),
    muted = Color(0xFFA7A2B8),
    line = Color(0xFF34303F),
    accent = Color(0xFF9D93FF),
    danger = Color(0xFFFF7B83),
    success = Color(0xFF4ADE80),
)

private val LocalSulaColors = staticCompositionLocalOf { Light }

object Sula {
    val colors: SulaColors
        @Composable @ReadOnlyComposable get() = LocalSulaColors.current

    /** Colores del logo: uno por tipo de programa. */
    val sellos = Color(0xFF4F3FE0)
    val puntos = Color(0xFFF2820F)
    val cashback = Color(0xFF16A34A)
    val logoInk = Color(0xFF1D1B26)
    val logoLight = Color(0xFFF1ECFB)

    /** Los colores que se pueden elegir para una tarjeta (los mismos del panel web). */
    val swatches = listOf("#4f3fe0", "#f2820f", "#16a34a", "#2e2b38", "#d92d6b", "#0e7490", "#b45309", "#7c3aed")

    val radius = 18.dp
    val gutter = 16.dp
}

/** «#4f3fe0» (el color de un programa) → Color. Si no se puede leer, el violeta de los sellos. */
fun hexColor(hex: String): Color =
    hex.removePrefix("#").toLongOrNull(16)?.takeIf { hex.removePrefix("#").length == 6 }?.let { Color(0xFF000000 or it) } ?: Sula.sellos

@Composable
fun SulaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val c = if (dark) Dark else Light
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.accent, onPrimary = c.bg, secondary = c.ink, onSecondary = c.bg,
            background = c.bg, onBackground = c.ink, surface = c.bg, onSurface = c.ink,
            surfaceVariant = c.sunken, onSurfaceVariant = c.muted, surfaceContainer = c.surface,
            surfaceContainerHigh = c.surface, surfaceContainerHighest = c.sunken, surfaceContainerLow = c.surface,
            outline = c.line, outlineVariant = c.line, error = c.danger, secondaryContainer = c.sunken,
            onSecondaryContainer = c.ink,
        )
    } else {
        lightColorScheme(
            primary = c.accent, onPrimary = Color.White, secondary = c.ink, onSecondary = c.bg,
            background = c.bg, onBackground = c.ink, surface = c.bg, onSurface = c.ink,
            surfaceVariant = c.sunken, onSurfaceVariant = c.muted, surfaceContainer = c.surface,
            surfaceContainerHigh = c.surface, surfaceContainerHighest = c.sunken, surfaceContainerLow = c.surface,
            outline = c.line, outlineVariant = c.line, error = c.danger, secondaryContainer = c.line,
            onSecondaryContainer = c.ink,
        )
    }
    CompositionLocalProvider(LocalSulaColors provides c) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
