import CoreImage.CIFilterBuiltins
import PassKit
import UIKit

enum Haptics {
    static func tap() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
}

enum QRCode {
    /// QR en blanco y negro, nítido (cada módulo del QR son varios pixeles enteros).
    static func image(for text: String, size: CGFloat = 720) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scale = max(1, (size / output.extent.width).rounded(.down))
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

enum WhatsApp {
    /// wa.me/504XXXXXXXX con el mensaje ya escrito. Solo se dejan sin codificar letras y números ASCII.
    static func url(phone: String, message: String) -> URL? {
        let digits = phone.filter { $0.isASCII && $0.isNumber }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        guard let text = message.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "https://wa.me/\(digits)?text=\(text)")
    }
}

enum LogoImage {
    /// La foto que eligió el dueño, recortada al centro en un cuadrado de 360×360 y en PNG (lo que pide la API).
    static func squarePNG(from image: UIImage, size: CGFloat = 360) -> Data? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        format.preferredRange = .standard // 8 bits por canal en sRGB (la API no lee PNG de 16 bits de color amplio)
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: format)
        let square = renderer.image { _ in
            let scale = max(size / image.size.width, size / image.size.height)
            let width = image.size.width * scale
            let height = image.size.height * scale
            image.draw(in: CGRect(x: (size - width) / 2, y: (size - height) / 2, width: width, height: height))
        }
        return square.pngData()
    }
}

/// Presenta la hoja de Apple Wallet («Agregar») encima de lo que esté en pantalla.
final class PassPresenter: NSObject, PKAddPassesViewControllerDelegate {
    static let shared = PassPresenter()
    private var onFinish: (() -> Void)?

    func present(_ pass: PKPass, onFinish: @escaping () -> Void) {
        guard let controller = PKAddPassesViewController(pass: pass), let top = Self.topController() else { return }
        self.onFinish = onFinish
        controller.delegate = self
        top.present(controller, animated: true)
    }

    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
        controller.dismiss(animated: true)
        onFinish?()
        onFinish = nil
    }

    private static func topController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
