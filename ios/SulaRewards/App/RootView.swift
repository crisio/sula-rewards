import SwiftUI

/// Entrar → la app: tarjetas y Explorar para todos; Mi negocio para quien tiene (o registra) un negocio.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(BusinessStore.self) private var store
    @Environment(WalletStore.self) private var wallet
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if session.user == nil {
                LoginView()
            } else {
                MainTabs()
            }
        }
        .task(id: session.user?.id) {
            guard session.user != nil else { return }
            async let businesses: Void = store.refresh()
            async let cards: Void = wallet.refresh()
            _ = await (businesses, cards)
            await session.refresh()
        }
        .onChange(of: scenePhase) {
            guard scenePhase == .active, session.user != nil else { return }
            Task { await session.refresh() }
        }
    }
}

enum MainTab: String {
    case wallet, explore, business, profile
}

struct MainTabs: View {
    @AppStorage("sula.tab") private var tab = MainTab.wallet

    var body: some View {
        TabView(selection: $tab) {
            Tab("Tarjetas", systemImage: "wallet.pass", value: MainTab.wallet) {
                WalletTab(explore: { tab = .explore })
            }
            Tab("Explorar", systemImage: "sparkle.magnifyingglass", value: MainTab.explore) {
                ExploreTab()
            }
            Tab("Mi negocio", systemImage: "storefront", value: MainTab.business) {
                BusinessTab()
            }
            Tab("Perfil", systemImage: "person.crop.circle", value: MainTab.profile) {
                NavigationStack { ProfileView() }
            }
        }
    }
}

/// La caja con su pila: inicio → programa → tarjeta.
struct CashierTab: View {
    @Environment(BusinessStore.self) private var store
    @State private var router = Router()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .program(let id): ProgramView(programId: id)
                    case .card(let id, let isNew): StaffCardView(cardId: id, isNew: isNew)
                    case .newProgram: NewProgramView()
                    }
                }
        }
        .environment(router)
        // Al cambiar de negocio, la caja vuelve al inicio.
        .onChange(of: store.current?.id) { router.path = [] }
    }
}
