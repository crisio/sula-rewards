import AuthenticationServices
import CryptoKit
import Foundation
import Security
import SwiftUI

/// Entrar con Apple, con Google o con un código por correo. Las tres terminan igual: la API regresa un token de sesión.
enum Auth {
    /// Qué botones mostrar (la API dice si ya hay client ID de Google).
    static func config() async -> AuthConfig? {
        try? await APIClient.shared.request("GET", "/auth/config")
    }

    /// Sign in with Apple: el identity token, el código (para que la API pueda revocar el acceso si se borra la cuenta)
    /// y el nombre, que Apple solo da la primera vez.
    static func apple(_ credential: ASAuthorizationAppleIDCredential) async throws -> SignedIn {
        guard let data = credential.identityToken, let token = String(data: data, encoding: .utf8) else {
            throw APIError(message: "Apple no mandó tu cuenta. Intenta de nuevo.", status: 0)
        }
        var json: [String: Any] = ["identity_token": token]
        if let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) { json["authorization_code"] = code }
        if let name = credential.fullName {
            let formatted = PersonNameComponentsFormatter.localizedString(from: name, style: .default)
            if !formatted.isEmpty { json["full_name"] = formatted }
        }
        return try await APIClient.shared.request("POST", "/auth/apple", json: json)
    }

    /// Google sin SDK: OAuth con PKCE en la hoja de inicio de sesión del sistema; el id_token se manda a la API.
    static func google(clientID: String, session: WebAuthenticationSession) async throws -> SignedIn {
        let suffix = ".apps.googleusercontent.com"
        let scheme = "com.googleusercontent.apps." + clientID.replacingOccurrences(of: suffix, with: "")
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = randomURLSafe(48)
        let challenge = base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = randomURLSafe(16)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        let callback = try await session.authenticate(using: components.url!, callbackURLScheme: scheme)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state, let code = items.first(where: { $0.name == "code" })?.value else {
            throw APIError(message: "No se pudo entrar con Google. Intenta de nuevo.", status: 0)
        }

        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(formEncoded([
            "code": code,
            "client_id": clientID,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        ]).utf8)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.offline
        }
        let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard (response as? HTTPURLResponse)?.statusCode == 200, let idToken = body?["id_token"] as? String else {
            throw APIError(message: "No se pudo entrar con Google. Intenta de nuevo.", status: 0)
        }
        return try await APIClient.shared.request("POST", "/auth/google", json: ["id_token": idToken])
    }

    /// El usuario cerró la hoja de Apple o de Google: no es un error que haya que mostrar.
    static func isCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled || (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
    }

    private static func randomURLSafe(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func formEncoded(_ fields: [String: String]) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return fields.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }.joined(separator: "&")
    }
}
