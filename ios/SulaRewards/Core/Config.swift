import Foundation

enum Config {
    /// API de Sula Rewards (Cloudflare Worker), la misma que usa el panel web.
    /// En Debug se puede apuntar a la API local (`cd api && npm run dev`):
    /// `xcrun simctl spawn booted defaults write com.cristopherpineda.sularewards SULA_API_URL http://localhost:8787`
    static let apiURL: URL = {
        #if DEBUG
        if let custom = UserDefaults.standard.string(forKey: "SULA_API_URL"), let url = URL(string: custom) { return url }
        #endif
        return URL(string: "https://sula-rewards-api.cristopheropineda.workers.dev")!
    }()

    /// La web (GitHub Pages): la tarjeta del cliente, la página para unirse y las páginas que pide Apple.
    static let webURL = URL(string: "https://crisio.github.io/sula-rewards/")!
    static let panelURL = webURL.appending(path: "panel")
    static let privacyURL = webURL.appending(path: "privacidad.html")
    static let supportURL = webURL.appending(path: "soporte.html")

    /// Lo que abre el cliente para ver su tarjeta y guardarla en el Wallet.
    static func cardURL(_ id: String) -> URL { webURL.appending(path: "tarjeta/\(id)") }

    /// El QR del mostrador: el cliente se une y saca su tarjeta.
    static func joinURL(_ slug: String) -> URL { webURL.appending(path: "unete/\(slug)") }

    static var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }
}
