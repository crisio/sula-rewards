import SwiftUI

// Piezas de la interfaz, como las de la web (src/styles.css): paneles blancos, botones en cápsula y avisos.

extension View {
    /// Panel redondeado sobre el fondo.
    func card(padding: CGFloat = 18) -> some View {
        self
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: .rect(cornerRadius: Theme.radius))
    }

    /// Fondo de pantalla de la app.
    func screenBackground() -> some View {
        self.background(Theme.bg.ignoresSafeArea())
    }

    /// Campo de texto con fondo hundido.
    func inputStyle() -> some View {
        self
            .padding(14)
            .background(Theme.sunken, in: .rect(cornerRadius: 14))
    }
}

/// Botón principal: oscuro sobre fondo claro (claro en modo oscuro), como .btn-primary de la web.
struct PrimaryButtonStyle: ButtonStyle {
    var big = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(big ? .title3.weight(.bold) : .headline)
            .frame(maxWidth: .infinity, minHeight: big ? 64 : 50)
            .padding(.horizontal, 20)
            .foregroundStyle(Theme.bg)
            .background(Theme.ink, in: .capsule)
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.35)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Botón secundario: fondo hundido y texto oscuro.
struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, 16)
            .foregroundStyle(Theme.ink)
            .background(Theme.sunken, in: .capsule)
            .overlay(Capsule().strokeBorder(Theme.line))
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
    }
}

/// Botón con el color del programa (canjear el premio).
struct TintedButtonStyle: ButtonStyle {
    let color: Color
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, 16)
            .foregroundStyle(.white)
            .background(color, in: .capsule)
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
    }
}

/// Texto del botón que cambia por una ruedita mientras espera.
struct BusyLabel: View {
    let title: String
    let busy: Bool

    var body: some View {
        if busy { ProgressView().tint(Theme.bg) } else { Text(title) }
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.title3.weight(.bold))
            .foregroundStyle(Theme.ink)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Etiqueta de un campo de formulario.
struct FieldLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
    }
}

enum Tone {
    case success, danger

    var foreground: Color { self == .success ? Theme.success : Theme.danger }
}

/// Mensaje dentro de un panel («Código incorrecto», «Tarjeta creada…»).
struct Notice: View {
    let text: String
    var tone: Tone = .danger

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: tone == .success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            Text(text).frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(tone.foreground)
        .padding(12)
        .background(tone.foreground.opacity(0.12), in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }
}

/// Texto chico gris.
struct FinePrint: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.footnote).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
    }
}

/// El ícono del tipo de programa en un cuadrito del color del programa.
struct ProgramIcon: View {
    let type: ProgramType
    let color: String
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: type.symbol)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hexString: color), in: .rect(cornerRadius: size * 0.28))
            .accessibilityHidden(true)
    }
}

/// Aviso que aparece abajo unos segundos después de cada movimiento en caja.
struct Toast: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
            .multilineTextAlignment(.center)
            .foregroundStyle(Theme.bg)
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Theme.ink, in: .capsule)
            .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
            .padding(.horizontal, Theme.gutter)
            .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Monto en lempiras con la «L» adelante. Acepta «1,250.50».
struct LempirasField: View {
    let label: String
    @Binding var text: String
    var focus: FocusState<Bool>.Binding? = nil

    var body: some View {
        HStack(spacing: 8) {
            Text("L").font(.title3.weight(.bold)).foregroundStyle(Theme.muted)
            field
                .keyboardType(.decimalPad)
                .font(.title3.weight(.semibold))
        }
        .inputStyle()
    }

    @ViewBuilder private var field: some View {
        if let focus {
            TextField(label, text: $text, prompt: Text("0.00")).focused(focus)
        } else {
            TextField(label, text: $text, prompt: Text("0.00"))
        }
    }
}

/// Enlace a la política de privacidad (se abre en el navegador).
struct PrivacyLink: View {
    var title = "Política de privacidad"

    var body: some View {
        Link(title, destination: Config.privacyURL).font(.footnote.weight(.semibold))
    }
}
