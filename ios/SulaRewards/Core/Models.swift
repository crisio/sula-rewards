import Foundation

// Lo que manda la API (api/src). Las llaves llegan en snake_case y el decodificador las pasa a camelCase.

struct User: Codable, Equatable {
    let id: String
    let email: String
    let fullName: String?
    /// Su celular como cliente (+504XXXXXXXX): con él se une a programas desde la app.
    let phone: String?
}

struct Business: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    let slug: String
    var category: String?
    let city: String
    /// Cuántos programas tiene (solo en GET /businesses).
    var programs: Int?
    /// El logo que subió el negocio (URL con versión), o nil.
    var logoUrl: String?

    var logoURL: URL? { logoUrl.flatMap(URL.init(string:)) }
}

enum ProgramType: String, Codable, CaseIterable, Identifiable {
    case sellos, puntos, cashback, giftcard

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sellos: "Sellos"
        case .puntos: "Puntos"
        case .cashback: "Cashback"
        case .giftcard: "Gift card"
        }
    }

    var hint: String {
        switch self {
        case .sellos: "Un sello por visita o por compra"
        case .puntos: "Puntos según lo que gastan"
        case .cashback: "Un % de vuelta en saldo"
        case .giftcard: "Saldo de regalo para cobrar"
        }
    }

    var defaultName: String {
        switch self {
        case .sellos: "Tarjeta de sellos"
        case .puntos: "Puntos"
        case .cashback: "Cashback"
        case .giftcard: "Gift card"
        }
    }

    /// Los mismos de api/src/rules.ts.
    var defaultColor: String {
        switch self {
        case .sellos: "#4f3fe0"
        case .puntos: "#f2820f"
        case .cashback: "#16a34a"
        case .giftcard: "#2e2b38"
        }
    }

    var symbol: String {
        switch self {
        case .sellos: "cup.and.saucer.fill"
        case .puntos: "star.fill"
        case .cashback: "banknote.fill"
        case .giftcard: "gift.fill"
        }
    }
}

/// Lo que define cada programa. Cada tipo usa sus campos (ver api/src/rules.ts).
protocol ProgramRules {
    var type: ProgramType { get }
    var reward: String? { get }
    var stampsGoal: Int? { get }
    var pointsPer100: Int? { get }
    var rewardPoints: Int? { get }
    var cashbackBp: Int? { get }
}

extension ProgramRules {
    /// «8 sellos = Café gratis», «10 puntos por cada L 100 · 200 puntos = Postre»…
    var rules: String {
        switch type {
        case .sellos: "\(stampsGoal ?? 0) sellos = \(reward ?? "")"
        case .puntos: "\(pointsPer100 ?? 0) puntos por cada L 100 · \(Fmt.number(rewardPoints ?? 0)) puntos = \(reward ?? "")"
        case .cashback: "\(Fmt.percent(bp: cashbackBp ?? 0))% de cada compra regresa como saldo"
        case .giftcard: "Saldo de regalo que se cobra en caja"
        }
    }

    func pointsFor(cents: Int) -> Int { cents * (pointsPer100 ?? 0) / 10_000 }
    func cashbackFor(cents: Int) -> Int { cents * (cashbackBp ?? 0) / 10_000 }
}

struct Program: Decodable, Identifiable, Hashable, ProgramRules {
    let id: String
    let businessId: String
    let type: ProgramType
    let name: String
    let color: String
    let reward: String?
    let stampsGoal: Int?
    let pointsPer100: Int?
    let rewardPoints: Int?
    let cashbackBp: Int?
    var active: Int
    /// Cuántos clientes tiene (solo en la lista del negocio).
    var cards: Int?

    var isActive: Bool { active != 0 }
}

/// GET /programs/:id: el programa con su negocio y sus números.
struct ProgramDetail: Decodable {
    var program: Program
    let business: Business
    let stats: Stats

    struct Stats: Decodable {
        let cards: Int
        let rewardsPending: Int
        let balanceCents: Int
    }

    private enum CodingKeys: String, CodingKey {
        case business, stats
    }

    init(from decoder: Decoder) throws {
        program = try Program(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        business = try container.decode(Business.self, forKey: .business)
        stats = try container.decode(Stats.self, forKey: .stats)
    }
}

/// Lo grande de la tarjeta, como en el Wallet: «SELLOS 7/8», «PUNTOS 1,250».
struct Headline: Decodable, Hashable {
    let label: String
    let value: String
}

/// El programa como viaja dentro de la tarjeta (y en la página pública del negocio).
struct CardProgram: Decodable, Identifiable, ProgramRules {
    let id: String
    let type: ProgramType
    let name: String
    let color: String
    let reward: String?
    let stampsGoal: Int?
    let pointsPer100: Int?
    let rewardPoints: Int?
    let cashbackBp: Int?
}

struct CardBusiness: Decodable {
    let name: String
    let slug: String
    let city: String
    let category: String?
    let logoUrl: String?

    var logoURL: URL? { logoUrl.flatMap(URL.init(string:)) }
}

enum MovementKind: String, Decodable {
    case alta, sello, compra, canje, uso, recarga
}

struct Movement: Decodable, Identifiable {
    let id: String
    let kind: MovementKind
    let stamps: Int
    let rewards: Int
    let points: Int
    let cents: Int
    let purchaseCents: Int?
    let createdAt: String
}

/// Lo que cambió con el último movimiento (POST /cards/:id/actions).
struct ActionResult: Decodable {
    let kind: MovementKind
    let stamps: Int
    let rewards: Int
    let points: Int
    let cents: Int
}

/// La tarjeta vista desde caja (GET /cards/:id): con celular, correo e historial.
struct StaffCard: Decodable {
    let id: String
    let code: String
    let customerName: String
    let stamps: Int
    let rewards: Int
    let points: Int
    let balanceCents: Int
    let headline: Headline
    let status: String
    let program: CardProgram
    let business: CardBusiness
    let phone: String
    let email: String?
    var movements: [Movement]?
    let result: ActionResult?
}

/// Un cliente en la lista del programa (GET /programs/:id/cards).
struct CardRow: Decodable, Identifiable {
    let id: String
    let code: String
    let customerName: String
    let phone: String
    let headline: Headline
    let rewards: Int
}

/// POST /programs/:id/cards
struct CreatedCard: Decodable {
    let id: String
}

extension Movement {
    /// «+1 sello», «Compra de L 250.00 · +25 puntos»…
    var summary: String {
        switch kind {
        case .alta:
            return cents > 0 ? "Tarjeta creada con \(Fmt.lempiras(cents))" : "Tarjeta creada"
        case .sello:
            let prize = rewards > 0 ? " · ¡\(rewards == 1 ? "premio" : "\(rewards) premios")!" : ""
            return "+\(stamps) \(stamps == 1 ? "sello" : "sellos")\(prize)"
        case .compra:
            let earned = points > 0 ? "+\(Fmt.number(points)) puntos" : "+\(Fmt.lempiras(cents))"
            return "Compra de \(Fmt.lempiras(purchaseCents ?? 0)) · \(earned)"
        case .canje:
            return points != 0 ? "Canjeó premio (−\(Fmt.number(-points)) puntos)" : "Canjeó premio"
        case .uso:
            return "Usó \(Fmt.lempiras(-cents))"
        case .recarga:
            return "Recarga de \(Fmt.lempiras(cents))"
        }
    }
}

// MARK: - El cliente

/// Si la tarjeta se puede guardar en Apple Wallet o en el Wallet de Android (según lo que tenga configurado la API).
struct WalletAvailability: Decodable {
    let apple: Bool
    let google: Bool
}

/// Una tarjeta en la cuenta del cliente (GET /wallet, /wallet/cards/:id). Sin celular ni correo.
struct CustomerCard: Decodable, Identifiable {
    let id: String
    let code: String
    let customerName: String
    let stamps: Int
    let rewards: Int
    let points: Int
    let balanceCents: Int
    let headline: Headline
    let status: String
    let program: CardProgram
    let business: CardBusiness
    let wallet: WalletAvailability
    var movements: [Movement]?
}

/// Promoción de un negocio, como la ve el cliente.
struct BusinessPromotion: Decodable, Identifiable {
    let id: String
    let title: String
    let body: String?
    let endsOn: String?
    let createdAt: String
}

/// Un negocio en «Explorar» (GET /public/businesses y dentro de cada promoción).
struct DirectoryBusiness: Decodable, Identifiable, Hashable {
    let name: String
    let slug: String
    let category: String?
    let city: String
    let logoUrl: String?
    let programs: Int?

    var id: String { slug }
    var logoURL: URL? { logoUrl.flatMap(URL.init(string:)) }
}

/// GET /public/promotions
struct FeedPromotion: Decodable, Identifiable {
    let id: String
    let title: String
    let body: String?
    let endsOn: String?
    let createdAt: String
    let business: DirectoryBusiness
}

/// GET /public/b/:slug: el negocio con sus programas abiertos y sus promociones vigentes.
struct PublicBusiness: Decodable {
    let name: String
    let slug: String
    let city: String
    let category: String?
    let logoUrl: String?
    let programs: [CardProgram]
    let promotions: [BusinessPromotion]

    var logoURL: URL? { logoUrl.flatMap(URL.init(string:)) }
}

/// Una promoción vista por su dueño (GET /businesses/:id/promotions).
struct Promotion: Decodable, Identifiable {
    let id: String
    let businessId: String
    let title: String
    let body: String?
    let endsOn: String?
    var active: Int
    let createdAt: String

    var isActive: Bool { active != 0 }
    var isExpired: Bool { endsOn.map { $0 < Fmt.today() } ?? false }
}

/// Qué formas de entrar están listas (GET /auth/config).
struct AuthConfig: Decodable {
    let apple: Bool
    let googleIosClientId: String?
}

/// POST /auth/verify, /auth/apple, /auth/google
struct SignedIn: Decodable {
    let token: String
    let user: User
}
