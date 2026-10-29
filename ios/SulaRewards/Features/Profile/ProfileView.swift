import SwiftUI

/// El negocio, ayuda, salir y borrar la cuenta (lo pide la App Store: regla 5.1.1(v)).
struct ProfileView: View {
    @Environment(Session.self) private var session
    @Environment(BusinessStore.self) private var store
    @State private var editing: Business?
    @State private var addingBusiness = false
    @State private var confirmSignOut = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

    var body: some View {
        List {
            if let business = store.current {
                Section("Tu negocio") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(business.name).font(.headline)
                        Text([business.category, business.city].compactMap { $0 }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 4)
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
            }

            Section("Tu cuenta") {
                LabeledContent("Correo", value: session.user?.email ?? "")
                Button("Salir") { confirmSignOut = true }
            }

            Section("Ayuda") {
                Link(destination: Config.supportURL) {
                    Label("Soporte", systemImage: "questionmark.circle")
                }
                Link(destination: Config.privacyURL) {
                    Label("Política de privacidad", systemImage: "hand.raised")
                }
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
                Text("Se borran tu cuenta, tus negocios, tus programas y las tarjetas de todos tus clientes. No se puede deshacer.")
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
        .sheet(item: $editing) { EditBusinessView(business: $0) }
        .sheet(isPresented: $addingBusiness) {
            NavigationStack {
                CreateBusinessView { addingBusiness = false }
                    .navigationTitle("Otro negocio")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { addingBusiness = false } }
                    }
            }
        }
        .confirmationDialog("¿Salir de Sula Rewards?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Salir", role: .destructive) { Task { await session.signOut() } }
        } message: {
            Text("Para volver a entrar te mandamos un código a tu correo.")
        }
        .alert("¿Borrar tu cuenta?", isPresented: $confirmDelete) {
            Button("Borrar todo", role: .destructive) { Task { await deleteAccount() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se borran para siempre tu cuenta, tus negocios, tus programas y las tarjetas y movimientos de todos tus clientes. Las tarjetas que tus clientes guardaron en su Wallet dejan de actualizarse.")
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
