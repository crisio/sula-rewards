import SwiftUI
import UIKit

/// Los colores de la web (src/styles.css), con su versión para modo oscuro.
enum Theme {
    static let bg = Color(light: 0xF1ECFB, dark: 0x14121B)
    static let surface = Color(light: 0xFFFFFF, dark: 0x1F1C29)
    static let sunken = Color(light: 0xF7F4FD, dark: 0x26222F)
    static let ink = Color(light: 0x1D1B26, dark: 0xF3F0FA)
    static let muted = Color(light: 0x6B6880, dark: 0xA7A2B8)
    static let line = Color(light: 0xE2DCF0, dark: 0x34303F)
    static let accent = Color(light: 0x4F3FE0, dark: 0x9D93FF)
    static let danger = Color(light: 0xC8323C, dark: 0xFF7B83)
    static let success = Color(light: 0x15803D, dark: 0x4ADE80)

    /// Colores del logo: uno por tipo de programa.
    static let sellos = Color(hex: 0x4F3FE0)
    static let puntos = Color(hex: 0xF2820F)
    static let cashback = Color(hex: 0x16A34A)
    static let logoInk = Color(hex: 0x1D1B26)
    static let logoLight = Color(hex: 0xF1ECFB)

    /// Los colores que se pueden elegir para una tarjeta (los mismos del panel web).
    static let swatches = ["#4f3fe0", "#f2820f", "#16a34a", "#2e2b38", "#d92d6b", "#0e7490", "#b45309", "#7c3aed"]

    static let radius: CGFloat = 18
    static let gutter: CGFloat = 16
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(uiColor: UIColor(rgb: hex))
    }

    init(light: UInt32, dark: UInt32) {
        let lightColor = UIColor(rgb: light)
        let darkColor = UIColor(rgb: dark)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? darkColor : lightColor })
    }

    /// «#4f3fe0» (el color de un programa) → Color. Si no se puede leer, el violeta de los sellos.
    init(hexString: String) {
        let clean = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(clean, radix: 16) ?? 0x4F3FE0)
    }
}
