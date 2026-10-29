import AuthenticationServices
import SwiftUI

/// Entrar con Apple, con Google o con un código de 6 dígitos por correo. Si es la primera vez, se crea la cuenta.
struct LoginView: View {
    private enum Step { case email, code }
    private enum Field { case email, code }

    @Environment(Session.self) private var session
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession
    @Environment(\.colorScheme) private var colorScheme
    @State private var config: AuthConfig?
    @State private var usingEmail = false
    @State private var step = Step.email
    @State private var email = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var wait = 0
    @FocusState private var focus: Field?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    LogoMark(size: 76).padding(.top, 48)
                    Text("Sula Rewards")
                        .font(.system(size: 36, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.ink)
                    Text("Tus tarjetas de lealtad de San Pedro Sula en un solo lugar. Y si tienes negocio, tu caja para sumar y canjear.")
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 12) {
                    if config?.apple ?? true {
                        SignInWithAppleButton(.continue) { request in
                            request.requestedScopes = [.fullName, .email]
                        } onCompletion: { result in
                            handleApple(result)
                        }
                        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                        .frame(height: 50)
                        .clipShape(.capsule)
                        .disabled(busy)
                    }
                    if let clientID = config?.googleIosClientId {
                        Button {
                            Task { await run { try await Auth.google(clientID: clientID, session: webAuthenticationSession) } }
                        } label: {
                            Label("Continuar con Google", systemImage: "g.circle.fill")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(busy)
                    }
                    if !usingEmail {
                        Button {
                            withAnimation { usingEmail = true }
                            focus = .email
                        } label: {
                            Label("Entrar con mi correo", systemImage: "envelope.fill")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(busy)
                    }
                    if busy, !usingEmail { ProgressView() }
                    if let error, !usingEmail { Notice(text: error) }
                }
                .card()

                if usingEmail {
                    if step == .email { emailCard } else { codeCard }
                }

                VStack(spacing: 4) {
                    Text("¿Qué hacemos con tus datos?").font(.footnote).foregroundStyle(Theme.muted)
                    PrivacyLink(title: "Lee la política de privacidad")
                }
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .task {
            config = await Auth.config()
            #if DEBUG
            // Solo en desarrollo: correo precargado para probar en el simulador (su teclado cambia la "@").
            // xcrun simctl spawn booted defaults write com.cristopherpineda.sularewards SULA_DEBUG_EMAIL revision@sula.test
            if email.isEmpty, let debugEmail = UserDefaults.standard.string(forKey: "SULA_DEBUG_EMAIL") {
                email = debugEmail
                usingEmail = true
            }
            #endif
        }
        .task(id: wait) {
            guard wait > 0 else { return }
            try? await Task.sleep(for: .seconds(1))
            wait -= 1
        }
    }

    private var emailCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            FieldLabel("Tu correo")
            // verbatim: con texto normal SwiftUI convierte el correo de ejemplo en enlace y el campo no se puede tocar.
            TextField(text: $email, prompt: Text(verbatim: "tucorreo@gmail.com")) { Text("Tu correo") }
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.send)
                .focused($focus, equals: .email)
                .onSubmit { Task { await requestCode() } }
                .inputStyle()
            FinePrint("Te enviaremos un código para entrar. Si es tu primera vez, se crea tu cuenta.")
            if let error { Notice(text: error) }
            Button {
                Task { await requestCode() }
            } label: {
                BusyLabel(title: "Enviarme un código", busy: busy)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || !email.contains("@"))
        }
        .card()
    }

    private var codeCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Escribe el código de 6 dígitos que enviamos a **\(email)**.")
                .font(.body)
                .foregroundStyle(Theme.ink)
            TextField("000000", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .tracking(10)
                .multilineTextAlignment(.center)
                .focused($focus, equals: .code)
                .padding(.vertical, 12)
                .background(Theme.sunken, in: .rect(cornerRadius: 14))
                .disabled(busy)
                .accessibilityLabel("Código de 6 dígitos")
                .onChange(of: code) {
                    let digits = String(code.filter { $0.isASCII && $0.isNumber }.prefix(6))
                    if digits != code { code = digits }
                    if digits.count == 6 { Task { await verify() } }
                }
            if let error { Notice(text: error) }
            Button {
                Task { await verify() }
            } label: {
                BusyLabel(title: "Entrar", busy: busy)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(busy || code.count != 6)

            HStack {
                Button("Cambiar correo") {
                    step = .email
                    error = nil
                    focus = .email
                }
                Spacer()
                Button(wait > 0 ? "Reenviar en \(wait) s" : "Reenviar código") {
                    Task { await requestCode() }
                }
                .disabled(wait > 0 || busy)
            }
            .font(.subheadline.weight(.semibold))
            FinePrint("¿No llega? Revisa la carpeta de spam o promociones.")
        }
        .card()
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }
            Task { await run { try await Auth.apple(credential) } }
        case .failure(let error):
            if !Auth.isCancellation(error) { self.error = "No se pudo entrar con Apple. Intenta de nuevo." }
        }
    }

    /// Entra con Apple o Google: muestra la ruedita y, si algo falla, el mensaje.
    private func run(_ signIn: () async throws -> SignedIn) async {
        busy = true
        error = nil
        do {
            session.signIn(try await signIn())
        } catch {
            if !Auth.isCancellation(error) {
                self.error = error.localizedDescription
                Haptics.error()
            }
        }
        busy = false
    }

    private func requestCode() async {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard !busy, trimmed.contains("@") else { return }
        busy = true
        error = nil
        do {
            let _: OKResponse = try await APIClient.shared.request("POST", "/auth/code", json: ["email": trimmed])
            step = .code
            code = ""
            wait = 60
            focus = .code
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }

    private func verify() async {
        guard !busy, code.count == 6 else { return }
        busy = true
        error = nil
        do {
            let result: SignedIn = try await APIClient.shared.request(
                "POST", "/auth/verify", json: ["email": email.trimmingCharacters(in: .whitespaces), "code": code]
            )
            session.signIn(result)
        } catch {
            self.error = error.localizedDescription
            Haptics.error()
            code = ""
            focus = .code
        }
        busy = false
    }
}
