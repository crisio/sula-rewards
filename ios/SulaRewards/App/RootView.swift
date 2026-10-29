import SwiftUI

/// Entrar → crear el negocio (la primera vez) → la caja.
struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(BusinessStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if session.user == nil {
                LoginView()
            } else if let businesses = store.businesses {
                if businesses.isEmpty { CreateBusinessView(first: true) } else { MainTabs() }
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("No pudimos abrir tu negocio", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Intentar de nuevo") { Task { await store.refresh() } }
                        .buttonStyle(PrimaryButtonStyle())
                        .frame(maxWidth: 260)
                    Button("Salir") { Task { await session.signOut() } }
                }
                .screenBackground()
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .screenBackground()
            }
        }
        .task(id: session.user?.id) {
            guard session.user != nil else { return }
            await store.refresh()
            await session.refresh()
        }
        .onChange(of: scenePhase) {
            guard scenePhase == .active, session.user != nil else { return }
            Task { await session.refresh() }
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            Tab("Caja", systemImage: "qrcode.viewfinder") {
                CashierTab()
            }
            Tab("Perfil", systemImage: "person.crop.circle") {
                NavigationStack { ProfileView() }
            }
        }
    }
}

/// La pestaña de caja con su pila: inicio → programa → tarjeta.
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
