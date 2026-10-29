import Foundation

/// Las tarjetas del cliente en todos los negocios (GET /wallet).
@Observable
final class WalletStore {
    static let shared = WalletStore()

    private(set) var cards: [CustomerCard]?
    private(set) var error: String?

    private let api = APIClient.shared

    func refresh() async {
        do {
            cards = try await api.request("GET", "/wallet")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Agrega la tarjeta con su código (escrito, del QR o un enlace /tarjeta/<código>).
    func add(code: String) async throws -> CustomerCard {
        let card: CustomerCard = try await api.request("POST", "/wallet/cards", json: ["code": code])
        upsert(card)
        return card
    }

    /// Se une a un programa con el nombre y el celular de su perfil.
    func join(slug: String, programId: String) async throws -> CustomerCard {
        let card: CustomerCard = try await api.request("POST", "/wallet/join", json: ["slug": slug, "program_id": programId])
        upsert(card)
        return card
    }

    /// La quita de la app (sigue existiendo en el negocio).
    func remove(_ id: String) async throws {
        let _: OKResponse = try await api.request("DELETE", "/wallet/cards/\(id)")
        cards?.removeAll { $0.id == id }
    }

    func upsert(_ card: CustomerCard) {
        var list = cards ?? []
        list.removeAll { $0.id == card.id }
        list.insert(card, at: 0)
        cards = list
    }

    func card(inProgram programId: String) -> CustomerCard? {
        cards?.first { $0.program.id == programId }
    }

    func clear() {
        cards = nil
        error = nil
    }
}

/// Las pantallas del cliente: una tarjeta o la página de un negocio. Las usan las pestañas Tarjetas y Explorar.
enum CustomerRoute: Hashable {
    case card(String)
    case business(String)
}
