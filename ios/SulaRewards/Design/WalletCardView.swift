import SwiftUI

/// La tarjeta como se ve en Apple Wallet o Google Wallet (src/components/WalletCard.tsx).
struct WalletCardView: View {
    let type: ProgramType
    let color: String
    let businessName: String
    let headline: Headline
    /// El logo del negocio; sin logo, el ícono del tipo de programa.
    var logoURL: URL?
    var customerName: String?
    var reward: String?
    /// Solo sellos: cuántos lleva y la meta.
    var stamps = 0
    var stampsGoal: Int?

    private var cardColor: Color { Color(hexString: color) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                HStack(spacing: 10) {
                    badge
                    Text(businessName)
                        .font(.headline)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(headline.label).font(.caption2.weight(.bold)).tracking(1.2).opacity(0.85)
                    Text(headline.value)
                        .font(.system(size: 26, weight: .heavy, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                }
            }

            if type == .sellos, let goal = stampsGoal, goal > 0 {
                stampGrid(goal: goal)
            }

            if customerName != nil || reward != nil {
                HStack(alignment: .bottom) {
                    if let customerName {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("CLIENTE").font(.caption2.weight(.bold)).tracking(1.2).opacity(0.85)
                            Text(customerName).font(.callout.weight(.semibold)).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                    if let reward {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("PREMIO").font(.caption2.weight(.bold)).tracking(1.2).opacity(0.85)
                            Text(reward).font(.callout.weight(.semibold)).lineLimit(1)
                        }
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardColor, in: .rect(cornerRadius: 20))
        .shadow(color: cardColor.opacity(0.35), radius: 14, y: 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(businessName): \(headline.label) \(headline.value)")
    }

    @ViewBuilder private var badge: some View {
        let icon = Image(systemName: type.symbol)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(cardColor)
        Group {
            if let logoURL {
                AsyncImage(url: logoURL) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { icon }
                }
            } else {
                icon
            }
        }
        .frame(width: 30, height: 30)
        .background(.white.opacity(0.92))
        .clipShape(.rect(cornerRadius: 9))
    }

    private func stampGrid(goal: Int) -> some View {
        let perRow = goal > 10 ? (goal + 1) / 2 : goal
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: perRow)
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(0..<goal, id: \.self) { i in
                let filled = i < stamps
                Circle()
                    .fill(filled ? Color.white : Color.white.opacity(0.08))
                    .overlay {
                        if filled {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .heavy))
                                .foregroundStyle(cardColor)
                        } else {
                            Circle().strokeBorder(.white.opacity(0.55), style: StrokeStyle(lineWidth: 2, dash: [3, 3]))
                        }
                    }
                    .aspectRatio(1, contentMode: .fit)
            }
        }
        .padding(12)
        .background(.white.opacity(0.1), in: .rect(cornerRadius: 14))
    }
}

/// Cuatro puntos, uno por tipo de programa: sellos, puntos, cashback y gift cards (public/favicon.svg).
struct LogoMark: View {
    var size: CGFloat = 64

    var body: some View {
        let unit = size / 64
        ZStack {
            RoundedRectangle(cornerRadius: 16 * unit).fill(Theme.logoInk)
            dot(Theme.sellos, x: 22, y: 22, unit: unit)
            dot(Theme.puntos, x: 42, y: 22, unit: unit)
            dot(Theme.cashback, x: 22, y: 42, unit: unit)
            dot(Theme.logoLight, x: 42, y: 42, unit: unit)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func dot(_ color: Color, x: CGFloat, y: CGFloat, unit: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: 18 * unit, height: 18 * unit)
            .position(x: x * unit, y: y * unit)
    }
}
