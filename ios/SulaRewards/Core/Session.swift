import Foundation
import Security

/// Quién está usando la app. El token va en el llavero; el usuario se guarda para abrir al instante.
@Observable
final class Session {
    static let shared = Session()

    private(set) var user: User?

    private static let userKey = "sula.user"
    private let api = APIClient.shared

    init() {
        let token = Keychain.read()
        api.token = token
        if token != nil,
           let data = UserDefaults.standard.data(forKey: Self.userKey),
           let cached = try? APIClient.decoder.decode(User.self, from: data) {
            user = cached
        }
        api.onUnauthorized = { [weak self] in self?.forgetLocal() }
    }

    func setUser(_ next: User?) {
        user = next
        if let next {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            UserDefaults.standard.set(try? encoder.encode(next), forKey: Self.userKey)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.userKey)
        }
    }

    func signIn(token: String, user: User) {
        Keychain.save(token)
        api.token = token
        setUser(user)
    }

    /// Refresca el usuario en segundo plano (un 401 cierra la sesión).
    func refresh() async {
        guard api.token != nil else { return }
        if let me: User = try? await api.request("GET", "/me") { setUser(me) }
    }

    func signOut() async {
        let _: OKResponse? = try? await api.request("POST", "/auth/logout")
        forgetLocal()
    }

    /// Borra la cuenta en el servidor (negocios, programas, tarjetas de clientes y movimientos) y lo que quedó en el teléfono.
    func deleteAccount() async throws {
        let _: OKResponse = try await api.request("DELETE", "/me", timeout: 60)
        forgetLocal()
    }

    // En un teléfono compartido no deben quedar datos de otro negocio.
    private func forgetLocal() {
        BusinessStore.shared.clear()
        URLCache.shared.removeAllCachedResponses()
        Keychain.delete()
        api.token = nil
        setUser(nil)
    }
}

/// El token de sesión, en el llavero del teléfono (no se respalda a otros dispositivos).
enum Keychain {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.cristopherpineda.sularewards",
        kSecAttrAccount as String: "session",
    ]

    static func read() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        delete()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
