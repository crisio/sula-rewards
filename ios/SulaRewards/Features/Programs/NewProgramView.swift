import SwiftUI

/// Crear un programa: sellos, puntos, cashback o gift card, con el color de la marca (src/pages/NewProgram.tsx).
struct NewProgramView: View {
    @Environment(BusinessStore.self) private var store
    @Environment(Router.self) private var router
    @State private var type = ProgramType.sellos
    @State private var name = ""
    @State private var color: String?
    @State private var stampsGoal = 8
    @State private var reward = ""
    @State private var pointsPer100 = "10"
    @State private var rewardPoints = "100"
    @State private var cashbackPercent = "5"
    @State private var busy = false
    @State private var error: String?

    private var cardColor: String { color ?? type.defaultColor }
    private var points: Int? { Int(pointsPer100) }
    private var cost: Int? { Int(rewardPoints.filter { $0 != "," }) }
    /// «2.5» % → 250 puntos básicos.
    private var cashbackBp: Int? {
        Double(cashbackPercent.replacingOccurrences(of: ",", with: ".")).map { Int(($0 * 100).rounded()) }
    }

    private var preview: Headline {
        switch type {
        case .sellos: Headline(label: "SELLOS", value: "3/\(stampsGoal)")
        case .puntos: Headline(label: "PUNTOS", value: "250")
        case .cashback: Headline(label: "CASHBACK \(cashbackPercent.isEmpty ? "0" : cashbackPercent)%", value: Fmt.lempiras(1240))
        case .giftcard: Headline(label: "GIFT CARD", value: Fmt.lempiras(50000))
        }
    }

    private var canSubmit: Bool {
        switch type {
        case .sellos: !reward.trimmingCharacters(in: .whitespaces).isEmpty
        case .puntos: !reward.trimmingCharacters(in: .whitespaces).isEmpty && (points ?? 0) >= 1 && (cost ?? 0) >= 1
        case .cashback: (10...5000).contains(cashbackBp ?? 0)
        case .giftcard: true
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                typePicker

                WalletCardView(
                    type: type,
                    color: cardColor,
                    businessName: store.current?.name ?? "Tu negocio",
                    headline: preview,
                    customerName: "Gabriela Mejía",
                    reward: type == .sellos || type == .puntos ? (reward.isEmpty ? "Tu premio" : reward) : nil,
                    stamps: 3,
                    stampsGoal: stampsGoal
                )
                .animation(.default, value: type)

                VStack(alignment: .leading, spacing: 10) {
                    FieldLabel("Nombre del programa")
                    TextField(type.defaultName, text: $name).inputStyle()
                    fields
                    FieldLabel("Color de la tarjeta").padding(.top, 6)
                    swatches
                }
                .card()

                if let error { Notice(text: error) }
                Button {
                    Task { await create() }
                } label: {
                    BusyLabel(title: "Crear programa", busy: busy)
                }
                .buttonStyle(PrimaryButtonStyle(big: true))
                .disabled(busy || !canSubmit || store.current == nil)
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("Nuevo programa")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var typePicker: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(ProgramType.allCases) { option in
                Button {
                    type = option
                    color = nil
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Image(systemName: option.symbol)
                            .font(.title3)
                            .foregroundStyle(Color(hexString: option.defaultColor))
                        Text(option.label).font(.headline).foregroundStyle(Theme.ink)
                        Text(option.hint)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                    .padding(14)
                    .background(Theme.surface, in: .rect(cornerRadius: 16))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(type == option ? Theme.ink : Theme.line, lineWidth: type == option ? 2.5 : 1)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(type == option ? .isSelected : [])
            }
        }
    }

    @ViewBuilder private var fields: some View {
        switch type {
        case .sellos:
            Stepper(value: $stampsGoal, in: 2...20) {
                FieldLabel("Sellos para el premio: \(stampsGoal)")
            }
            .padding(.top, 6)
            FieldLabel("Premio")
            TextField("Café gratis", text: $reward).inputStyle()
        case .puntos:
            FieldLabel("Puntos por cada L 100 de compra").padding(.top, 6)
            TextField("10", text: $pointsPer100).keyboardType(.numberPad).inputStyle()
            FieldLabel("Puntos para el premio")
            TextField("100", text: $rewardPoints).keyboardType(.numberPad).inputStyle()
            FieldLabel("Premio")
            TextField("Baleada sencilla gratis", text: $reward).inputStyle()
            if let points, let cost, points > 0, cost > 0 {
                FinePrint("Tu cliente gana el premio al gastar unos \(Fmt.lempiras((cost + points - 1) / points * 10_000)).")
            }
        case .cashback:
            FieldLabel("Porcentaje de cashback").padding(.top, 6)
            HStack {
                TextField("5", text: $cashbackPercent).keyboardType(.decimalPad)
                Text("%").font(.headline).foregroundStyle(Theme.muted)
            }
            .inputStyle()
            FinePrint("En una compra de L 500 le regresan \(Fmt.lempiras(50_000 * (cashbackBp ?? 0) / 10_000)). Entre 0.1 % y 50 %.")
        case .giftcard:
            FinePrint("Las gift cards se venden en caja con el saldo que pagó el cliente, y se cobran escaneando su QR.")
                .padding(.top, 4)
        }
    }

    private var swatches: some View {
        HStack(spacing: 10) {
            ForEach(Theme.swatches, id: \.self) { swatch in
                Button {
                    color = swatch
                } label: {
                    Circle()
                        .fill(Color(hexString: swatch))
                        .frame(width: 32, height: 32)
                        .overlay {
                            if cardColor == swatch {
                                Circle().strokeBorder(Theme.bg, lineWidth: 3)
                                Image(systemName: "checkmark").font(.caption.weight(.heavy)).foregroundStyle(.white)
                            }
                        }
                        .padding(3)
                        .overlay { Circle().strokeBorder(cardColor == swatch ? Theme.ink : .clear, lineWidth: 2) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Color \(swatch)")
                .accessibilityAddTraits(cardColor == swatch ? .isSelected : [])
            }
        }
    }

    private func create() async {
        guard let business = store.current else { return }
        busy = true
        error = nil
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        var json: [String: Any] = ["type": type.rawValue, "name": trimmedName.isEmpty ? type.defaultName : trimmedName, "color": cardColor]
        switch type {
        case .sellos:
            json["stamps_goal"] = stampsGoal
            json["reward"] = reward
        case .puntos:
            json["points_per_100"] = points ?? 0
            json["reward_points"] = cost ?? 0
            json["reward"] = reward
        case .cashback:
            json["cashback_bp"] = cashbackBp ?? 0
        case .giftcard:
            break
        }
        do {
            let program: Program = try await APIClient.shared.request("POST", "/businesses/\(business.id)/programs", json: json)
            Haptics.success()
            // Esta pantalla se cambia por la del programa nuevo.
            if !router.path.isEmpty { router.path.removeLast() }
            router.path.append(.program(program.id))
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        busy = false
    }
}
