import CoreImage.CIFilterBuiltins
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
