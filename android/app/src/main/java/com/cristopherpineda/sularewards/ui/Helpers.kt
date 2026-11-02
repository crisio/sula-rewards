package com.cristopherpineda.sularewards.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.HapticFeedbackConstants
import android.view.View
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URLEncoder
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max

object Haptics {
    fun tap(view: View) {
        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
    }

    fun success(view: View) {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    }

    fun error(view: View) {
        view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
    }
}

object QrCode {
    /** QR en blanco y negro con un pixel por módulo: se dibuja ampliado sin suavizar, así queda nítido. */
    fun bitmap(text: String, margin: Int = 1): Bitmap {
        val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to margin, EncodeHintType.CHARACTER_SET to "UTF-8")
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints)
        val pixels = IntArray(matrix.width * matrix.height) { i ->
            if (matrix.get(i % matrix.width, i / matrix.width)) Color.BLACK else Color.WHITE
        }
        return Bitmap.createBitmap(pixels, matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
    }
}

/** El lector de QR de Google Play services: abre su propia pantalla de cámara y no pide permiso de cámara a la app. */
object Scanner {
    class Unavailable : Exception("No se pudo abrir el lector de QR. Escribe el código.")

    /** El texto del QR, o null si la persona cerró el lector. */
    suspend fun scan(context: Context): String? = suspendCancellableCoroutine { cont ->
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(context, options).startScan()
            .addOnSuccessListener { if (cont.isActive) cont.resume(it.rawValue) }
            .addOnCanceledListener { if (cont.isActive) cont.resume(null) }
            .addOnFailureListener { if (cont.isActive) cont.resumeWithException(Unavailable()) }
    }
}

object Links {
    fun open(context: Context, url: String) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (ignored: ActivityNotFoundException) {
            Toast.makeText(context, "No hay una app para abrir el enlace.", Toast.LENGTH_SHORT).show()
        }
    }

    /** wa.me/504XXXXXXXX con el mensaje ya escrito. */
    fun whatsApp(context: Context, phone: String, message: String) {
        val digits = phone.filter { it in '0'..'9' }
        open(context, "https://wa.me/$digits?text=" + URLEncoder.encode(message, "UTF-8").replace("+", "%20"))
    }

    fun shareText(context: Context, text: String, title: String? = null) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        if (title != null) send.putExtra(Intent.EXTRA_TITLE, title)
        context.startActivity(Intent.createChooser(send, title))
    }

    /** Comparte una imagen (el cartel) con la hoja del sistema: WhatsApp, imprimir, guardar… */
    fun shareImage(context: Context, bitmap: Bitmap, name: String, title: String) {
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val file = File(dir, name)
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TITLE, title).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri(title, uri)
        context.startActivity(Intent.createChooser(send, title))
    }
}

object LogoImage {
    /** La foto que eligió el dueño, recortada al centro en un cuadrado de 360×360 y en PNG (lo que pide la API). */
    suspend fun squarePng(context: Context, uri: Uri, size: Int = 360): ByteArray? = withContext(Dispatchers.Default) {
        runCatching {
            val source = decode(context, uri, size) ?: return@runCatching null
            val square = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val scale = max(size.toFloat() / source.width, size.toFloat() / source.height)
            val matrix = Matrix().apply {
                postScale(scale, scale)
                postTranslate((size - source.width * scale) / 2f, (size - source.height * scale) / 2f)
            }
            Canvas(square).drawBitmap(source, matrix, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
            java.io.ByteArrayOutputStream().use { out ->
                square.compress(Bitmap.CompressFormat.PNG, 100, out)
                out.toByteArray()
            }
        }.getOrNull()
    }

    private fun decode(context: Context, uri: Uri, size: Int): Bitmap? =
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                val shortest = minOf(info.size.width, info.size.height)
                if (shortest > size * 2) decoder.setTargetSampleSize(shortest / (size * 2))
            }
        } else {
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        }
}

/** El cartel para imprimir (como el de la web): logo, nombre, QR y cómo se guarda la tarjeta. */
object Poster {
    fun render(businessName: String, url: String): Bitmap {
        val width = 1800
        val ink = 0xFF1D1B26.toInt()
        val pad = 128f
        val text = width - pad * 2
        val title = layout(businessName, 112f, ink, bold = true, width = text.toInt())
        val lead = layout("Escanea, únete y gana premios en cada visita", 60f, ink, bold = true, width = text.toInt())
        val foot = layout("Tu tarjeta se guarda en el Wallet de tu teléfono", 52f, ink, bold = false, width = text.toInt())
        val qrSize = 1280
        val logo = 192f
        val gap = 56f
        val height = (pad + logo + gap + title.height + gap + lead.height + gap + qrSize + gap + foot.height + pad).toInt()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        var y = pad
        drawLogoMark(canvas, (width - logo) / 2f, y, logo)
        y += logo + gap
        y = drawLayout(canvas, title, pad, y) + gap
        y = drawLayout(canvas, lead, pad, y) + gap
        val qr = QrCode.bitmap(url, margin = 0)
        val paint = Paint().apply { isFilterBitmap = false }
        canvas.drawBitmap(qr, null, RectF((width - qrSize) / 2f, y, (width + qrSize) / 2f, y + qrSize), paint)
        y += qrSize + gap
        drawLayout(canvas, foot, pad, y)
        return bitmap
    }

    /** Los cuatro puntos de Sula Rewards (public/favicon.svg). */
    fun drawLogoMark(canvas: Canvas, x: Float, y: Float, size: Float) {
        val unit = size / 64f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = 0xFF1D1B26.toInt()
        canvas.drawRoundRect(RectF(x, y, x + size, y + size), 16 * unit, 16 * unit, paint)
        listOf(Triple(22f, 22f, 0xFF4F3FE0), Triple(42f, 22f, 0xFFF2820F), Triple(22f, 42f, 0xFF16A34A), Triple(42f, 42f, 0xFFF1ECFB))
            .forEach { (cx, cy, color) ->
                paint.color = color.toInt()
                canvas.drawCircle(x + cx * unit, y + cy * unit, 9 * unit, paint)
            }
    }

    private fun layout(text: String, size: Float, color: Int, bold: Boolean, width: Int): StaticLayout {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size
            this.color = color
            typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
        }
        return StaticLayout.Builder.obtain(text, 0, text.length, paint, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build()
    }

    private fun drawLayout(canvas: Canvas, layout: StaticLayout, x: Float, y: Float): Float {
        canvas.save()
        canvas.translate(x, y)
        layout.draw(canvas)
        canvas.restore()
        return y + layout.height
    }
}
