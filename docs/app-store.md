# App Store: la app de iOS para comercios

La app de iPhone es para el **negocio** (el dueño o el cajero): escanear la tarjeta del cliente y sumar en caja. Los clientes no
necesitan app: guardan su tarjeta en el Wallet o la abren en la web.

- Bundle ID: `com.cristopherpineda.sularewards` · Team ID: `3BZ685RYJ3` · firma automática
- iOS 18 o más nuevo (los mismos iPhone que iOS 17: XS/XR en adelante) · solo iPhone, vertical
- Política de privacidad: **https://crisio.github.io/sula-rewards/privacidad.html** (`public/privacidad.html`)
- Soporte: **https://crisio.github.io/sula-rewards/soporte.html** (`public/soporte.html`)

## Antes de mandar a revisión

1. **La API publicada** con esta versión (trae `DELETE /me` y la cuenta de revisión): **Actions → Deploy API → Run workflow**.
   La app usa `https://sula-rewards-api.cristopheropineda.workers.dev` (`ios/SulaRewards/Core/Config.swift`). Si al publicar
   Cloudflare te da otra URL, cámbiala ahí antes de archivar.
2. **GitHub Pages activo**, para que abran la política de privacidad y el soporte (las dos URL de arriba).
3. **La cuenta de revisión** con datos de ejemplo (abajo).
4. Revisa el correo de contacto de `public/privacidad.html` y `public/soporte.html` (hoy `hola@cristopherpineda.com`).

## Ficha en App Store Connect

| Campo | Texto |
|---|---|
| Nombre (30) | **Sula Rewards para comercios** |
| Subtítulo (30) | **Sellos, puntos y gift cards** |
| Nombre en el iPhone | Sula Rewards (`CFBundleDisplayName`) |
| Idioma principal | Español (México) |
| Categoría | **Negocios** (secundaria opcional: Productividad) |
| Precio | Gratis |
| Palabras clave (100) | `lealtad,fidelidad,sellos,puntos,cashback,gift card,tarjeta,wallet,caja,comercio,honduras,premios` |
| URL de soporte | https://crisio.github.io/sula-rewards/soporte.html |
| URL de marketing | https://crisio.github.io/sula-rewards/ |
| Copyright | 2026 Cristopher Pineda |
| Clasificación por edad | 4+ (todas las respuestas del cuestionario en «Ninguno»/«No») |

**Texto promocional (170):**

> Escanea y suma en caja: sellos, puntos, cashback y gift cards. Tus clientes guardan su tarjeta en el Wallet, sin descargar apps.

**Descripción:**

> Sula Rewards es la app de caja para el programa de fidelidad de tu negocio. Tus clientes guardan su tarjeta en el Wallet de su
> teléfono sin descargar ninguna app, y tú les sumas en caja escaneando su QR.
>
> CUATRO TIPOS DE PROGRAMA
> • Sellos: «8 cafés = 1 gratis». Al completar la meta se gana el premio y los sellos vuelven a empezar.
> • Puntos: puntos por cada L 100 de compra y un premio que cuesta los puntos que tú decidas.
> • Cashback: un porcentaje de cada compra regresa como saldo en lempiras para la próxima visita.
> • Gift cards: véndelas en caja con saldo, cóbralas con el QR y recárgalas.
>
> EN CAJA, EN SEGUNDOS
> • Escanea la tarjeta del cliente con la cámara o escribe su código.
> • Suma sellos, registra la compra, canjea el premio o cobra con su saldo.
> • Revisa el historial de cada tarjeta.
> • Manda la tarjeta por WhatsApp con el mensaje ya escrito.
>
> TUS CLIENTES SE UNEN SOLOS
> • Comparte o imprime el cartel con el QR de tu negocio.
> • El cliente pone su nombre y su celular y guarda su tarjeta.
> • Un celular, una tarjeta por programa.
>
> HECHO PARA HONDURAS
> Lempiras, celulares de 8 dígitos y la hora de Honduras. Hecho en San Pedro Sula.
>
> Entras con un código que llega a tu correo, sin contraseñas. Puedes borrar tu cuenta y todos tus datos desde la app.

No nombres Google Wallet ni Android en la ficha ni en la app (regla 2.3.10: nada de otras plataformas móviles). La app dice «el
Wallet de su teléfono»; la web sí nombra las dos.

## Dónde está cada requisito

| Regla de Apple | Dónde está en Sula Rewards |
|---|---|
| 5.1.1(v) Borrar la cuenta desde la app | Perfil → **Borrar mi cuenta**. API: `DELETE /me` (borra la cuenta, sus sesiones, negocios, programas, tarjetas, movimientos y registros de Apple Wallet, en cascada). Prueba en `api/test/api.test.ts`. |
| 5.1.1(i) Política de privacidad | En la pantalla de entrar y en Perfil → Ayuda. Además va en App Store Connect. |
| 2.1 Acceso para la revisión | Cuenta de revisión con código fijo (abajo). |
| 5.1.1(ii) Permisos | Solo la cámara, para leer el QR (`NSCameraUsageDescription`). Sin permiso, el código se puede escribir a mano. |
| 3.1.1 Compras dentro de la app | No hay pagos en la app. Las gift cards se pagan en persona en el negocio y la app solo anota el saldo (bienes y servicios fuera de la app, regla 3.1.3(e)). |
| Cifrado de exportación | `ITSAppUsesNonExemptEncryption = NO` (solo HTTPS del sistema). |
| Manifiesto de privacidad | `ios/SulaRewards/Resources/PrivacyInfo.xcprivacy`: sin rastreo; UserDefaults con la razón `CA92.1`. |

## Cuenta para la revisión

Los revisores de Apple no reciben nuestros correos, así que un correo elegido entra con un código fijo y no se le manda nada.
Los límites siguen igual: un código por minuto, 5 por hora y 5 intentos por código.

1. Elige un correo (p. ej. `revision@cristopherpineda.com`, no necesita existir) y un código de 6 dígitos que no sea obvio.
2. En GitHub: **Settings → Secrets and variables → Actions** → crea `REVIEW_EMAIL` y `REVIEW_CODE`. Luego vuelve a publicar la
   API (**Actions → Deploy API → Run workflow**).
3. Entra a la app con ese correo y el código y prepara datos de ejemplo:
   - Negocio «Café de prueba» (giro Cafetería).
   - Programa de **sellos** (8 sellos = Café gratis) con 2 o 3 clientes; a uno súmale 7 sellos para que el revisor complete el premio.
   - Programa de **puntos** o **cashback** con un cliente y una compra.
   - Anota el código de una tarjeta (en la tarjeta, sección Cliente: «Código K7M2-…») para las notas.
4. En App Store Connect → tu app → **App Review Information**: marca *Sign-in required*, pon el correo como *User name*, el código
   como *Password* y estas notas (en inglés), cambiando `XXXX-XXXX-XXXX` por el código del paso 3:

> Sula Rewards is the point-of-sale app for small businesses that run a loyalty program (stamps, points, cashback, gift cards).
> It signs in with a one-time code sent by email (no passwords). For this review account, type the email above, tap
> "Enviarme un código" and enter the code above as the 6-digit code; no email is sent to this address.
>
> The account already has a business ("Café de prueba") with sample programs and customers. To try the cashier flow without a
> customer card, type this card code on the home screen and tap "Abrir": XXXX-XXXX-XXXX. To try the camera, open
> https://crisio.github.io/sula-rewards/tarjeta/XXXXXXXXXXXX on another device and scan the QR shown there with "Escanear tarjeta".
>
> Customers do not need this app: they keep their card in Wallet or on the web. No payments are made in the app: gift cards are
> paid in person at the business and the app only records the balance. The camera is used only to read QR codes.
> The account can be deleted in Perfil → Borrar mi cuenta.

Si el revisor prueba **Borrar mi cuenta**, la cuenta y sus datos se borran de verdad: vuelve a hacer el paso 3 (y actualiza el
código de tarjeta en las notas) antes de mandar otra versión.

## Etiquetas de privacidad (App Privacy)

En App Store Connect → **App Privacy**. Sula Rewards no hace *tracking*, no tiene publicidad, analítica ni SDKs de terceros. Todo lo
de abajo es **App Functionality** y está **vinculado a la identidad** (*Linked to the user*). Coincide con
`PrivacyInfo.xcprivacy`.

| Tipo de dato (Apple) | Qué es en Sula Rewards |
|---|---|
| Contact Info → Email Address | el correo con el que entra el comercio |
| Contact Info → Name | los nombres de los clientes que da de alta el comercio |
| Contact Info → Phone Number | los celulares de los clientes (+504) |
| Purchases → Purchase History | los montos de compra que registra el cajero (para puntos o cashback), cobros y recargas de gift cards |
| Identifiers → User ID | el id de la cuenta del comercio y el código de cada tarjeta |

*Data Used to Track You:* ninguno. Si algún día agregas analítica, reportes de fallos o notificaciones con otro servicio,
actualiza esta tabla, el manifiesto y la política.

## Capturas de pantalla

App Store Connect pide capturas de **iPhone de 6.9"** (1320 × 2868, p. ej. iPhone 17 Pro Max en el simulador); con esas sirven
para los demás tamaños. De 3 a 10 capturas, en modo claro y con los datos de ejemplo de la cuenta de revisión:

1. **Caja**: «Escanear tarjeta», el código a mano y los programas.
2. **Tarjeta en caja** de sellos: la tarjeta con 7/8, «+1 sello» y el historial.
3. **Premio desbloqueado**: después del octavo sello, con el aviso de abajo.
4. **Programa**: los números (clientes, premios por canjear) y la lista de clientes.
5. **Nuevo programa**: los cuatro tipos y la vista previa de la tarjeta con el color de la marca.
6. **Cartel para el mostrador**: el QR para unirse.
7. (Opcional) **Escáner** apuntando a un QR: se toma en un iPhone de verdad (el simulador no tiene cámara).

En el simulador: `xcrun simctl io booted screenshot captura.png`. Para que la barra de estado se vea limpia:
`xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4`.

## Subir la app (en tu Mac)

1. Abre `ios/SulaRewards.xcodeproj` en Xcode (26 o más nuevo).
2. **Signing & Capabilities**: equipo `3BZ685RYJ3` y *Automatically manage signing*. Xcode registra el Bundle ID solo.
3. En **App Store Connect → Apps → + → New App**: iOS, nombre «Sula Rewards para comercios», idioma Español (México),
   Bundle ID `com.cristopherpineda.sularewards`, SKU `sularewards`.
4. En Xcode elige el destino **Any iOS Device (arm64)** y luego **Product → Archive**.
5. En el Organizer: **Distribute App → App Store Connect → Upload**.
6. Cuando el build aparezca en App Store Connect (10–30 min), pruébalo en **TestFlight** en tu iPhone: entrar, escanear una tarjeta
   real, sumar, mandar por WhatsApp y borrar una cuenta de prueba.
7. Llena la ficha, las etiquetas de privacidad y la información para la revisión, elige el build y **Add for Review**.

Para cada versión nueva sube `CURRENT_PROJECT_VERSION` (Build) en el target, y `MARKETING_VERSION` si cambia la versión visible.

Desde la terminal también se puede (usa `ios/ExportOptions.plist`):

```bash
cd ios && xcodebuild -project SulaRewards.xcodeproj -scheme SulaRewards -configuration Release -destination 'generic/platform=iOS' -archivePath build/SulaRewards.xcarchive -allowProvisioningUpdates archive
```

```bash
cd ios && xcodebuild -exportArchive -archivePath build/SulaRewards.xcarchive -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates
```
