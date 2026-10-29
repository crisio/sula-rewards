import SwiftUI

/// Tus datos, tu negocio (logo y promociones), ayuda, salir y borrar la cuenta (lo pide la App Store: regla 5.1.1(v)).
struct ProfileView: View {
    @Environment(Session.self) private var session
    @Environment(BusinessStore.self) private var store
    @State private var hidden = HiddenBusinesses.shared
    @State private var editingDetails = false
    @State private var editing: Business?
    @State private var addingBusiness = false
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

    var body: some View {
        List {
            Section {
                Button { editingDetails = true } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.user?.fullName ?? "Agrega tu nombre").font(.headline).foregroundStyle(Theme.ink)
                            Text(session.user?.phone.map { "+504 \(Fmt.phone($0))" } ?? "Agrega tu celular para unirte a programas")
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
                    }
                }
                LabeledContent("Correo", value: session.user?.email ?? "")
            } header: {
                Text("Tus datos")
            } footer: {
                Text("Con tu nombre y tu celular te unes a los programas desde la app.")
            }

            if let business = store.current {
                Section("Tu negocio") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(business.name).font(.headline)
                        Text([business.category, business.city].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 4)
                    BusinessLogoEditor(business: business).padding(.vertical, 4)
                    NavigationLink { PromotionsView(business: business) } label: {
                        Label("Promociones", systemImage: "megaphone")
                    }
                    Button("Cambiar nombre o giro") { editing = business }
                    if let businesses = store.businesses, businesses.count > 1 {
                        Picker("Negocio en caja", selection: Binding(get: { business.id }, set: { store.choose($0) })) {
                            ForEach(businesses) { Text($0.name).tag($0.id) }
                        }
                    }
                    if (store.businesses?.count ?? 0) < BusinessStore.maxBusinesses {
                        Button("Agregar otro negocio") { addingBusiness = true }
                    }
                    Link(destination: Config.panelURL) {
                        Label("Abrir el panel web", systemImage: "safari")
                    }
                }
            } else if store.businesses != nil {
                Section {
                    Button("Registrar mi negocio") { addingBusiness = true }
                } header: {
                    Text("¿Tienes un negocio?")
                } footer: {
                    Text("Crea tu programa de sellos, puntos, cashback o gift cards y suma en caja desde esta app.")
                }
            }

            if !hidden.slugs.isEmpty {
                Section {
                    ForEach(hidden.slugs.sorted(), id: \.self) { slug in
                        HStack {
                            Text(slug).font(.subheadline)
                            Spacer()
                            Button("Mostrar") { hidden.show(slug) }.font(.subheadline.weight(.semibold))
                        }
                    }
                } header: {
                    Text("Negocios ocultos")
                } footer: {
                    Text("Sus promociones no te salen en Explorar.")
                }
            }

            Section("Ayuda") {
                Link(destination: Config.supportURL) {
                    Label("Soporte", systemImage: "questionmark.circle")
                }
                Link(destination: Config.privacyURL) {
                    Label("Política de privacidad", systemImage: "hand.raised")
                }
            }

            Section("Tu cuenta") {
                Button("Salir") { confirmSignOut = true }
            }

            Section {
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    HStack {
                        Text("Borrar mi cuenta")
                        Spacer()
                        if deleting { ProgressView() }
                    }
                }
                .disabled(deleting)
            } footer: {
                Text("Se borran tu cuenta y, si tienes negocio, tus programas y las tarjetas de tus clientes. No se puede deshacer.")
            }

            Section {
                EmptyView()
            } footer: {
                Text("Sula Rewards \(Config.version) · Hecho en San Pedro Sula")
                    .frame(maxWidth: .infinity)
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Perfil")
        .sheet(isPresented: $editingDetails) { ProfileDetailsView() }
        .sheet(item: $editing) { EditBusinessView(business: $0) }
        .sheet(isPresented: $addingBusiness) {
            NavigationStack {
                CreateBusinessView { addingBusiness = false }
                    .navigationTitle(store.businesses?.isEmpty ?? true ? "Registrar mi negocio" : "Otro negocio")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { addingBusiness = false } }
                    }
            }
        }
        .confirmationDialog("¿Salir de Sula Rewards?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Salir", role: .destructive) { Task { await session.signOut() } }
        } message: {
            Text("Tus tarjetas siguen guardadas en tu cuenta para cuando vuelvas a entrar.")
        }
        .alert("¿Borrar tu cuenta?", isPresented: $confirmDelete) {
            Button("Borrar todo", role: .destructive) { Task { await deleteAccount() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(
                "Se borra tu cuenta para siempre. Si tienes negocio, también sus programas y las tarjetas y movimientos de todos tus clientes. Tus tarjetas como cliente siguen en cada negocio, pero ya no en esta app."
            )
        }
        .alert("No se pudo borrar la cuenta", isPresented: Binding(get: { deleteError != nil }, set: { if !$0 { deleteError = nil } })) {
            Button("Entendido", role: .cancel) {}
        } message: {
            Text(deleteError ?? "")
        }
    }

    private func deleteAccount() async {
        deleting = true
        do {
            try await session.deleteAccount()
        } catch {
            deleteError = error.localizedDescription
        }
        deleting = false
    }
}
