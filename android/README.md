# Sula Rewards para Android

App nativa en Kotlin y Jetpack Compose para **clientes y negocios**, igual que la de iPhone: el cliente tiene sus tarjetas
de todos los negocios (con el QR para caja y «Agregar a Google Wallet» cuando está configurado) y Explorar con promociones;
el negocio tiene la caja en **Mi negocio**. Usa la misma API (`https://sula-rewards-api.cristopheropineda.workers.dev`).
Se entra con Google o con código por correo.

- Paquete: `com.cristopherpineda.sularewards` · Android 8 o más nuevo (minSdk 26) · compileSdk y targetSdk 36
- Modo claro y oscuro, con los colores de la web · español
- Sin permisos de cámara: el lector de QR es el de Google Play services (`play-services-code-scanner`)

## Abrir y correr

1. Abre la carpeta `android/` en Android Studio (la versión más nueva).
2. Espera a que sincronice Gradle y dale ▶︎ con un teléfono conectado o un emulador con Google Play.

O desde la terminal, con el SDK de Android instalado:

```bash
cd android && ./gradlew testDebugUnitTest assembleDebug
```

El `.apk` queda en `app/build/outputs/apk/debug/`.

## Qué tiene

| Pantalla | Archivo |
|---|---|
| Entrar con Google o con código | `ui/login/LoginScreen.kt` · `core/Auth.kt` |
| **Tarjetas**, agregar por QR o código, una tarjeta con su QR e historial | `ui/customer/Wallet.kt` |
| **Explorar**, reportar u ocultar, la página de un negocio y «Unirme» | `ui/customer/Explore.kt` |
| **Mi negocio**: registrar el negocio, la caja y el cartel con el QR | `ui/business/Home.kt` |
| Programas, clientes y crear programas | `ui/business/Programs.kt` |
| Tarjeta en caja: sumar, canjear, cobrar, recargar, WhatsApp | `ui/business/StaffCard.kt` |
| Logo, promociones, crear y cambiar el negocio | `ui/business/BusinessForms.kt` |
| **Perfil**: tus datos, tu negocio, ocultos, salir y borrar la cuenta | `ui/profile/ProfileScreen.kt` |

`core/` tiene la API (`Api.kt`: token Bearer y errores del servidor en español), los modelos (`Models.kt`), la sesión y
las tarjetas, negocios y ocultos (`Stores.kt`), la navegación de cada pestaña (`Nav.kt`), el token cifrado con el Android
Keystore (`Storage.kt`), los formatos de Honduras (`Fmt.kt`) y el código de la tarjeta (`CardCode.kt`). `ui/` tiene el tema,
los botones y paneles, la tarjeta como se ve en el Wallet, el lector de QR, el QR (ZXing), el logo y el cartel.

Las pruebas de `app/src/test/` revisan los formatos, el código de la tarjeta y cómo se leen las respuestas de la API.

## CI

`.github/workflows/android.yml` corre las pruebas y lint, compila el `.apk` de prueba y el `.aab` para Google Play en cada
cambio dentro de `android/`. Los deja en **Artifacts** de cada corrida. Con los secretos `ANDROID_KEYSTORE_*` el `.aab` sale
firmado con la llave de subida.

## Publicar

Todo lo que pide Google Play (cuenta, llave de subida, ficha, seguridad de los datos, prueba cerrada y entrar con Google)
está en [`docs/google-play.md`](../docs/google-play.md).
