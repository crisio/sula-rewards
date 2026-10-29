import Foundation

/// El código de la tarjeta: 12 caracteres en base32 de Crockford (api/src/crypto.ts). Es lo que trae el QR y se muestra como
/// K7M2-Q9XD-3F8A para dictarlo o escribirlo en caja.
enum CardCode {
    private static let alphabet = Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    /// Lo mismo que normalizeCardId en la API: minúsculas, guiones y espacios, O por 0, I y L por 1.
    static func normalize(_ text: String) -> String {
        text.uppercased()
            .filter { !$0.isWhitespace && $0 != "-" }
            .replacingOccurrences(of: "O", with: "0")
            .replacingOccurrences(of: "I", with: "1")
            .replacingOccurrences(of: "L", with: "1")
    }

    /// El id si lo escrito es un código válido.
    static func id(from text: String) -> String? {
        let id = normalize(text)
        return id.count == 12 && id.allSatisfy { alphabet.contains($0) } ? id : nil
    }

    /// K7M2Q9XD3F8A → «K7M2-Q9XD-3F8A»
    static func format(_ id: String) -> String {
        stride(from: 0, to: id.count, by: 4).map { start in
            let from = id.index(id.startIndex, offsetBy: start)
            let to = id.index(from, offsetBy: 4, limitedBy: id.endIndex) ?? id.endIndex
            return String(id[from..<to])
        }
        .joined(separator: "-")
    }

    enum Scan: Equatable {
        case card(String)
        /// El QR del cartel del mostrador (/unete/<negocio>): trae el enlace del negocio, no una tarjeta.
        case joinPoster(String)
        case unknown
    }

    /// Lo que leyó la cámara: el id de 12 caracteres (Apple Wallet, Google Wallet y la web) o un enlace con /tarjeta/<id>.
    static func read(_ payload: String) -> Scan {
        let text = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = text.range(of: "/tarjeta/") {
            let rest = text[range.upperBound...].prefix { $0 != "/" && $0 != "?" && $0 != "#" }
            return id(from: String(rest)).map(Scan.card) ?? .unknown
        }
        if let range = text.range(of: "/unete/") {
            let slug = text[range.upperBound...].prefix { $0 != "/" && $0 != "?" && $0 != "#" }
            return slug.isEmpty ? .unknown : .joinPoster(String(slug))
        }
        return id(from: text).map(Scan.card) ?? .unknown
    }
}
