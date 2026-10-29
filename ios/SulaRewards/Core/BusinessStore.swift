import Foundation

/// Los negocios de la cuenta y el que está abierto en caja (se recuerda en este teléfono, como en el panel web).
@Observable
final class BusinessStore {
    static let shared = BusinessStore()

    static let maxBusinesses = 5

    private(set) var businesses: [Business]?
    private(set) var currentId: String?
    private(set) var error: String?

    private static let listKey = "sula.businesses"
    private static let currentKey = "sula.business"
    private let api = APIClient.shared

    init() {
        currentId = UserDefaults.standard.string(forKey: Self.currentKey)
        if let data = UserDefaults.standard.data(forKey: Self.listKey) {
            businesses = try? APIClient.decoder.decode([Business].self, from: data)
        }
    }

    var current: Business? { businesses?.first { $0.id == currentId } ?? businesses?.first }

    func refresh() async {
        do {
            let list: [Business] = try await api.request("GET", "/businesses")
            setList(list)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    func choose(_ id: String) {
        currentId = id
        UserDefaults.standard.set(id, forKey: Self.currentKey)
    }

    func added(_ business: Business) {
        setList((businesses ?? []) + [business])
        choose(business.id)
    }

    func updated(_ business: Business) {
        setList((businesses ?? []).map { $0.id == business.id ? business : $0 })
    }

    func clear() {
        businesses = nil
        currentId = nil
        error = nil
        UserDefaults.standard.removeObject(forKey: Self.listKey)
        UserDefaults.standard.removeObject(forKey: Self.currentKey)
    }

    private func setList(_ list: [Business]) {
        businesses = list
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        UserDefaults.standard.set(try? encoder.encode(list), forKey: Self.listKey)
    }
}
