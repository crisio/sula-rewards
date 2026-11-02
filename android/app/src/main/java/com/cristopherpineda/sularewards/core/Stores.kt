package com.cristopherpineda.sularewards.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/** Quién está usando la app. El token va cifrado en el teléfono; el usuario se guarda para abrir al instante. */
object Session {
    private const val USER_KEY = "sula.user"

    var user by mutableStateOf<User?>(null)
        private set

    fun init() {
        val token = TokenStore.read()
        Api.token = token
        if (token != null) {
            user = Storage.string(USER_KEY)?.let { runCatching { Api.json.decodeFromString<User>(it) }.getOrNull() }
        }
        Api.onUnauthorized = { forgetLocal() }
    }

    fun saveUser(next: User?) {
        user = next
        Storage.set(USER_KEY, next?.let { Api.json.encodeToString(it) })
    }

    fun signIn(result: SignedIn) {
        TokenStore.save(result.token)
        Api.token = result.token
        saveUser(result.user)
    }

    /** Refresca el usuario en segundo plano (un 401 cierra la sesión). */
    suspend fun refresh() {
        if (Api.token == null) return
        try {
            saveUser(Api.request<User>("GET", "/me"))
        } catch (e: CancellationException) {
            throw e
        } catch (ignored: Exception) {
        }
    }

    /** Cambia el nombre o el celular (PATCH /me). */
    suspend fun update(fullName: String, phone: String): User {
        val updated = Api.request<User>("PATCH", "/me", body = jsonOf("full_name" to fullName, "phone" to phone))
        saveUser(updated)
        return updated
    }

    suspend fun signOut() {
        runCatching { Api.send("POST", "/auth/logout") }
        forgetLocal()
    }

    /**
     * Borra la cuenta en el servidor (negocios, programas, tarjetas de sus clientes y movimientos; sus tarjetas como
     * cliente siguen en cada negocio) y lo que quedó en el teléfono.
     */
    suspend fun deleteAccount() {
        Api.send("DELETE", "/me", timeoutSeconds = 60)
        forgetLocal()
    }

    // En un teléfono compartido no deben quedar datos de otro negocio.
    private fun forgetLocal() {
        BusinessStore.clear()
        WalletStore.clear()
        Nav.reset()
        TokenStore.delete()
        Api.token = null
        saveUser(null)
    }
}

/** Las tarjetas del cliente en todos los negocios (GET /wallet). */
object WalletStore {
    var cards by mutableStateOf<List<CustomerCard>?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    suspend fun refresh() {
        try {
            cards = Api.request<List<CustomerCard>>("GET", "/wallet")
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }

    /** Agrega la tarjeta con su código (escrito, del QR o un enlace /tarjeta/<código>). */
    suspend fun add(code: String): CustomerCard {
        val card = Api.request<CustomerCard>("POST", "/wallet/cards", body = jsonOf("code" to code))
        upsert(card)
        return card
    }

    /** Se une a un programa con el nombre y el celular de su perfil. */
    suspend fun join(slug: String, programId: String): CustomerCard {
        val card = Api.request<CustomerCard>("POST", "/wallet/join", body = jsonOf("slug" to slug, "program_id" to programId))
        upsert(card)
        return card
    }

    /** La quita de la app (sigue existiendo en el negocio). */
    suspend fun remove(id: String) {
        Api.send("DELETE", "/wallet/cards/$id")
        cards = cards?.filterNot { it.id == id }
    }

    fun upsert(card: CustomerCard) {
        cards = listOf(card) + (cards ?: emptyList()).filterNot { it.id == card.id }
    }

    fun card(id: String): CustomerCard? = cards?.firstOrNull { it.id == id }

    fun cardInProgram(programId: String): CustomerCard? = cards?.firstOrNull { it.program.id == programId }

    fun clear() {
        cards = null
        error = null
    }
}

/** Los negocios de la cuenta y el que está abierto en caja (se recuerda en este teléfono, como en el panel web). */
object BusinessStore {
    const val MAX_BUSINESSES = 5
    private const val LIST_KEY = "sula.businesses"
    private const val CURRENT_KEY = "sula.business"

    var businesses by mutableStateOf<List<Business>?>(null)
        private set
    var currentId by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun init() {
        currentId = Storage.string(CURRENT_KEY)
        businesses = Storage.string(LIST_KEY)?.let { runCatching { Api.json.decodeFromString<List<Business>>(it) }.getOrNull() }
    }

    val current: Business? get() = businesses?.firstOrNull { it.id == currentId } ?: businesses?.firstOrNull()

    suspend fun refresh() {
        try {
            setList(Api.request<List<Business>>("GET", "/businesses"))
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        }
    }

    fun choose(id: String) {
        currentId = id
        Storage.set(CURRENT_KEY, id)
    }

    fun added(business: Business) {
        setList((businesses ?: emptyList()) + business)
        choose(business.id)
    }

    fun updated(business: Business) {
        setList((businesses ?: emptyList()).map { if (it.id == business.id) business else it })
    }

    fun clear() {
        businesses = null
        currentId = null
        error = null
        Storage.set(LIST_KEY, null)
        Storage.set(CURRENT_KEY, null)
    }

    private fun setList(list: List<Business>) {
        businesses = list
        Storage.set(LIST_KEY, Api.json.encodeToString(list))
    }
}

/** Los negocios que la persona ocultó (sus promociones ya no le salen). Se guarda en el teléfono. */
object HiddenBusinesses {
    private const val KEY = "sula.hidden"

    var slugs by mutableStateOf<Set<String>>(emptySet())
        private set

    fun init() {
        slugs = Storage.stringSet(KEY)
    }

    fun hide(slug: String) {
        slugs = slugs + slug
        Storage.setStringSet(KEY, slugs)
    }

    fun show(slug: String) {
        slugs = slugs - slug
        Storage.setStringSet(KEY, slugs)
    }
}
