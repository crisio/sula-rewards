import PhotosUI
import SwiftUI
import UIKit

/// La pestaña Mi negocio: la caja si ya tiene negocio; si no, la invitación a registrarlo.
struct BusinessTab: View {
    @Environment(BusinessStore.self) private var store

    var body: some View {
        if let businesses = store.businesses, !businesses.isEmpty {
            CashierTab()
        } else if store.businesses == nil, let error = store.error {
            ContentUnavailableView {
                Label("No pudimos abrir tu negocio", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error)
            } actions: {
                Button("Intentar de nuevo") { Task { await store.refresh() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(maxWidth: 260)
            }
            .screenBackground()
        } else if store.businesses == nil {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).screenBackground()
        } else {
            NavigationStack { BusinessIntroView() }
        }
    }
}

/// Para quien todavía no tiene negocio: qué es y el botón para registrarlo.
struct BusinessIntroView: View {
    @State private var creating = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    LogoMark(size: 56)
                    Text("Tu programa de lealtad, en el Wallet de tus clientes")
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.ink)
                    Text("Sin tarjetas de papel ni apps que descargar: tus clientes escanean el QR del mostrador y tú les sumas en caja.")
                        .foregroundStyle(Theme.muted)
                }
                VStack(alignment: .leading, spacing: 14) {
                    feature("cup.and.saucer.fill", "Sellos", "8 cafés = 1 gratis")
                    feature("star.fill", "Puntos", "Por cada L 100 de compra")
                    feature("banknote.fill", "Cashback", "Un % de vuelta en saldo")
                    feature("gift.fill", "Gift cards", "Se venden y se cobran en caja")
                    feature("megaphone.fill", "Promociones", "Las ven todos en Explorar")
                }
                .card()
                Button("Registrar mi negocio") { creating = true }
                    .buttonStyle(PrimaryButtonStyle(big: true))
                FinePrint("Es gratis. Puedes tener hasta 5 negocios con la misma cuenta.")
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle("Mi negocio")
        .sheet(isPresented: $creating) {
            NavigationStack {
                CreateBusinessView { creating = false }
                    .navigationTitle("Registrar mi negocio")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { creating = false } }
                    }
            }
        }
    }

    private func feature(_ symbol: String, _ title: String, _ detail: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(Theme.accent)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// Subir, cambiar o quitar el logo del negocio. Se recorta a un cuadrado de 360×360 y sale en las tarjetas y en el Wallet.
struct BusinessLogoEditor: View {
    let business: Business

    @Environment(BusinessStore.self) private var store
    @State private var item: PhotosPickerItem?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                BusinessLogo(url: business.logoURL, name: business.name, size: 64)
                    .overlay { if busy { ProgressView() } }
                VStack(alignment: .leading, spacing: 6) {
                    PhotosPicker(selection: $item, matching: .images) {
                        Text(business.logoUrl == nil ? "Subir logo" : "Cambiar logo").font(.subheadline.weight(.semibold))
                    }
                    if business.logoUrl != nil {
                        Button("Quitar logo", role: .destructive) { Task { await remove() } }
                            .font(.subheadline.weight(.semibold))
                    }
                }
                .disabled(busy)
            }
            FinePrint("Cuadrado. Sale en la tarjeta de tus clientes y en su Wallet.")
            if let error { Notice(text: error) }
        }
        .onChange(of: item) {
            guard let item else { return }
            Task { await upload(item) }
        }
    }

    private func upload(_ item: PhotosPickerItem) async {
        busy = true
        error = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self), let image = UIImage(data: data), let png = LogoImage.squarePNG(from: image) else {
                throw APIError(message: "No se pudo leer esa imagen. Prueba con otra.", status: 0)
            }
            var updated: Business = try await APIClient.shared.request("PUT", "/businesses/\(business.id)/logo", body: png, contentType: "image/png", timeout: 60)
            updated.programs = business.programs
            store.updated(updated)
            Haptics.success()
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        self.item = nil
        busy = false
    }

    private func remove() async {
        busy = true
        error = nil
        do {
            var updated: Business = try await APIClient.shared.request("DELETE", "/businesses/\(business.id)/logo")
            updated.programs = business.programs
            store.updated(updated)
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

/// Las promociones del negocio: las ven todos los clientes en Explorar mientras estén activas y vigentes.
struct PromotionsView: View {
    let business: Business

    @State private var promotions: [Promotion]?
    @State private var error: String?
    @State private var creating = false
    @State private var deleting: Promotion?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                FinePrint("Tus promociones salen en Explorar de la app de Sula Rewards para todos los clientes. Puedes tener hasta 5 activas.")
                if let error { Notice(text: error) }
                if let promotions {
                    if promotions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Todavía no tienes promociones").font(.headline).foregroundStyle(Theme.ink)
                            FinePrint("Por ejemplo: «2×1 en baleadas los martes» o «Café gratis en tu cumpleaños».")
                        }
                        .card()
                    }
                    ForEach(promotions) { promotion in row(promotion) }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 30)
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .screenBackground()
        .navigationTitle("Promociones")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creating = true } label: { Label("Nueva promoción", systemImage: "plus") }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $creating) {
            NewPromotionView(business: business) { promotion in
                promotions = [promotion] + (promotions ?? [])
            }
        }
        .confirmationDialog("¿Borrar esta promoción?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Borrar", role: .destructive) {
                if let deleting { Task { await delete(deleting) } }
            }
        } message: {
            Text(deleting?.title ?? "")
        }
    }

    private func row(_ promotion: Promotion) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(promotion.title).font(.headline).foregroundStyle(Theme.ink)
                Spacer()
                if promotion.isExpired {
                    Text("Vencida").font(.caption.weight(.bold)).foregroundStyle(Theme.danger)
                } else if !promotion.isActive {
                    Text("Pausada").font(.caption.weight(.bold)).foregroundStyle(Theme.muted)
                }
            }
            if let body = promotion.body { Text(body).font(.subheadline).foregroundStyle(Theme.ink) }
            Text(promotion.endsOn.map(Fmt.until) ?? "Sin fecha de fin").font(.footnote).foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                if !promotion.isExpired {
                    Button(promotion.isActive ? "Pausar" : "Reactivar") { Task { await toggle(promotion) } }
                }
                Button("Borrar", role: .destructive) { deleting = promotion }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .card()
        .opacity(promotion.isActive && !promotion.isExpired ? 1 : 0.7)
    }

    private func load() async {
        do {
            promotions = try await APIClient.shared.request("GET", "/businesses/\(business.id)/promotions")
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func toggle(_ promotion: Promotion) async {
        do {
            let updated: Promotion = try await APIClient.shared.request("PATCH", "/promotions/\(promotion.id)", json: ["active": !promotion.isActive])
            promotions = promotions?.map { $0.id == updated.id ? updated : $0 }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ promotion: Promotion) async {
        do {
            let _: OKResponse = try await APIClient.shared.request("DELETE", "/promotions/\(promotion.id)")
            promotions?.removeAll { $0.id == promotion.id }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        deleting = nil
    }
}

/// Nueva promoción: título, detalle y, si tiene, la fecha en que termina.
struct NewPromotionView: View {
    let business: Business
    let onCreated: (Promotion) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var details = ""
    @State private var hasEnd = false
    @State private var endsOn = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    FieldLabel("Título")
                    TextField("2×1 en baleadas los martes", text: $title).inputStyle()
                    FieldLabel("Detalle (opcional)").padding(.top, 6)
                    TextField("De 2 a 5 pm, en todas las sucursales", text: $details, axis: .vertical)
                        .lineLimit(2...5)
                        .inputStyle()
                    Toggle("Tiene fecha de fin", isOn: $hasEnd.animation())
                        .font(.subheadline.weight(.semibold))
                        .padding(.top, 6)
                    if hasEnd {
                        DatePicker("Termina el", selection: $endsOn, in: Date()..., displayedComponents: .date)
                            .font(.subheadline)
                    }
                    if let error { Notice(text: error).padding(.top, 6) }
                    Button {
                        Task { await create() }
                    } label: {
                        BusyLabel(title: "Publicar promoción", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || title.trimmingCharacters(in: .whitespaces).count < 3)
                    .padding(.top, 10)
                }
                .card()
                .padding(Theme.gutter)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("Nueva promoción")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
        }
    }

    private func create() async {
        busy = true
        error = nil
        var json: [String: Any] = ["title": title.trimmingCharacters(in: .whitespaces)]
        let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { json["body"] = trimmed }
        if hasEnd { json["ends_on"] = Fmt.isoDay(from: endsOn) }
        do {
            let promotion: Promotion = try await APIClient.shared.request("POST", "/businesses/\(business.id)/promotions", json: json)
            Haptics.success()
            onCreated(promotion)
            dismiss()
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
        }
        busy = false
    }
}
