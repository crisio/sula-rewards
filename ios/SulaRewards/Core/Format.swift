import Foundation

/// Formatos de Honduras: lempiras (los montos viajan en centavos), celulares de 8 dígitos y hora de Tegucigalpa.
enum Fmt {
    static let locale = Locale(identifier: "es_HN")
    static let timeZone = TimeZone(identifier: "America/Tegucigalpa")!

    // Como en la web: L 1,234.50 y 1,250 (coma para miles, punto para decimales).
    private static let money: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    private static let integer: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()

    /// 123450 → «L 1,234.50»
    static func lempiras(_ cents: Int) -> String {
        "L " + (money.string(from: NSNumber(value: Double(cents) / 100)) ?? "0.00")
    }

    /// 1250 → «1,250»
    static func number(_ n: Int) -> String {
        integer.string(from: NSNumber(value: n)) ?? String(n)
    }

    /// Puntos básicos → porcentaje: 500 → «5», 250 → «2.5».
    static func percent(bp: Int) -> String {
        bp % 100 == 0 ? String(bp / 100) : String(Double(bp) / 100)
    }

    /// Lo que escribe el cajero («1,250.5», «L 80», «12,50») → centavos, o nil si no es un monto.
    static func parseLempiras(_ text: String) -> Int? {
        var s = text.replacingOccurrences(of: "L", with: "", options: .caseInsensitive).filter { !$0.isWhitespace }
        // Teclado con coma decimal: «12,50» (una sola coma con 1 o 2 decimales y sin punto).
        if !s.contains("."), s.filter({ $0 == "," }).count == 1, let comma = s.firstIndex(of: ","), s.distance(from: comma, to: s.endIndex) <= 3 {
            s.replaceSubrange(comma...comma, with: ".")
        }
        s = s.replacingOccurrences(of: ",", with: "")
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), let whole = parts.first, (1...7).contains(whole.count), whole.allSatisfy(isDigit) else { return nil }
        var cents = Int(whole)! * 100
        if parts.count == 2 {
            let fraction = parts[1]
            guard fraction.count <= 2, fraction.allSatisfy(isDigit) else { return nil }
            cents += fraction.isEmpty ? 0 : Int(String(fraction).padding(toLength: 2, withPad: "0", startingAt: 0))!
        }
        return cents > 0 ? cents : nil
    }

    /// «9876-5432», «+504 98765432»… → «98765432» si es un número de Honduras (empieza con 2, 3, 7, 8 o 9).
    static func phoneDigits(_ text: String) -> String? {
        var digits = text.filter(isDigit)
        if digits.count == 11, digits.hasPrefix("504") { digits.removeFirst(3) }
        guard digits.count == 8, let first = digits.first, "23789".contains(first) else { return nil }
        return digits
    }

    /// +50498765432 → «9876-5432»
    static func phone(_ e164: String) -> String {
        let digits = e164.hasPrefix("+504") ? String(e164.dropFirst(4)) : e164
        guard digits.count == 8 else { return e164 }
        return "\(digits.prefix(4))-\(digits.suffix(4))"
    }

    static func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain = ISO8601DateFormatter()

    private static let dateTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = timeZone
        f.setLocalizedDateFormatFromTemplate("d MMM h:mm a")
        return f
    }()

    /// «2026-10-29T17:58:26.123Z» → «29 oct, 11:58 a. m.» (hora de Honduras)
    static func dateTime(_ iso: String) -> String {
        guard let date = isoFractional.date(from: iso) ?? isoPlain.date(from: iso) else { return "" }
        return dateTimeFormatter.string(from: date)
    }

    // Las fechas de las promociones (AAAA-MM-DD) son días de calendario: se leen y se muestran en la misma zona.
    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = timeZone
        f.setLocalizedDateFormatFromTemplate("d MMMM")
        return f
    }()

    /// Hoy en Honduras: «2026-10-29».
    static func today() -> String { isoDay.string(from: Date()) }

    /// «2026-12-31» → «Hasta el 31 de diciembre».
    static func until(_ day: String) -> String {
        guard let date = isoDay.date(from: day) else { return day }
        return "Hasta el \(dayFormatter.string(from: date))"
    }

    /// Un día elegido en el calendario del teléfono → «2026-12-31».
    static func isoDay(from date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    nonisolated private static func isDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }
}
