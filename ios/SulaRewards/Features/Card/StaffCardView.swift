import SwiftUI

/// La tarjeta en caja: sumar sellos, registrar compras, canjear, cobrar o recargar, el historial y mandarla por WhatsApp
/// (src/pages/StaffCardPage.tsx).
struct StaffCardView: View {
    let cardId: String
    var isNew = false

    private enum Action: String {
        case sello, compra, canje, uso, recarga
    }

    private enum AmountField: Hashable {
        case purchase, spend, topUp
    }

    @State private var card: StaffCard?
    @State private var error: String?
    @State private var actionError: String?
    @State private var busy = false
    @State private var toast: String?
    @State private var confirmRedeem = false
    @State private var purchase = ""
    @State private var spend = ""
    @State private var topUp = ""
    @FocusState private var focus: AmountField?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let card {
                    if isNew {
                        Notice(text: "Tarjeta creada. Mándasela por WhatsApp para que la guarde en su Wallet.", tone: .success)
                    }
                    WalletCardView(
                        type: card.program.type,
                        color: card.program.color,
                        businessName: card.business.name,
                        headline: card.headline,
                        logoURL: card.business.logoURL,
                        customerName: card.customerName,
                        reward: card.program.reward,
                        stamps: card.stamps,
                        stampsGoal: card.program.stampsGoal
                    )
                    .animation(.spring(duration: 0.35), value: card.headline)
                    Text(card.status)
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    actions(card)
                    customer(card)
                    history(card)
                } else if let error {
                    ContentUnavailableView("No se pudo abrir la tarjeta", systemImage: "creditcard.trianglebadge.exclamationmark", description: Text(error))
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle(card?.program.name ?? "Tarjeta")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Listo") { focus = nil }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Toast(text: toast)
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: toast)
        .task(id: toast) {
            guard toast != nil else { return }
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { toast = nil }
        }
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog("¿Canjear el premio?", isPresented: $confirmRedeem, titleVisibility: .visible) {
            Button("Canjear: \(card?.program.reward ?? "premio")") { Task { await run(.canje) } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            if let card, card.program.type == .puntos {
                Text("Se descuentan \(Fmt.number(card.program.rewardPoints ?? 0)) puntos de la tarjeta de \(card.customerName).")
            } else {
                Text("Se descuenta un premio de la tarjeta de \(card?.customerName ?? "este cliente").")
            }
        }
    }

    // MARK: - Acciones según el tipo de programa

    @ViewBuilder
    private func actions(_ card: StaffCard) -> some View {
        let p = card.program
        VStack(alignment: .leading, spacing: 14) {
            switch p.type {
            case .sellos:
                Button {
                    Task { await run(.sello) }
                } label: {
                    Label("+1 sello", systemImage: "plus.circle.fill")
                }
                .buttonStyle(PrimaryButtonStyle(big: true))
                HStack(spacing: 10) {
                    ForEach([2, 3], id: \.self) { n in
                        Button("+\(n) sellos") { Task { await run(.sello, ["count": n]) } }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
                if card.rewards > 0 {
                    Button("Canjear premio: \(p.reward ?? "")") { confirmRedeem = true }
                        .buttonStyle(TintedButtonStyle(color: Color(hexString: p.color)))
                }

            case .puntos:
                amountForm(
                    label: "Monto de la compra",
                    text: $purchase,
                    field: .purchase,
                    button: "Sumar puntos",
                    preview: { "= \(Fmt.number(p.pointsFor(cents: $0))) puntos" }
                ) { await run(.compra, ["amount_cents": $0]) }
                Button("Canjear \(p.reward ?? "premio") (\(Fmt.number(p.rewardPoints ?? 0)) puntos)") { confirmRedeem = true }
                    .buttonStyle(TintedButtonStyle(color: Color(hexString: p.color)))
                    .disabled(card.points < (p.rewardPoints ?? 0))

            case .cashback:
                amountForm(
                    label: "Monto de la compra",
                    text: $purchase,
                    field: .purchase,
                    button: "Registrar compra",
                    preview: { "Gana \(Fmt.lempiras(p.cashbackFor(cents: $0))) de cashback" }
                ) { await run(.compra, ["amount_cents": $0]) }
                if card.balanceCents > 0 {
                    Divider()
                    amountForm(
                        label: "Pagar con su saldo (tiene \(Fmt.lempiras(card.balanceCents)))",
                        text: $spend,
                        field: .spend,
                        button: "Usar saldo"
                    ) { await run(.uso, ["amount_cents": $0]) }
                }

            case .giftcard:
                amountForm(
                    label: "Cobrar con la gift card (tiene \(Fmt.lempiras(card.balanceCents)))",
                    text: $spend,
                    field: .spend,
                    button: "Cobrar"
                ) { await run(.uso, ["amount_cents": $0]) }
                Divider()
                amountForm(label: "Recargar saldo", text: $topUp, field: .topUp, button: "Recargar") {
                    await run(.recarga, ["amount_cents": $0])
                }
            }

            if let actionError { Notice(text: actionError) }
        }
        .disabled(busy)
        .card()
    }

    private func amountForm(
        label: String,
        text: Binding<String>,
        field: AmountField,
        button: String,
        preview: ((Int) -> String)? = nil,
        submit: @escaping (Int) async -> Bool
    ) -> some View {
        let cents = Fmt.parseLempiras(text.wrappedValue)
        return VStack(alignment: .leading, spacing: 8) {
            FieldLabel(label)
            HStack(spacing: 8) {
                Text("L").font(.title3.weight(.bold)).foregroundStyle(Theme.muted)
                TextField(label, text: text, prompt: Text("0.00"))
                    .keyboardType(.decimalPad)
                    .font(.title3.weight(.semibold))
                    .focused($focus, equals: field)
            }
            .inputStyle()
            if let cents, let preview {
                Text(preview(cents)).font(.subheadline.weight(.medium)).foregroundStyle(Theme.muted)
            }
            Button {
                guard let cents else { return }
                Task {
                    if await submit(cents) {
                        text.wrappedValue = ""
                        focus = nil
                    }
                }
            } label: {
                BusyLabel(title: button, busy: busy)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(cents == nil)
        }
    }

    // MARK: - Cliente e historial

    private func customer(_ card: StaffCard) -> some View {
        let link = Config.cardURL(card.id)
        let message = "¡Hola \(Fmt.firstName(card.customerName))! Esta es tu tarjeta de \(card.business.name). Guárdala en tu Wallet: \(link.absoluteString)"
        return VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Cliente")
            VStack(alignment: .leading, spacing: 2) {
                Text(card.customerName).font(.headline).foregroundStyle(Theme.ink)
                Text("\(Fmt.phone(card.phone)) · Código \(card.code)").font(.subheadline).foregroundStyle(Theme.muted).textSelection(.enabled)
            }
            if let whatsapp = WhatsApp.url(phone: card.phone, message: message) {
                Link(destination: whatsapp) {
                    Label("Mandar tarjeta por WhatsApp", systemImage: "message.fill")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            HStack(spacing: 10) {
                ShareLink(item: link, message: Text(message)) {
                    Label("Compartir", systemImage: "square.and.arrow.up")
                }
                Link(destination: link) {
                    Label("Ver como cliente", systemImage: "safari")
                }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .card()
    }

    @ViewBuilder
    private func history(_ card: StaffCard) -> some View {
        if let movements = card.movements, !movements.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle("Movimientos")
                ForEach(movements) { m in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(m.summary).font(.subheadline).foregroundStyle(Theme.ink)
                        Spacer(minLength: 8)
                        Text(Fmt.dateTime(m.createdAt)).font(.footnote).foregroundStyle(Theme.muted).fixedSize()
                    }
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                    if m.id != movements.last?.id { Divider() }
                }
            }
            .card()
        }
    }

    /// Mensaje corto después de cada movimiento.
    private func feedback(_ card: StaffCard) -> String {
        guard let r = card.result else { return "Listo" }
        switch r.kind {
        case .sello: return r.rewards > 0 ? "¡Premio desbloqueado! \(card.program.reward ?? "")" : "Sello agregado: \(card.headline.value)"
        case .canje: return "Premio canjeado"
        case .compra: return r.points > 0 ? "+\(Fmt.number(r.points)) puntos" : "+\(Fmt.lempiras(r.cents)) de cashback"
        case .uso: return "Cobrado: \(Fmt.lempiras(-r.cents)). Queda \(Fmt.lempiras(card.balanceCents))"
        case .recarga, .alta: return "Recarga lista: \(Fmt.lempiras(card.balanceCents))"
        }
    }

    // MARK: - Red

    private func load() async {
        do {
            card = try await APIClient.shared.request("GET", "/cards/\(cardId)")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    @discardableResult
    private func run(_ action: Action, _ extra: [String: Any] = [:]) async -> Bool {
        guard let current = card, !busy else { return false }
        busy = true
        actionError = nil
        var json = extra
        json["action"] = action.rawValue
        do {
            var next: StaffCard = try await APIClient.shared.request("POST", "/cards/\(current.id)/actions", json: json)
            next.movements = current.movements
            card = next
            toast = feedback(next)
            if let r = next.result, r.rewards > 0 || r.kind == .canje { Haptics.success() } else { Haptics.tap() }
            busy = false
            await load() // trae el historial con el movimiento nuevo
            return true
        } catch {
            actionError = error.localizedDescription
            Haptics.error()
            busy = false
            return false
        }
    }
}
