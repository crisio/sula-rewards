import SwiftUI

@main
struct SulaRewardsApp: App {
    @State private var session = Session.shared
    @State private var store = BusinessStore.shared
    @State private var wallet = WalletStore.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(store)
                .environment(wallet)
                .tint(Theme.accent)
                .environment(\.locale, Fmt.locale)
        }
    }
}
