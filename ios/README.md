# Sula Rewards para iOS

App nativa en SwiftUI para **clientes y negocios**. El cliente tiene sus tarjetas de todos los negocios (con el QR para caja y
«Agregar a Apple Wallet») y Explorar con promociones; el negocio tiene la caja en **Mi negocio**. Usa la misma API que la web
(`https://sula-rewards-api.cristopheropineda.workers.dev`). Se entra con Apple, con Google o con código por correo
([docs/login.md](../docs/login.md)).

- Nombre en la App Store: **Sula Rewards** · en el iPhone: **Sula Rewards**
- Bundle ID: `com.cristopherpineda.sularewards` · Team ID `3BZ685RYJ3` · iOS 18 o más nuevo · solo iPhone, vertical
- Capacidad: Sign in with Apple (`SulaRewards.entitlements`) · modo claro y oscuro, con los colores de la web

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

| Pestaña / pantalla | Archivo |
|---|---|
| Entrar con Apple, con Google o con código | `Features/Login/LoginView.swift` · `Core/Auth.swift` |
| **Tarjetas**: las del cliente, agregar por QR o código | `Features/Wallet/WalletView.swift` (`WalletView`, `AddCardView`) |
| Una tarjeta: QR para caja, historial, «Agregar a Apple Wallet» | `Features/Wallet/WalletView.swift` (`CustomerCardView`) |
| **Explorar**: promociones y negocios; reportar u ocultar | `Features/Explore/ExploreView.swift` |
| Un negocio: sus promociones y «Unirme» a sus programas | `Features/Explore/ExploreView.swift` (`BusinessPublicView`) |
| **Mi negocio**: registrar el negocio o la caja | `Features/Business/BusinessExtras.swift` · `Features/Home/HomeView.swift` |
| Escáner de QR (VisionKit) | `Features/Scanner/ScannerView.swift` |
| Programas, clientes y gift cards | `Features/Programs/` |
| Tarjeta en caja: acciones según el tipo, historial, WhatsApp | `Features/Card/StaffCardView.swift` |
| Logo y promociones del negocio | `Features/Business/BusinessExtras.swift` |
| **Perfil**: tus datos, tu negocio, ocultos, salir y borrar la cuenta | `Features/Profile/ProfileView.swift` |

`Core/` tiene la API (`API.swift`, token Bearer y errores del servidor en español), la sesión (token en el llavero), las
tarjetas del cliente (`WalletStore.swift`), los negocios (`BusinessStore.swift`), los modelos, los formatos de Honduras
(`Format.swift`) y el código de la tarjeta (`CardCode.swift`: el QR trae el id de 12 caracteres, un enlace con
`/tarjeta/<id>` o el del cartel `/unete/<negocio>`). `Design/` tiene los colores, los botones, el logo del negocio y la
tarjeta como se ve en el Wallet.

## CI

`.github/workflows/ios.yml` compila la app para el simulador, sin firmar, en cada cambio dentro de `ios/`.

## Publicar

Lo que pide Apple (cuenta de revisión, etiquetas de privacidad, notas para el revisor, capturas y los pasos en Xcode) está en
[`docs/app-store.md`](../docs/app-store.md). En Xcode: **Product → Archive → Distribute App → App Store Connect**.
