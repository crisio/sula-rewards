import SwiftUI

/// Un programa: sus números, dar de alta clientes (o vender gift cards) y buscar a sus clientes.
struct ProgramView: View {
    let programId: String

    @Environment(Router.self) private var router
    @State private var detail: ProgramDetail?
    @State private var error: String?
    @State private var query = ""
    @State private var cards: [CardRow]?
    @State private var cardsError: String?
    @State private var adding = false
    @State private var created: String?
    @State private var toggling = false
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let detail {
                    summary(detail)
                    if detail.program.isActive {
                        Button {
                            adding = true
                        } label: {
                            Label(detail.program.type == .giftcard ? "Vender gift card" : "Nuevo cliente", systemImage: "person.badge.plus")
                        }
                        .buttonStyle(PrimaryButtonStyle(big: true))
                    }
                    customers
                } else if let error {
                    Notice(text: error)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle(detail?.program.name ?? "Programa")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Nombre, celular o código")
        .refreshable { await reload() }
        .task { await loadProgram() }
        // Busca 300 ms después de dejar de escribir.
        .task(id: query) {
            if !query.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            await loadCards()
        }
        // Al volver de una tarjeta, los números y la lista se actualizan.
        .onAppear {
            if appeared { Task { await reload() } }
            appeared = true
        }
        .sheet(isPresented: $adding, onDismiss: openCreated) {
            if let program = detail?.program {
                NewCustomerView(program: program) { created = $0 }
            }
        }
    }

    private func summary(_ detail: ProgramDetail) -> some View {
        let program = detail.program
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                ProgramIcon(type: program.type, color: program.color, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name).font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
                    Text("\(program.type.label) · \(detail.business.name)").font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
            Text(program.rules).font(.body).foregroundStyle(Theme.ink)
            HStack(alignment: .top, spacing: 28) {
                stat(Fmt.number(detail.stats.cards), detail.stats.cards == 1 ? "cliente" : "clientes")
                if program.type == .sellos {
                    stat(Fmt.number(detail.stats.rewardsPending), "premios por canjear")
                }
                if program.type == .cashback || program.type == .giftcard {
                    stat(Fmt.lempiras(detail.stats.balanceCents), "saldo de clientes")
                }
            }
            Divider()
            HStack {
                Text(program.isActive ? "Activo" : "Pausado: no acepta clientes ni movimientos")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button(program.isActive ? "Pausar" : "Reactivar") {
                    Task { await toggleActive() }
                }
                .font(.subheadline.weight(.semibold))
                .disabled(toggling)
            }
        }
        .card()
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title2.weight(.heavy)).foregroundStyle(Theme.ink).contentTransition(.numericText())
            Text(label).font(.footnote).foregroundStyle(Theme.muted)
        }
        .accessibilityElement(children: .combine)
    }

    private var customers: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Clientes")
            if let cardsError {
                Notice(text: cardsError)
            } else if let cards {
                if cards.isEmpty {
                    FinePrint(query.isEmpty ? "Todavía no hay clientes. Pon el cartel con el QR en el mostrador o dalos de alta aquí." : "Nadie con esa búsqueda.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(cards) { card in
                            NavigationLink(value: Route.card(card.id, isNew: false)) { row(card) }
                                .buttonStyle(.plain)
                            if card.id != cards.last?.id { Divider() }
                        }
                    }
                    if cards.count == 50 { FinePrint("Se muestran los 50 más recientes. Busca por nombre, celular o código para encontrar a alguien más.") }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .card()
    }

    private func row(_ card: CardRow) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(card.customerName).font(.headline).foregroundStyle(Theme.ink)
                Text("\(Fmt.phone(card.phone)) · \(card.code)").font(.footnote).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(card.headline.value).font(.headline).foregroundStyle(Theme.ink)
                if card.rewards > 0 {
                    Label("\(card.rewards)", systemImage: "gift.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.accent)
                        .accessibilityLabel("\(card.rewards) \(card.rewards == 1 ? "premio" : "premios") por canjear")
                }
            }
        }
        .padding(.vertical, 10)
        .contentShape(.rect)
    }

    private func reload() async {
        await loadProgram()
        await loadCards()
    }

    private func loadProgram() async {
        do {
            detail = try await APIClient.shared.request("GET", "/programs/\(programId)")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadCards() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        do {
            cards = try await APIClient.shared.request("GET", "/programs/\(programId)/cards", query: q.isEmpty ? [:] : ["q": q])
            cardsError = nil
        } catch is CancellationError {
        } catch {
            cardsError = error.localizedDescription
        }
    }

    private func toggleActive() async {
        guard let current = detail else { return }
        toggling = true
        do {
            let updated: Program = try await APIClient.shared.request("PATCH", "/programs/\(programId)", json: ["active": !current.program.isActive])
            detail?.program.active = updated.active
            Haptics.tap()
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        toggling = false
    }

    private func openCreated() {
        guard let id = created else { return }
        created = nil
        router.path.append(.card(id, isNew: true))
    }
}

/// Alta de un cliente desde caja. La gift card sale con el saldo que pagó el cliente.
struct NewCustomerView: View {
    let program: Program
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var amount = ""
    @State private var busy = false
    @State private var error: String?

    private var isGift: Bool { program.type == .giftcard }
    private var canSubmit: Bool {
        name.trimmingCharacters(in: .whitespaces).count >= 2 && Fmt.phoneDigits(phone) != nil && (!isGift || Fmt.parseLempiras(amount) != nil)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    FieldLabel("Nombre")
                    TextField("Gabriela Mejía", text: $name)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .inputStyle()
                    FieldLabel("Celular").padding(.top, 6)
                    HStack(spacing: 8) {
                        Text("+504").font(.headline).foregroundStyle(Theme.muted)
                        TextField("9876-5432", text: $phone).keyboardType(.phonePad)
                    }
                    .inputStyle()
                    if !phone.isEmpty, Fmt.phoneDigits(phone) == nil {
                        FinePrint("Un número de Honduras de 8 dígitos que empieza con 2, 3, 7, 8 o 9.")
                    }
                    if isGift {
                        FieldLabel("Saldo").padding(.top, 6)
                        LempirasField(label: "Saldo de la gift card", text: $amount)
                    }
                    if let error { Notice(text: error).padding(.top, 6) }
                    Button {
                        Task { await create() }
                    } label: {
                        BusyLabel(title: "Crear tarjeta", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || !canSubmit)
                    .padding(.top, 10)
                    FinePrint("Un número tiene una sola tarjeta por programa. Si ya tiene, búscalo en la lista de clientes.")
                }
                .card()
                .padding(Theme.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle(isGift ? "Vender gift card" : "Nuevo cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
        }
    }

    private func create() async {
        guard let digits = Fmt.phoneDigits(phone) else { return }
        busy = true
        error = nil
        var json: [String: Any] = ["customer_name": name.trimmingCharacters(in: .whitespaces), "phone": digits]
        if isGift, let cents = Fmt.parseLempiras(amount) { json["initial_cents"] = cents }
        do {
            let card: CreatedCard = try await APIClient.shared.request("POST", "/programs/\(program.id)/cards", json: json)
            Haptics.success()
            onCreated(card.id)
            dismiss()
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        busy = false
    }
}
