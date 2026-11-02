package com.cristopherpineda.sularewards.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList

/** Las pestañas de abajo. */
enum class Tab { WALLET, EXPLORE, BUSINESS, PROFILE }

/** Las pantallas que se abren encima del inicio de cada pestaña. */
sealed interface Screen {
    // Cliente (Tarjetas y Explorar)
    data object AddCard : Screen
    data class CustomerCard(val id: String) : Screen
    data class BusinessPage(val slug: String) : Screen
    data class ReportPromotion(val promotion: FeedPromotion) : Screen
    /** Nombre y celular; si viene de «Unirme», al guardar se une al programa. */
    data class ProfileDetails(val joinSlug: String? = null, val joinProgramId: String? = null) : Screen

    // Negocio (Mi negocio y Perfil)
    data class Program(val id: String) : Screen
    data class StaffCard(val id: String, val isNew: Boolean = false) : Screen
    data object NewProgram : Screen
    data class NewCustomer(val program: com.cristopherpineda.sularewards.core.Program) : Screen
    data object CreateBusiness : Screen
    data class EditBusiness(val business: Business) : Screen
    data class Promotions(val business: Business) : Screen
    data class NewPromotion(val business: Business) : Screen
}

/**
 * La navegación de la app: la pestaña abierta y la pila de pantallas de cada una (como los NavigationStack de iOS).
 * Vive fuera de la actividad para que no se pierda al girar el teléfono o cambiar a modo oscuro.
 */
object Nav {
    private const val TAB_KEY = "sula.tab"

    var tab by mutableStateOf(Tab.WALLET)
        private set

    private val stacks: Map<Tab, SnapshotStateList<Screen>> = Tab.entries.associateWith { mutableStateListOf() }

    fun init() {
        tab = Storage.string(TAB_KEY)?.let { saved -> Tab.entries.firstOrNull { it.name == saved } } ?: Tab.WALLET
    }

    fun stack(tab: Tab = this.tab): List<Screen> = stacks.getValue(tab)

    fun select(next: Tab) {
        // Tocar la pestaña abierta regresa a su inicio.
        if (next == tab) stacks.getValue(next).clear()
        tab = next
        Storage.set(TAB_KEY, next.name)
    }

    fun push(screen: Screen) {
        stacks.getValue(tab).add(screen)
    }

    /** Cambia la pantalla de arriba por otra (un formulario por lo que creó). */
    fun replace(screen: Screen) {
        val stack = stacks.getValue(tab)
        if (stack.isNotEmpty()) stack.removeAt(stack.lastIndex)
        stack.add(screen)
    }

    fun pop(): Boolean {
        val stack = stacks.getValue(tab)
        if (stack.isEmpty()) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    /** Al cambiar de negocio, la caja vuelve al inicio. */
    fun resetTab(tab: Tab) = stacks.getValue(tab).clear()

    private var lastBusinessId: String? = null

    /** Al cambiar de negocio en caja, Mi negocio vuelve a su inicio. */
    fun businessChanged(id: String?) {
        if (lastBusinessId != null && id != lastBusinessId) resetTab(Tab.BUSINESS)
        lastBusinessId = id
    }

    fun reset() {
        lastBusinessId = null
        stacks.values.forEach { it.clear() }
    }
}
