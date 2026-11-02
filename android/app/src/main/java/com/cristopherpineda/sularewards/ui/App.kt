package com.cristopherpineda.sularewards.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.cristopherpineda.sularewards.core.BusinessStore
import com.cristopherpineda.sularewards.core.Nav
import com.cristopherpineda.sularewards.core.Screen
import com.cristopherpineda.sularewards.core.Session
import com.cristopherpineda.sularewards.core.Tab
import com.cristopherpineda.sularewards.core.WalletStore
import com.cristopherpineda.sularewards.ui.business.BusinessTab
import com.cristopherpineda.sularewards.ui.business.CreateBusinessScreen
import com.cristopherpineda.sularewards.ui.business.EditBusinessScreen
import com.cristopherpineda.sularewards.ui.business.NewCustomerScreen
import com.cristopherpineda.sularewards.ui.business.NewProgramScreen
import com.cristopherpineda.sularewards.ui.business.NewPromotionScreen
import com.cristopherpineda.sularewards.ui.business.ProgramScreen
import com.cristopherpineda.sularewards.ui.business.PromotionsScreen
import com.cristopherpineda.sularewards.ui.business.StaffCardScreen
import com.cristopherpineda.sularewards.ui.customer.AddCardScreen
import com.cristopherpineda.sularewards.ui.customer.BusinessPublicScreen
import com.cristopherpineda.sularewards.ui.customer.CustomerCardScreen
import com.cristopherpineda.sularewards.ui.customer.ExploreScreen
import com.cristopherpineda.sularewards.ui.customer.ProfileDetailsScreen
import com.cristopherpineda.sularewards.ui.customer.ReportPromotionScreen
import com.cristopherpineda.sularewards.ui.customer.WalletScreen
import com.cristopherpineda.sularewards.ui.login.LoginScreen
import com.cristopherpineda.sularewards.ui.profile.ProfileScreen
import kotlinx.coroutines.launch

/** Entrar → la app: Tarjetas y Explorar para todos; Mi negocio para quien tiene (o registra) un negocio. */
@Composable
fun App() {
    val user = Session.user
    val scope = rememberCoroutineScope()

    LaunchedEffect(user?.id) {
        if (user == null) return@LaunchedEffect
        launch { BusinessStore.refresh() }
        launch { WalletStore.refresh() }
        Session.refresh()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (Session.user != null) scope.launch { Session.refresh() }
    }

    if (user == null) LoginScreen() else MainTabs()
}

private data class TabItem(val tab: Tab, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem(Tab.WALLET, "Tarjetas", Icons.Outlined.AccountBalanceWallet),
    TabItem(Tab.EXPLORE, "Explorar", Icons.Outlined.Explore),
    TabItem(Tab.BUSINESS, "Mi negocio", Icons.Outlined.Storefront),
    TabItem(Tab.PROFILE, "Perfil", Icons.Outlined.AccountCircle),
)

@Composable
private fun MainTabs() {
    val c = Sula.colors
    val holder = rememberSaveableStateHolder()

    // Al cambiar de negocio, la caja vuelve al inicio.
    val businessId = BusinessStore.current?.id
    LaunchedEffect(businessId) { Nav.businessChanged(businessId) }

    Scaffold(
        containerColor = c.bg,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            NavigationBar(containerColor = c.surface) {
                tabs.forEach { item ->
                    NavigationBarItem(
                        selected = Nav.tab == item.tab,
                        onClick = { Nav.select(item.tab) },
                        icon = { Icon(item.icon, contentDescription = null) },
                        label = { Text(item.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = c.accent,
                            selectedTextColor = c.accent,
                            indicatorColor = c.accent.copy(alpha = 0.14f),
                            unselectedIconColor = c.muted,
                            unselectedTextColor = c.muted,
                        ),
                    )
                }
            }
        },
    ) { inner ->
        Box(Modifier.fillMaxSize().padding(inner).consumeWindowInsets(inner)) {
            val tab = Nav.tab
            val stack = Nav.stack(tab)
            BackHandler(enabled = stack.isNotEmpty()) { Nav.pop() }

            AnimatedContent(
                targetState = Triple(tab, stack.size, stack.lastOrNull()),
                transitionSpec = {
                    when {
                        initialState.first != targetState.first -> fadeIn() togetherWith fadeOut()
                        targetState.second > initialState.second ->
                            (slideInHorizontally { it / 3 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 6 } + fadeOut())
                        else -> (slideInHorizontally { -it / 6 } + fadeIn()) togetherWith (slideOutHorizontally { it / 3 } + fadeOut())
                    }
                },
                label = "pantallas",
            ) { (shownTab, depth, screen) ->
                holder.SaveableStateProvider("${shownTab.name}-$depth-${screen?.javaClass?.simpleName}") {
                    if (screen == null) TabRoot(shownTab) else Destination(screen)
                }
            }
        }
    }
}

@Composable
private fun TabRoot(tab: Tab) {
    when (tab) {
        Tab.WALLET -> WalletScreen()
        Tab.EXPLORE -> ExploreScreen()
        Tab.BUSINESS -> BusinessTab()
        Tab.PROFILE -> ProfileScreen()
    }
}

@Composable
private fun Destination(screen: Screen) {
    when (screen) {
        Screen.AddCard -> AddCardScreen()
        is Screen.CustomerCard -> CustomerCardScreen(screen.id)
        is Screen.BusinessPage -> BusinessPublicScreen(screen.slug)
        is Screen.ReportPromotion -> ReportPromotionScreen(screen.promotion)
        is Screen.ProfileDetails -> ProfileDetailsScreen(screen.joinSlug, screen.joinProgramId)
        is Screen.Program -> ProgramScreen(screen.id)
        is Screen.StaffCard -> StaffCardScreen(screen.id, screen.isNew)
        Screen.NewProgram -> NewProgramScreen()
        is Screen.NewCustomer -> NewCustomerScreen(screen.program)
        Screen.CreateBusiness -> CreateBusinessScreen()
        is Screen.EditBusiness -> EditBusinessScreen(screen.business)
        is Screen.Promotions -> PromotionsScreen(screen.business)
        is Screen.NewPromotion -> NewPromotionScreen(screen.business)
    }
}
