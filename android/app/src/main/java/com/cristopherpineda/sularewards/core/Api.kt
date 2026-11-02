package com.cristopherpineda.sularewards.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNamingStrategy
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Error para mostrar al usuario: el mensaje viene del servidor (en español). status 0 = sin conexión. */
class ApiError(message: String, val status: Int) : Exception(message) {
    companion object {
        val offline get() = ApiError("Sin conexión. Revisa tu internet.", 0)
    }
}

/** El texto de cualquier error para mostrarlo en pantalla. */
val Throwable.userMessage: String
    get() = (this as? ApiError)?.message ?: "Algo salió mal. Intenta de nuevo."

/** Cliente de la API con el token de sesión (Bearer). */
object Api {
    @Volatile var token: String? = null

    /** Sesión vencida o inválida (401): la app regresa a la pantalla de entrar. */
    var onUnauthorized: (() -> Unit)? = null

    val json = Json {
        namingStrategy = JsonNamingStrategy.SnakeCase
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /** La respuesta como texto. Lanza ApiError con el mensaje del servidor si no es 2xx. */
    suspend fun raw(
        method: String,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: JsonObject? = null,
        bytes: ByteArray? = null,
        contentType: String = "application/octet-stream",
        timeoutSeconds: Long = 20,
    ): String {
        val url = (Config.API_URL + path).toHttpUrl().newBuilder().apply {
            query.toSortedMap().forEach { (k, v) -> addQueryParameter(k, v) }
        }.build()
        val requestBody: RequestBody? = when {
            body != null -> body.toString().toRequestBody("application/json".toMediaType())
            bytes != null -> bytes.toRequestBody(contentType.toMediaType())
            method in setOf("POST", "PUT", "PATCH") -> ByteArray(0).toRequestBody(null)
            else -> null
        }
        val sentToken = token
        val request = Request.Builder().url(url).method(method, requestBody).apply {
            if (sentToken != null) header("Authorization", "Bearer $sentToken")
        }.build()

        val client = http.newBuilder().callTimeout(timeoutSeconds, TimeUnit.SECONDS).build()
        val response = try {
            client.newCall(request).await()
        } catch (e: IOException) {
            throw ApiError.offline
        }
        val (status, text) = withContext(Dispatchers.IO) {
            response.use { it.code to (runCatching { it.body?.string() }.getOrNull() ?: "") }
        }
        if (status !in 200..299) {
            if (status == 401 && sentToken != null) withContext(Dispatchers.Main) { onUnauthorized?.invoke() }
            val message = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
            throw ApiError(message ?: "Error $status", status)
        }
        return text
    }

    suspend inline fun <reified T> request(
        method: String,
        path: String,
        query: Map<String, String> = emptyMap(),
        body: JsonObject? = null,
        bytes: ByteArray? = null,
        contentType: String = "application/octet-stream",
        timeoutSeconds: Long = 20,
    ): T {
        val text = raw(method, path, query, body, bytes, contentType, timeoutSeconds)
        return try {
            json.decodeFromString<T>(text)
        } catch (e: IllegalArgumentException) {
            throw ApiError("El servidor respondió algo inesperado. Intenta de nuevo.", 200)
        }
    }

    /** Para respuestas como `{ "ok": true }`. */
    suspend fun send(method: String, path: String, body: JsonObject? = null, timeoutSeconds: Long = 20) {
        raw(method, path, body = body, timeoutSeconds = timeoutSeconds)
    }

    /** GET /programs/:id: el programa, su negocio y sus números vienen en el mismo objeto. */
    suspend fun programDetail(id: String): ProgramDetail {
        val text = raw("GET", "/programs/$id")
        return try {
            val program = json.decodeFromString<Program>(text)
            val extras = json.decodeFromString<ProgramExtras>(text)
            ProgramDetail(program, extras.business, extras.stats)
        } catch (e: IllegalArgumentException) {
            throw ApiError("El servidor respondió algo inesperado. Intenta de nuevo.", 200)
        }
    }
}

/** `jsonOf("name" to "Ana", "count" to 2)`: el cuerpo de una petición. Los null no se mandan. */
fun jsonOf(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject(
    pairs.mapNotNull { (key, value) ->
        val element: JsonElement = when (value) {
            null -> return@mapNotNull null
            is String -> JsonPrimitive(value)
            is Number -> JsonPrimitive(value)
            is Boolean -> JsonPrimitive(value)
            is JsonElement -> value
            else -> JsonPrimitive(value.toString())
        }
        key to element
    }.toMap(),
)

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { runCatching { cancel() } }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            if (cont.isActive) cont.resume(response) else response.close()
        }
    })
}
