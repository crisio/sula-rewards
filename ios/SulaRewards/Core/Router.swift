import Foundation

/// La pila de pantallas de la pestaña Caja: cualquier pantalla puede abrir un programa o una tarjeta.
@Observable
final class Router {
    var path: [Route] = []
}

enum Route: Hashable {
    case program(String)
    case card(String, isNew: Bool)
    case newProgram
}
