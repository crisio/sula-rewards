import AVFoundation
import SwiftUI
import UIKit
import VisionKit

/// Escanea el QR de la tarjeta del cliente con la cámara (VisionKit). El QR trae el id de 12 caracteres o un enlace con
/// /tarjeta/<id>. Si la cámara no está disponible, se puede escribir el código.
struct ScannerView: View {
    let onFound: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var access = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var message: String?
    @State private var found = false
    @State private var code = ""

    var body: some View {
        NavigationStack {
            Group {
                if !DataScannerViewController.isSupported {
                    manualEntry(reason: "Este dispositivo no puede escanear códigos con la cámara.")
                } else {
                    switch access {
                    case .authorized: camera
                    case .notDetermined: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    default: denied
                    }
                }
            }
            .navigationTitle("Escanear tarjeta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { dismiss() } }
            }
        }
        .task {
            guard access == .notDetermined else { return }
            _ = await AVCaptureDevice.requestAccess(for: .video)
            access = AVCaptureDevice.authorizationStatus(for: .video)
        }
    }

    private var camera: some View {
        ZStack(alignment: .bottom) {
            QRScanner(onCode: handle)
                .ignoresSafeArea()
            RoundedRectangle(cornerRadius: 28)
                .strokeBorder(.white.opacity(0.9), lineWidth: 4)
                .frame(width: 250, height: 250)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            Text(message ?? "Apunta al QR de la tarjeta del cliente: en su Wallet o en su teléfono.")
                .font(.headline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(.black.opacity(0.65), in: .rect(cornerRadius: 18))
                .padding(.horizontal, Theme.gutter)
                .padding(.bottom, 32)
                .animation(.default, value: message)
        }
        .background(Color.black)
    }

    private var denied: some View {
        ScrollView {
            VStack(spacing: 16) {
                ContentUnavailableView(
                    "Sin permiso para la cámara",
                    systemImage: "camera.fill",
                    description: Text("Para escanear tarjetas, permite la cámara en Ajustes → Sula Rewards.")
                )
                Button("Abrir Ajustes") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(PrimaryButtonStyle())
                manualCard
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
    }

    private func manualEntry(reason: String) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                Notice(text: reason)
                manualCard
            }
            .padding(Theme.gutter)
        }
        .screenBackground()
    }

    private var manualCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            FieldLabel("Escribe el código de la tarjeta")
            TextField("K7M2-Q9XD-3F8A", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .onSubmit(openTyped)
                .inputStyle()
            if let message { Notice(text: message) }
            Button("Abrir tarjeta", action: openTyped)
                .buttonStyle(PrimaryButtonStyle())
                .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .card()
    }

    private func openTyped() {
        guard let id = CardCode.id(from: code) else {
            message = "El código tiene 12 letras y números, como K7M2-Q9XD-3F8A."
            Haptics.error()
            return
        }
        finish(id)
    }

    private func handle(_ payload: String) {
        guard !found else { return }
        switch CardCode.read(payload) {
        case .card(let id):
            finish(id)
        case .joinPoster:
            message = "Ese QR es para que tus clientes se unan. Escanea el de su tarjeta."
            Haptics.error()
        case .unknown:
            message = "Ese QR no es de una tarjeta de Sula Rewards."
            Haptics.error()
        }
    }

    private func finish(_ id: String) {
        found = true
        Haptics.success()
        onFound(id)
        dismiss()
    }
}

/// DataScannerViewController de VisionKit, solo para QR.
struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onCode = onCode
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onCode: (String) -> Void

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems { read(item) }
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            read(item)
        }

        private func read(_ item: RecognizedItem) {
            if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue { onCode(payload) }
        }
    }
}
