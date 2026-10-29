import SwiftUI
import UIKit

/// Inicio de la caja: escanear, escribir el código, los programas y el QR para que los clientes se unan.
struct HomeView: View {
    @Environment(BusinessStore.self) private var store
    @Environment(Router.self) private var router
    @State private var programs: [Program]?
    @State private var error: String?
    @State private var scanning = false
    @State private var scanned: String?
    @State private var code = ""
    @State private var codeError: String?
    @FocusState private var codeFocused: Bool

    var body: some View {
        ScrollView {
            if let business = store.current {
                VStack(alignment: .leading, spacing: 20) {
                    if let subtitle = subtitleText(business) {
                        Text(subtitle).font(.subheadline).foregroundStyle(Theme.muted).padding(.top, -8)
                    }
                    scanPanel
                    programsPanel
                    JoinPosterView(business: business)
                }
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 32)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle(store.current?.name ?? "Caja")
        .toolbar {
            if let businesses = store.businesses, businesses.count > 1 {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Negocio", selection: Binding(get: { store.current?.id ?? "" }, set: { store.choose($0) })) {
                            ForEach(businesses) { Text($0.name).tag($0.id) }
                        }
                    } label: {
                        Label("Cambiar de negocio", systemImage: "arrow.left.arrow.right.circle")
                    }
                }
            }
        }
        .refreshable { await loadPrograms() }
        .task(id: store.current?.id) {
            programs = nil
            await loadPrograms()
        }
        // Al volver de un programa o de una tarjeta, los números se actualizan.
        .onChange(of: router.path.isEmpty) {
            if router.path.isEmpty { Task { await loadPrograms() } }
        }
        .fullScreenCover(isPresented: $scanning, onDismiss: openScanned) {
            ScannerView { scanned = $0 }
        }
    }

    private func subtitleText(_ business: Business) -> String? {
        let parts = [business.category, business.city].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var scanPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                scanning = true
            } label: {
                Label("Escanear tarjeta", systemImage: "qrcode.viewfinder")
            }
            .buttonStyle(PrimaryButtonStyle(big: true))

            HStack(spacing: 8) {
                TextField("Código: K7M2-Q9XD-3F8A", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($codeFocused)
                    .onSubmit(openCode)
                    .inputStyle()
                    .accessibilityLabel("Código de la tarjeta")
                Button("Abrir", action: openCode)
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(width: 96)
                    .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let codeError { Notice(text: codeError) }
        }
        .card()
    }

    private var programsPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionTitle("Tus programas")
                Spacer()
                NavigationLink(value: Route.newProgram) {
                    Label("Nuevo", systemImage: "plus").font(.subheadline.weight(.semibold))
                }
            }
            if let error, programs == nil {
                Notice(text: error)
            } else if let programs {
                if programs.isEmpty {
                    FinePrint("Todavía no tienes programas. Crea el primero: por ejemplo, 8 sellos y el noveno café gratis.")
                    NavigationLink(value: Route.newProgram) {
                        Text("Crear mi primer programa")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    VStack(spacing: 0) {
                        ForEach(programs) { program in
                            NavigationLink(value: Route.program(program.id)) { programRow(program) }
                                .buttonStyle(.plain)
                            if program.id != programs.last?.id { Divider().padding(.leading, 54) }
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .card()
    }

    private func programRow(_ program: Program) -> some View {
        HStack(spacing: 14) {
            ProgramIcon(type: program.type, color: program.color)
            VStack(alignment: .leading, spacing: 2) {
                Text(program.name).font(.headline).foregroundStyle(Theme.ink)
                Text(rowDetail(program)).font(.subheadline).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 10)
        .contentShape(.rect)
    }

    private func rowDetail(_ program: Program) -> String {
        let count = program.cards ?? 0
        var text = "\(program.type.label) · \(count) \(count == 1 ? "cliente" : "clientes")"
        if !program.isActive { text += " · pausado" }
        return text
    }

    private func loadPrograms() async {
        guard let business = store.current else { return }
        do {
            programs = try await APIClient.shared.request("GET", "/businesses/\(business.id)/programs")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func openCode() {
        guard let id = CardCode.id(from: code) else {
            codeError = "El código tiene 12 letras y números, como K7M2-Q9XD-3F8A."
            Haptics.error()
            return
        }
        codeError = nil
        code = ""
        codeFocused = false
        router.path.append(.card(id, isNew: false))
    }

    private func openScanned() {
        guard let id = scanned else { return }
        scanned = nil
        router.path.append(.card(id, isNew: false))
    }
}

/// El QR del mostrador: el cliente lo escanea, pone su nombre y su celular y guarda la tarjeta en su Wallet.
struct JoinPosterView: View {
    let business: Business
    @State private var qr: UIImage?
    @State private var poster: UIImage?

    private var url: URL { Config.joinURL(business.slug) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                SectionTitle("Cartel para el mostrador")
                FinePrint("Tus clientes escanean este QR, ponen su nombre y celular y guardan su tarjeta en Apple Wallet o Google Wallet.")
            }
            if let qr {
                Image(uiImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 200)
                    .padding(12)
                    .background(.white, in: .rect(cornerRadius: 16))
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("QR para unirse a \(business.name)")
            }
            Text(url.absoluteString)
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .textSelection(.enabled)
            VStack(spacing: 10) {
                if let poster {
                    ShareLink(
                        item: Image(uiImage: poster),
                        preview: SharePreview("Cartel de \(business.name)", image: Image(uiImage: poster))
                    ) {
                        Label("Compartir o imprimir el cartel", systemImage: "printer")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
                ShareLink(item: url, message: Text("Únete a \(business.name) y guarda tu tarjeta en el Wallet:")) {
                    Label("Compartir enlace", systemImage: "square.and.arrow.up")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
        .card()
        .task(id: business.slug) {
            let image = QRCode.image(for: url.absoluteString)
            qr = image
            poster = image.flatMap { renderPoster(qr: $0) }
        }
    }

    /// El cartel para imprimir (como el de la web): logo, nombre, QR y cómo se guarda la tarjeta.
    private func renderPoster(qr: UIImage) -> UIImage? {
        let content = VStack(spacing: 28) {
            LogoMark(size: 96)
            Text(business.name)
                .font(.system(size: 56, weight: .heavy, design: .rounded))
                .multilineTextAlignment(.center)
            Text("Escanea, únete y gana premios en cada visita")
                .font(.system(size: 30, weight: .semibold))
                .multilineTextAlignment(.center)
            Image(uiImage: qr)
                .interpolation(.none)
                .resizable()
                .frame(width: 640, height: 640)
            Text("Tu tarjeta se guarda en Apple Wallet o Google Wallet")
                .font(.system(size: 26))
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(Color(hex: 0x1D1B26))
        .padding(64)
        .frame(width: 900)
        .background(Color.white)
        .environment(\.colorScheme, .light)

        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        return renderer.uiImage
    }
}
