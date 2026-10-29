import SwiftUI

/// La pestaña Explorar: las promociones y los negocios de Sula Rewards.
struct ExploreTab: View {
    @State private var path: [CustomerRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            ExploreView()
                .customerDestinations()
        }
    }
}

/// Los negocios que la persona ocultó (sus promociones ya no le salen). Se guarda en el teléfono.
@Observable
final class HiddenBusinesses {
    static let shared = HiddenBusinesses()
    private static let key = "sula.hidden"

    private(set) var slugs: Set<String> = Set(UserDefaults.standard.stringArray(forKey: HiddenBusinesses.key) ?? [])

    func hide(_ slug: String) {
        slugs.insert(slug)
        UserDefaults.standard.set(Array(slugs), forKey: Self.key)
    }

    func show(_ slug: String) {
        slugs.remove(slug)
        UserDefaults.standard.set(Array(slugs), forKey: Self.key)
    }
}

struct ExploreView: View {
    @State private var promotions: [FeedPromotion]?
    @State private var businesses: [DirectoryBusiness]?
    @State private var error: String?
    @State private var query = ""
    @State private var hidden = HiddenBusinesses.shared
    @State private var reporting: FeedPromotion?

    private func matches(_ business: DirectoryBusiness) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return true }
        return [business.name, business.category ?? ""].contains { $0.localizedStandardContains(q) }
    }

    private var visiblePromotions: [FeedPromotion] {
        (promotions ?? []).filter { !hidden.slugs.contains($0.business.slug) && matches($0.business) }
    }

    private var visibleBusinesses: [DirectoryBusiness] {
        (businesses ?? []).filter { !hidden.slugs.contains($0.slug) && matches($0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let error, promotions == nil {
                    Notice(text: error)
                } else if promotions == nil || businesses == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    if !visiblePromotions.isEmpty {
                        SectionTitle("Promociones")
                        ForEach(visiblePromotions) { promotion in
                            PromotionCard(promotion: promotion, onReport: { reporting = promotion }, onHide: { hidden.hide(promotion.business.slug) })
                        }
                    }
                    SectionTitle("Negocios en Sula Rewards").padding(.top, 4)
                    if visibleBusinesses.isEmpty {
                        FinePrint(query.isEmpty ? "Pronto habrá más negocios aquí." : "Ningún negocio con esa búsqueda.")
                    } else {
                        VStack(spacing: 0) {
                            ForEach(visibleBusinesses) { business in
                                NavigationLink(value: CustomerRoute.business(business.slug)) { businessRow(business) }
                                    .buttonStyle(.plain)
                                if business.id != visibleBusinesses.last?.id { Divider().padding(.leading, 60) }
                            }
                        }
                        .card(padding: 14)
                    }
                    if !hidden.slugs.isEmpty {
                        FinePrint("Ocultaste \(hidden.slugs.count == 1 ? "un negocio" : "\(hidden.slugs.count) negocios"). Los puedes volver a mostrar en Perfil.")
                    }
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle("Explorar")
        .searchable(text: $query, prompt: "Buscar negocio")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $reporting) { ReportPromotionView(promotion: $0) }
    }

    private func businessRow(_ business: DirectoryBusiness) -> some View {
        HStack(spacing: 14) {
            BusinessLogo(url: business.logoURL, name: business.name, size: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(business.name).font(.headline).foregroundStyle(Theme.ink)
                Text([business.category, business.city].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 10)
        .contentShape(.rect)
    }

    private func load() async {
        do {
            async let promos: [FeedPromotion] = APIClient.shared.request("GET", "/public/promotions")
            async let list: [DirectoryBusiness] = APIClient.shared.request("GET", "/public/businesses")
            (promotions, businesses) = try await (promos, list)
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Una promoción en Explorar: el negocio, el título, el detalle y hasta cuándo. Se puede reportar u ocultar el negocio.
struct PromotionCard: View {
    let promotion: FeedPromotion
    let onReport: () -> Void
    let onHide: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                NavigationLink(value: CustomerRoute.business(promotion.business.slug)) {
                    HStack(spacing: 12) {
                        BusinessLogo(url: promotion.business.logoURL, name: promotion.business.name, size: 40)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(promotion.business.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            if let category = promotion.business.category {
                                Text(category).font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                Menu {
                    Button("Reportar promoción", systemImage: "exclamationmark.bubble", action: onReport)
                    Button("Ocultar este negocio", systemImage: "eye.slash", action: onHide)
                } label: {
                    Image(systemName: "ellipsis").frame(width: 32, height: 32).contentShape(.rect)
                }
                .foregroundStyle(Theme.muted)
                .accessibilityLabel("Opciones de la promoción")
            }
            Text(promotion.title).font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
            if let body = promotion.body {
                Text(body).font(.subheadline).foregroundStyle(Theme.ink)
            }
            if let endsOn = promotion.endsOn {
                Label(Fmt.until(endsOn), systemImage: "calendar").font(.footnote.weight(.medium)).foregroundStyle(Theme.muted)
            }
        }
        .card()
    }
}

/// Reportar una promoción (engañosa, ofensiva…). Con varios reportes se pausa sola hasta revisarla.
struct ReportPromotionView: View {
    let promotion: FeedPromotion

    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if sent {
                        Notice(text: "Gracias. Revisaremos esta promoción y, si no cumple, la quitaremos.", tone: .success)
                        Button("Listo") { dismiss() }.buttonStyle(PrimaryButtonStyle())
                    } else {
                        Text("«\(promotion.title)» de \(promotion.business.name)").font(.headline).foregroundStyle(Theme.ink)
                        FieldLabel("¿Qué tiene de malo? (opcional)")
                        TextField("Es engañosa, ofensiva…", text: $reason, axis: .vertical)
                            .lineLimit(3...6)
                            .inputStyle()
                        if let error { Notice(text: error) }
                        Button {
                            Task { await send() }
                        } label: {
                            BusyLabel(title: "Reportar", busy: busy)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(busy)
                    }
                }
                .card()
                .padding(Theme.gutter)
            }
            .screenBackground()
            .navigationTitle("Reportar promoción")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() async {
        busy = true
        error = nil
        do {
            let _: OKResponse = try await APIClient.shared.request("POST", "/promotions/\(promotion.id)/report", json: ["reason": reason])
            sent = true
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

/// La página de un negocio: sus promociones y sus programas para unirse desde la app.
struct BusinessPublicView: View {
    let slug: String

    @Environment(WalletStore.self) private var wallet
    @Environment(Session.self) private var session
    @State private var business: PublicBusiness?
    @State private var error: String?
    @State private var joining: String?
    @State private var joinError: String?
    @State private var needsProfile: CardProgram?
    @State private var joined: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let business {
                    VStack(spacing: 10) {
                        BusinessLogo(url: business.logoURL, name: business.name, size: 88)
                        Text(business.name).font(.system(size: 28, weight: .heavy, design: .rounded)).foregroundStyle(Theme.ink).multilineTextAlignment(.center)
                        Text([business.category, business.city].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)

                    if !business.promotions.isEmpty {
                        SectionTitle("Promociones")
                        ForEach(business.promotions) { promotion in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(promotion.title).font(.headline).foregroundStyle(Theme.ink)
                                if let body = promotion.body { Text(body).font(.subheadline).foregroundStyle(Theme.ink) }
                                if let endsOn = promotion.endsOn {
                                    Label(Fmt.until(endsOn), systemImage: "calendar").font(.footnote).foregroundStyle(Theme.muted)
                                }
                            }
                            .card()
                        }
                    }

                    SectionTitle("Únete y gana")
                    if business.programs.isEmpty {
                        FinePrint("Este negocio no tiene programas abiertos por ahora.")
                    }
                    ForEach(business.programs) { program in programCard(program) }
                    if let joinError { Notice(text: joinError) }
                } else if let error {
                    ContentUnavailableView("No encontramos este negocio", systemImage: "storefront", description: Text(error))
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle(business?.name ?? "Negocio")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .navigationDestination(item: $joined) { CustomerCardView(cardId: $0) }
        .sheet(item: $needsProfile) { program in
            ProfileDetailsView(title: "Para unirte", note: "El negocio te reconoce en caja por tu nombre y tu celular.") {
                Task { await join(program) }
            }
        }
    }

    private func programCard(_ program: CardProgram) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ProgramIcon(type: program.type, color: program.color, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(program.name).font(.headline).foregroundStyle(Theme.ink)
                    Text(program.rules).font(.subheadline).foregroundStyle(Theme.muted)
                }
            }
            if let mine = wallet.card(inProgram: program.id) {
                NavigationLink(value: CustomerRoute.card(mine.id)) {
                    Label("Ver mi tarjeta · \(mine.headline.value)", systemImage: "wallet.pass")
                }
                .buttonStyle(SecondaryButtonStyle())
            } else {
                Button {
                    Task { await join(program) }
                } label: {
                    BusyLabel(title: "Unirme", busy: joining == program.id)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(joining != nil)
            }
        }
        .card()
    }

    private func load() async {
        do {
            business = try await APIClient.shared.request("GET", "/public/b/\(slug)")
            error = nil
            if wallet.cards == nil { await wallet.refresh() }
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func join(_ program: CardProgram) async {
        guard let user = session.user else { return }
        if user.fullName == nil || user.phone == nil {
            needsProfile = program
            return
        }
        joining = program.id
        joinError = nil
        do {
            let card = try await wallet.join(slug: slug, programId: program.id)
            Haptics.success()
            joined = card.id
        } catch {
            joinError = error.localizedDescription
            Haptics.error()
        }
        joining = nil
    }
}

/// Nombre y celular del cliente (PATCH /me). Para unirse a programas desde la app.
struct ProfileDetailsView: View {
    var title = "Tus datos"
    var note: String?
    var onSaved: (() -> Void)?

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var busy = false
    @State private var error: String?

    private var canSave: Bool { name.trimmingCharacters(in: .whitespaces).count >= 2 && Fmt.phoneDigits(phone) != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if let note { FinePrint(note) }
                    FieldLabel("Tu nombre").padding(.top, 4)
                    TextField("Gabriela Mejía", text: $name)
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .inputStyle()
                    FieldLabel("Tu celular").padding(.top, 6)
                    HStack(spacing: 8) {
                        Text("+504").font(.headline).foregroundStyle(Theme.muted)
                        TextField("9876-5432", text: $phone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                    }
                    .inputStyle()
                    if !phone.isEmpty, Fmt.phoneDigits(phone) == nil {
                        FinePrint("Un número de Honduras de 8 dígitos que empieza con 2, 3, 7, 8 o 9.")
                    }
                    if let error { Notice(text: error).padding(.top, 6) }
                    Button {
                        Task { await save() }
                    } label: {
                        BusyLabel(title: "Guardar", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || !canSave)
                    .padding(.top, 10)
                }
                .card()
                .padding(Theme.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
            .onAppear {
                name = session.user?.fullName ?? ""
                phone = session.user?.phone.map(Fmt.phone) ?? ""
            }
        }
    }

    private func save() async {
        guard let digits = Fmt.phoneDigits(phone) else { return }
        busy = true
        error = nil
        do {
            try await session.update(["full_name": name.trimmingCharacters(in: .whitespaces), "phone": digits])
            dismiss()
            onSaved?()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
