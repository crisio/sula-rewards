import SwiftUI

/// Los giros del panel web (src/pages/PanelHome.tsx).
let businessCategories = ["Cafetería", "Restaurante", "Baleadas", "Panadería", "Salón de belleza", "Barbería", "Farmacia", "Boutique", "Supermercado", "Gimnasio", "Otro"]

/// Nombre y giro del negocio: para crearlo o para cambiarlos.
struct BusinessForm: View {
    @Binding var name: String
    @Binding var category: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FieldLabel("Nombre")
            TextField("Café Guamilito", text: $name)
                .textInputAutocapitalization(.words)
                .inputStyle()
            FieldLabel("Giro").padding(.top, 6)
            Menu {
                Picker("Giro", selection: $category) {
                    Text("Ninguno").tag("")
                    ForEach(businessCategories, id: \.self) { Text($0).tag($0) }
                }
            } label: {
                HStack {
                    Text(category.isEmpty ? "Elige uno (opcional)" : category)
                        .foregroundStyle(category.isEmpty ? Theme.muted : Theme.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                .inputStyle()
            }
            .accessibilityLabel("Giro: \(category.isEmpty ? "ninguno" : category)")
        }
    }
}

/// Registrar un negocio (el primero o uno más): cómo se llama y su giro. Va en una hoja.
struct CreateBusinessView: View {
    var onCreated: (() -> Void)?

    @Environment(BusinessStore.self) private var store
    @State private var name = ""
    @State private var category = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        SectionTitle("¿Cómo se llama tu negocio?")
                        FinePrint("Así aparece en la tarjeta de tus clientes.")
                    }
                    BusinessForm(name: $name, category: $category)
                    if let error { Notice(text: error) }
                    Button {
                        Task { await create() }
                    } label: {
                        BusyLabel(title: "Crear mi negocio", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).count < 2)
                }
                .card()
            }
            .padding(Theme.gutter)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
    }

    private func create() async {
        busy = true
        error = nil
        var json: [String: Any] = ["name": name.trimmingCharacters(in: .whitespaces)]
        if !category.isEmpty { json["category"] = category }
        do {
            let business: Business = try await APIClient.shared.request("POST", "/businesses", json: json)
            store.added(business)
            Haptics.success()
            onCreated?()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

/// Cambiar el nombre o el giro (PATCH /businesses/:id).
struct EditBusinessView: View {
    let business: Business

    @Environment(BusinessStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var category: String
    @State private var busy = false
    @State private var error: String?

    init(business: Business) {
        self.business = business
        _name = State(initialValue: business.name)
        _category = State(initialValue: business.category ?? "")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    BusinessForm(name: $name, category: $category)
                    FinePrint("El enlace para unirse no cambia: los carteles que ya imprimiste siguen funcionando.")
                    if let error { Notice(text: error) }
                    Button {
                        Task { await save() }
                    } label: {
                        BusyLabel(title: "Guardar", busy: busy)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).count < 2)
                }
                .card()
                .padding(Theme.gutter)
            }
            .screenBackground()
            .navigationTitle("Tu negocio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
        }
    }

    private func save() async {
        busy = true
        error = nil
        do {
            var updated: Business = try await APIClient.shared.request(
                "PATCH", "/businesses/\(business.id)",
                json: ["name": name.trimmingCharacters(in: .whitespaces), "category": category]
            )
            updated.programs = business.programs
            store.updated(updated)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
