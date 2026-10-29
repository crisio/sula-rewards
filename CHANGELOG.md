# Cambios

## 0.2.0 — 29 de octubre de 2026

- App de iPhone para los comercios (`ios/`): entrar con código, crear el negocio, escanear tarjetas con la cámara, sumar
  sellos, puntos o cashback, canjear, cobrar y recargar gift cards, dar de alta clientes, crear programas, compartir el
  cartel con el QR y mandar la tarjeta por WhatsApp. iOS 18 o más nuevo.
- Borrar la cuenta desde la app (`DELETE /me`): se borran sus negocios, programas, tarjetas y movimientos.
- Cuenta para la revisión de la App Store (`REVIEW_EMAIL` y `REVIEW_CODE`).
- Páginas de privacidad y soporte (`/privacidad.html` y `/soporte.html`).
- CI que compila la app de iOS.
- Apple Wallet con los certificados reales. El pase se ve como la tarjeta de la web: la tira de sellos mide 375×144
  (la de la storeCard; antes Wallet la recortaba de los lados), con panel claro, círculos punteados y palomita, en @1x,
  @2x y @3x, y el logo con el ícono del programa en un cuadro blanco.

## 0.1.0 — 29 de octubre de 2026

Primera versión.

- Programas de sellos, puntos, cashback y gift cards, con el color de cada negocio.
- Panel del comercio con código por correo: negocio, programas, clientes, escáner de QR y movimientos de caja.
- Página pública para unirse (`/unete/<negocio>`) y cartel con QR para imprimir.
- Tarjeta del cliente en la web con su QR, y para guardarla en Apple Wallet (`.pkpass` firmado, servicio web de
  actualizaciones) y en Google Wallet (pase genérico que se actualiza en cada movimiento).
- Mandar la tarjeta por WhatsApp desde caja.
