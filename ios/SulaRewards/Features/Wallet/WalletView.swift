import PassKit
import SwiftUI
import UIKit

/// La pestaña Tarjetas: las tarjetas del cliente en todos los negocios.
struct WalletTab: View {
    let explore: () -> Void
    @State private var path: [CustomerRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            WalletView(path: $path, explore: explore)
                .customerDestinations()
        }
    }
}

extension View {
    /// Las pantallas del cliente que se pueden abrir desde Tarjetas o desde Explorar.
    func customerDestinations() -> some View {
        navigationDestination(for: CustomerRoute.self) { route in
            switch route {
            case .card(let id): CustomerCardView(cardId: id)
            case .business(let slug): BusinessPublicView(slug: slug)
            }
        }
    }
}

struct WalletView: View {
    @Binding var path: [CustomerRoute]
    let explore: () -> Void

    @Environment(WalletStore.self) private var wallet
    @State private var adding = false
    @State private var next: CustomerRoute?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let cards = wallet.cards {
                    if cards.isEmpty {
                        empty
                    } else {
                        ForEach(cards) { card in
                            NavigationLink(value: CustomerRoute.card(card.id)) {
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
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else if let error = wallet.error {
                    Notice(text: error)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle("Mis tarjetas")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Label("Agregar tarjeta", systemImage: "plus") }
            }
        }
        .refreshable { await wallet.refresh() }
        .task { await wallet.refresh() }
        .sheet(isPresented: $adding, onDismiss: openNext) {
            AddCardView { next = $0 }
        }
    }

    private var empty: some View {
        VStack(spacing: 14) {
            LogoMark(size: 64).padding(.top, 24)
            Text("Todavía no tienes tarjetas").font(.title3.weight(.bold)).foregroundStyle(Theme.ink)
            Text("Únete a un negocio desde Explorar, o agrega la tarjeta que te dieron en caja con su QR o su código.")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button(action: explore) { Label("Explorar negocios", systemImage: "sparkle.magnifyingglass") }
                .buttonStyle(PrimaryButtonStyle())
            Button { adding = true } label: { Label("Agregar mi tarjeta", systemImage: "plus") }
                .buttonStyle(SecondaryButtonStyle())
        }
        .card()
    }

    private func openNext() {
        guard let route = next else { return }
        next = nil
        path.append(route)
    }
}

/// Agregar una tarjeta: escanear su QR (o el cartel de un negocio) o escribir el código.
struct AddCardView: View {
    let onDone: (CustomerRoute) -> Void

    @Environment(WalletStore.self) private var wallet
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var scanning = false
    @State private var scanned: CustomerRoute?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Button {
                        scanning = true
                    } label: {
                        Label("Escanear el QR", systemImage: "qrcode.viewfinder")
                    }
                    .buttonStyle(PrimaryButtonStyle(big: true))
                    FinePrint("El de tu tarjeta (en la web o en tu Wallet), o el cartel del mostrador para unirte a un negocio.")
                    FieldLabel("O escribe el código de tu tarjeta").padding(.top, 8)
                    TextField("K7M2-Q9XD-3F8A", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit { Task { await add(code) } }
                        .inputStyle()
                    if let error { Notice(text: error) }
                    Button {
                        Task { await add(code) }
                    } label: {
                        BusyLabel(title: "Agregar tarjeta", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || CardCode.id(from: code) == nil)
                }
                .card()
                .padding(Theme.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("Agregar tarjeta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
            .fullScreenCover(isPresented: $scanning, onDismiss: afterScan) {
                ScannerView(onFound: { scanned = .card($0) }, onBusiness: { scanned = .business($0) })
            }
        }
    }

    private func afterScan() {
        guard let route = scanned else { return }
        scanned = nil
        switch route {
        case .card(let id): Task { await add(id) }
        case .business:
            onDone(route)
            dismiss()
        }
    }

    private func add(_ text: String) async {
        guard let id = CardCode.id(from: text), !busy else { return }
        busy = true
        error = nil
        do {
            let card = try await wallet.add(code: id)
            Haptics.success()
            onDone(.card(card.id))
            dismiss()
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        busy = false
    }
}

/// Una tarjeta del cliente: el QR para caja, cómo va, su historial y guardarla en Apple Wallet.
struct CustomerCardView: View {
    let cardId: String

    @Environment(WalletStore.self) private var wallet
    @Environment(\.dismiss) private var dismiss
    @State private var card: CustomerCard?
    @State private var error: String?
    @State private var confirmRemove = false
    @State private var qr: UIImage?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let card {
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
                    Text(card.status)
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                    qrPanel(card)
                    if card.wallet.apple { AddToAppleWalletButton(cardId: card.id) }
                    history(card)
                    NavigationLink(value: CustomerRoute.business(card.business.slug)) {
                        Label("Ver \(card.business.name)", systemImage: "storefront")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                } else if let error {
                    ContentUnavailableView("No se pudo abrir la tarjeta", systemImage: "creditcard.trianglebadge.exclamationmark", description: Text(error))
                } else {
                    ProgressView().padding(.top, 40)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle(card?.business.name ?? "Tarjeta")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Quitar de la app", systemImage: "trash", role: .destructive) { confirmRemove = true }
                } label: {
                    Label("Más", systemImage: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("¿Quitar esta tarjeta de la app?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Quitar", role: .destructive) { Task { await remove() } }
        } message: {
            Text("No pierdes tus sellos ni tu saldo: la tarjeta sigue en el negocio y la puedes volver a agregar con su código.")
        }
        .refreshable { await load() }
        .task {
            if card == nil { card = wallet.cards?.first { $0.id == cardId } }
            qr = QRCode.image(for: cardId)
            await load()
        }
    }

    private func qrPanel(_ card: CustomerCard) -> some View {
        VStack(spacing: 10) {
            if let qr {
                Image(uiImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 220)
                    .accessibilityLabel("QR de tu tarjeta \(card.code)")
            }
            Text(card.code)
                .font(.system(.title3, design: .monospaced).weight(.bold))
                .foregroundStyle(Color(hex: 0x1D1B26))
                .textSelection(.enabled)
            Text("Muéstralo en caja para sumar o canjear")
                .font(.footnote)
                .foregroundStyle(Color(hex: 0x6B6880))
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(Color.white, in: .rect(cornerRadius: Theme.radius))
    }

    @ViewBuilder
    private func history(_ card: CustomerCard) -> some View {
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

    private func load() async {
        do {
            let fresh: CustomerCard = try await APIClient.shared.request("GET", "/wallet/cards/\(cardId)")
            card = fresh
            wallet.upsert(fresh)
            error = nil
        } catch is CancellationError {
        } catch {
            if card == nil { self.error = error.localizedDescription }
        }
    }

    private func remove() async {
        do {
            try await wallet.remove(cardId)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// El botón oficial «Agregar a Apple Wallet»: baja el pase firmado de la API y abre la hoja de Wallet.
struct AddToAppleWalletButton: View {
    let cardId: String

    @State private var pass: PKPass?
    @State private var inWallet = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 8) {
            if inWallet, let url = pass?.passURL {
                Link(destination: url) {
                    Label("Ver en Apple Wallet", systemImage: "wallet.pass")
                }
                .buttonStyle(SecondaryButtonStyle())
            } else {
                AddPassButton { Task { await add() } }
                    .frame(height: 50)
                    .opacity(busy ? 0.5 : 1)
                    .disabled(busy)
                    .accessibilityLabel("Agregar a Apple Wallet")
            }
            if let error { Notice(text: error) }
        }
        .task { await check() }
    }

    private func download() async throws -> PKPass {
        let (data, response) = try await URLSession.shared.data(from: Config.apiURL.appending(path: "public/cards/\(cardId)/apple"))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw APIError(message: "No se pudo bajar el pase. Intenta de nuevo.", status: 0) }
        return try PKPass(data: data)
    }

    /// ¿Ya está en Wallet? Entonces el botón abre el pase en vez de agregarlo.
    private func check() async {
        guard PKPassLibrary.isPassLibraryAvailable(), let pass = try? await download() else { return }
        self.pass = pass
        inWallet = PKPassLibrary().containsPass(pass)
    }

    private func add() async {
        busy = true
        error = nil
        do {
            let pass = try await download()
            self.pass = pass
            PassPresenter.shared.present(pass) {
                inWallet = PKPassLibrary().containsPass(pass)
            }
        } catch {
            self.error = "No se pudo bajar el pase. Intenta de nuevo."
        }
        busy = false
    }
}

/// PKAddPassButton (la insignia que pide Apple) en SwiftUI.
struct AddPassButton: UIViewRepresentable {
    let action: () -> Void

    func makeUIView(context: Context) -> PKAddPassButton {
        let button = PKAddPassButton(addPassButtonStyle: .black)
        button.addTarget(context.coordinator, action: #selector(Coordinator.tap), for: .touchUpInside)
        return button
    }

    func updateUIView(_ button: PKAddPassButton, context: Context) {
        context.coordinator.action = action
    }

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    final class Coordinator: NSObject {
        var action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
        }

        @objc func tap() { action() }
    }
}
