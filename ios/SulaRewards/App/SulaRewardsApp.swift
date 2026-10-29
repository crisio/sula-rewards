import SwiftUI

@main
struct SulaRewardsApp: App {
    @State private var session = Session.shared
    @State private var store = BusinessStore.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(store)
                .tint(Theme.accent)
                .environment(\.locale, Fmt.locale)
        }
    }
}
