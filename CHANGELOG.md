# Cambios

## Sin publicar

- Página de inicio: sección «La app para iPhone» con capturas de la app (`public/app/`) y el botón del App Store. Dice
  «Pronto en el App Store» hasta que Apple publique la app; entonces cambia solo a «Descargar en el App Store» (consulta
  `itunes.apple.com/lookup` al cargar la página).
- El enlace de los negocios con acento salía cortado («Café» → `caf-…`) porque en producción `normalize('NFD')` no
  separaba los acentos. Ahora las letras con acento se cambian a mano. Los enlaces que ya existían no cambian.
- Lo que Apple Wallet reporta en `/apple/v1/log` se guarda en la tabla `apple_logs` (migración 0004) para revisar por qué
  un iPhone no se registra para las actualizaciones del pase.

## 0.3.0 — 29 de octubre de 2026

- La app de iPhone es para clientes y negocios:
  - **Tarjetas**: las del cliente en todos los negocios, con el QR para caja, el historial y «Agregar a Apple Wallet».
  - **Explorar**: promociones y negocios; unirse a sus programas con el nombre y el celular del perfil.
  - **Mi negocio**: la caja de antes, o registrar el negocio.
- Entrar con Apple, con Google o con código por correo (`docs/login.md`).
- El negocio sube su logo: sale en el pase de Apple Wallet y de Google Wallet, en la tarjeta web y en la app.
- Promociones de los negocios (hasta 5 activas), con reportes: con 3 se pausa sola y avisa por correo.
- Panel web: logo y promociones. Migraciones 0002 y 0003.


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
