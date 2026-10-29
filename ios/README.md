# Sula Rewards para iOS

App nativa en SwiftUI para los **negocios**: el dueño o el cajero escanea la tarjeta del cliente y suma en caja. Los clientes no
necesitan app (guardan su tarjeta en el Wallet o la abren en la web). Usa la misma API que el panel web
(`https://sula-rewards-api.cristopheropineda.workers.dev`).

- Nombre en la App Store: **Sula Rewards para comercios** · en el iPhone: **Sula Rewards**
- Bundle ID: `com.cristopherpineda.sularewards` · Team ID `3BZ685RYJ3` · iOS 18 o más nuevo · solo iPhone, vertical
- Modo claro y oscuro, con los colores de la web

## Abrir y correr

1. Abre `ios/SulaRewards.xcodeproj` en Xcode 26 o más nuevo.
2. En **Signing & Capabilities** el equipo ya es `3BZ685RYJ3` con firma automática. Sin cuenta funciona en el simulador.
3. Elige un simulador o tu iPhone y dale ▶︎. El escáner solo funciona en un iPhone de verdad; en el simulador se escribe el código.

Los archivos nuevos que pongas dentro de `ios/SulaRewards/` entran solos al proyecto (carpetas sincronizadas).

### Probar con la API local

```bash
cd api && npm run dev
```

```bash
xcrun simctl spawn booted defaults write com.cristopherpineda.sularewards SULA_API_URL http://localhost:8787
```

Solo funciona en compilaciones Debug. Los códigos para entrar se imprimen en la terminal de la API (`EMAIL_MODE=log`); con
`REVIEW_EMAIL`/`REVIEW_CODE` en `api/.dev.vars` puedes entrar con un código fijo. El teclado del simulador a veces cambia la «@»:
`defaults write … SULA_DEBUG_EMAIL revision@sula.test` precarga el correo.
Para volver a producción: `xcrun simctl spawn booted defaults delete com.cristopherpineda.sularewards SULA_API_URL`.

## Qué tiene

| Pantalla | Archivo |
|---|---|
| Entrar con código por correo | `Features/Login/LoginView.swift` |
| Crear el negocio (y cambiarle nombre o giro) | `Features/Business/BusinessForm.swift` |
| Caja: escanear, escribir el código, programas y el cartel con el QR para unirse | `Features/Home/HomeView.swift` |
| Escáner de QR (VisionKit) | `Features/Scanner/ScannerView.swift` |
| Nuevo programa: sellos, puntos, cashback o gift card | `Features/Programs/NewProgramView.swift` |
| Programa: números, nuevo cliente o venta de gift card, búsqueda | `Features/Programs/ProgramView.swift` |
| Tarjeta en caja: acciones según el tipo, historial, WhatsApp | `Features/Card/StaffCardView.swift` |
| Perfil: negocio, ayuda, salir y borrar la cuenta | `Features/Profile/ProfileView.swift` |

`Core/` tiene la API (`API.swift`, token Bearer y errores del servidor en español), la sesión (token en el llavero), los negocios
(`BusinessStore.swift`, el elegido se recuerda en el teléfono), los modelos, los formatos de Honduras (`Format.swift`: lempiras en
centavos, celulares de 8 dígitos, hora de Tegucigalpa) y el código de la tarjeta (`CardCode.swift`: el QR trae el id de 12
caracteres o un enlace con `/tarjeta/<id>`). `Design/` tiene los colores, los botones y la tarjeta como se ve en el Wallet.

## CI

`.github/workflows/ios.yml` compila la app para el simulador, sin firmar, en cada cambio dentro de `ios/`.

## Publicar

Lo que pide Apple (cuenta de revisión, etiquetas de privacidad, notas para el revisor, capturas y los pasos en Xcode) está en
[`docs/app-store.md`](../docs/app-store.md). En Xcode: **Product → Archive → Distribute App → App Store Connect**.
