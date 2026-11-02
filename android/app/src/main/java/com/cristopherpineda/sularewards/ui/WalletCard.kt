package com.cristopherpineda.sularewards.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import coil.compose.AsyncImage
import com.cristopherpineda.sularewards.core.Headline
import com.cristopherpineda.sularewards.core.ProgramType

/** La tarjeta como se ve en Apple Wallet o Google Wallet (src/components/WalletCard.tsx). */
@Composable
fun WalletCard(
    type: ProgramType,
    color: String,
    businessName: String,
    headline: Headline,
    modifier: Modifier = Modifier,
    logoUrl: String? = null,
    customerName: String? = null,
    reward: String? = null,
    stamps: Int = 0,
    stampsGoal: Int? = null,
) {
    val cardColor = hexColor(color)
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(14.dp, shape, ambientColor = cardColor, spotColor = cardColor)
            .background(cardColor, shape)
            .padding(horizontal = 20.dp, vertical = 18.dp)
            .clearAndSetSemantics { contentDescription = "$businessName: ${headline.label} ${headline.value}" },
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(Color.White.copy(alpha = 0.92f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(type.icon, contentDescription = null, tint = cardColor, modifier = Modifier.size(16.dp))
                    if (logoUrl != null) {
                        AsyncImage(model = logoUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    }
                }
                Text(businessName, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.size(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                CardLabel(headline.label)
                Text(headline.value, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, maxLines = 1)
            }
        }

        if (type == ProgramType.SELLOS && stampsGoal != null && stampsGoal > 0) {
            StampGrid(goal = stampsGoal, filled = stamps, color = cardColor)
        }

        if (customerName != null || reward != null) {
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    if (customerName != null) {
                        CardLabel("CLIENTE")
                        Text(customerName, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (reward != null) {
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                        CardLabel("PREMIO")
                        Text(reward, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun StampGrid(goal: Int, filled: Int, color: Color) {
    val perRow = if (goal > 10) (goal + 1) / 2 else goal
    Column(
        Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        (0 until goal).chunked(perRow).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (i in 0 until perRow) {
                    val index = row.getOrNull(i)
                    Box(Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                        when {
                            index == null -> {}
                            index < filled -> {
                                Box(Modifier.fillMaxSize().background(Color.White, CircleShape), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Filled.Check, contentDescription = null, tint = color, modifier = Modifier.fillMaxSize(0.55f))
                                }
                            }
                            else -> Canvas(Modifier.fillMaxSize()) {
                                drawCircle(Color.White.copy(alpha = 0.08f))
                                drawCircle(
                                    Color.White.copy(alpha = 0.55f),
                                    radius = size.minDimension / 2 - 1.dp.toPx(),
                                    style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
