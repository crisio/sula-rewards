# App Store: la app de Sula Rewards

Una sola app para los dos lados:

- **Clientes:** sus tarjetas de lealtad de todos los negocios en un solo lugar, con el QR para caja y el botón «Agregar a
  Apple Wallet»; **Explorar** con las promociones y los negocios para unirse.
- **Negocios:** la pestaña **Mi negocio** con la caja (escanear y sumar), programas, clientes, logo y promociones.

Se entra con **Apple**, con **Google** o con un **código por correo** (ver [login.md](login.md)).

- Bundle ID: `com.cristopherpineda.sularewards` · Team ID: `3BZ685RYJ3` · firma automática
- iOS 18 o más nuevo (los mismos iPhone que iOS 17: XS/XR en adelante) · solo iPhone, vertical
- Política de privacidad: **https://crisio.github.io/sula-rewards/privacidad.html** (`public/privacidad.html`)
- Soporte: **https://crisio.github.io/sula-rewards/soporte.html** (`public/soporte.html`)

## Antes de mandar a revisión

1. **La API publicada** con esta versión (**Actions → Deploy API → Run workflow** si no se publicó sola). La app usa
   `https://sula-rewards-api.cristopheropineda.workers.dev` (`ios/SulaRewards/Core/Config.swift`).
2. **GitHub Pages activo**, para que abran la política de privacidad y el soporte.
3. **La cuenta de revisión** con datos de ejemplo (abajo).
4. **Opcional pero recomendado:** la llave de Sign in with Apple para revocar el acceso al borrar la cuenta, y el client
   ID de Google para el botón de Google ([login.md](login.md)).
5. Revisa el correo de contacto de `public/privacidad.html` y `public/soporte.html` (hoy `hola@cristopherpineda.com`); a
   ese mismo correo llegan los reportes de promociones (`REPORTS_EMAIL` en `api/wrangler.jsonc`).

## Ficha en App Store Connect

| Campo | Texto |
|---|---|
| Nombre (30) | **Sula Rewards** (si está ocupado: **Sula Rewards: tarjetas y lealtad**) |
| Subtítulo (30) | **Tus tarjetas de lealtad en SPS** |
| Nombre en el iPhone | Sula Rewards (`CFBundleDisplayName`) |
| Idioma principal | Español (México) |
| Categoría | **Estilo de vida** (secundaria: **Negocios**) |
| Precio | Gratis |
| Palabras clave (100) | `lealtad,sellos,puntos,cashback,gift card,promociones,wallet,premios,tarjeta,honduras,comercio,caja` |
| URL de soporte | https://crisio.github.io/sula-rewards/soporte.html |
| URL de marketing | https://crisio.github.io/sula-rewards/ |
| Copyright | 2026 Cristopher Pineda |
| Clasificación por edad | 4+. En el cuestionario: todo «Ninguno»/«No», salvo **Contenido generado por usuarios: Sí** (las promociones de los negocios) |

**Texto promocional (170):**

> Tus tarjetas de sellos, puntos y cashback de San Pedro Sula en un solo lugar, en tu Wallet. ¿Tienes negocio? Suma en caja con un escaneo.

**Descripción:**

> Sula Rewards junta tus tarjetas de lealtad de los negocios de San Pedro Sula en un solo lugar: sellos, puntos, cashback y gift
> cards. Y si tienes un negocio, es tu caja para sumar y canjear.
>
> PARA TI
> • Todas tus tarjetas juntas, con el QR para mostrar en caja.
> • Agrégalas a Apple Wallet con un toque.
> • Mira cuántos sellos o puntos te faltan para tu premio y tu historial.
> • Explora promociones de los negocios y únete a sus programas sin llenar formularios.
>
> PARA TU NEGOCIO
> • Crea tu programa en un minuto, con tu logo y tus colores:
>   – Sellos: «8 cafés = 1 gratis».
>   – Puntos por cada L 100 de compra.
>   – Cashback en lempiras para la próxima visita.
>   – Gift cards que se venden y se cobran en caja.
> • Escanea la tarjeta del cliente y suma, canjea o cobra en segundos.
> • Tus clientes se unen escaneando el QR de tu mostrador, sin descargar nada.
> • Publica promociones que ven todos los usuarios en Explorar.
> • Manda la tarjeta por WhatsApp con el mensaje ya escrito.
>
> HECHO PARA HONDURAS
> Lempiras, celulares de 8 dígitos y la hora de Honduras. Hecho en San Pedro Sula.
>
> Entra con Apple, con Google o con un código a tu correo. Puedes borrar tu cuenta desde la app.

No nombres Google Wallet ni Android en la ficha ni en la app (regla 2.3.10: nada de otras plataformas móviles). La app dice «el
Wallet de tu teléfono»; la web sí nombra las dos. «Continuar con Google» para entrar sí se puede.

## Dónde está cada requisito

| Regla de Apple | Dónde está en Sula Rewards |
|---|---|
| 4.8 Entrar con otros servicios | Si se ofrece Google, también Sign in with Apple: los dos están en la pantalla de entrar (`Features/Login/LoginView.swift`). |
| 5.1.1(v) Borrar la cuenta desde la app | Perfil → **Borrar mi cuenta**. API: `DELETE /me` borra la cuenta, sus sesiones, negocios, programas, tarjetas de sus clientes y movimientos, en cascada; sus tarjetas como cliente siguen en cada negocio sin su cuenta. Si entró con Apple y está la llave `.p8`, se revoca el acceso en Apple (`api/src/jwt.ts`). Pruebas en `api/test/api.test.ts` y `api/test/clientes.test.ts`. |
| 5.1.1(i) Política de privacidad | En la pantalla de entrar y en Perfil → Ayuda. Además va en App Store Connect. |
| 1.2 Contenido de usuarios (promociones) | En Explorar, cada promoción tiene **⋯ → Reportar promoción** y **Ocultar este negocio** (los ocultos se pueden volver a mostrar en Perfil). Con 3 reportes de personas distintas la promoción se pausa sola y llega un correo a `REPORTS_EMAIL`. El contacto está en la página de soporte. |
| 2.1 Acceso para la revisión | Cuenta de revisión con código fijo (abajo). Sign in with Apple también funciona para el revisor. |
| 5.1.1(ii) Permisos | Solo la cámara, para leer el QR (`NSCameraUsageDescription`). Sin permiso, el código se escribe a mano. Las fotos del logo se eligen con el selector del sistema, que no pide permiso. |
| 3.1.1 Compras dentro de la app | No hay pagos en la app. Las gift cards se pagan en persona en el negocio y la app solo anota el saldo (bienes y servicios fuera de la app, regla 3.1.3(e)). |
| Wallet | El botón «Agregar a Apple Wallet» es el oficial (`PKAddPassButton`) y abre la hoja del sistema. |
| Cifrado de exportación | `ITSAppUsesNonExemptEncryption = NO` (solo HTTPS del sistema). |
| Manifiesto de privacidad | `ios/SulaRewards/Resources/PrivacyInfo.xcprivacy`: sin rastreo; UserDefaults con la razón `CA92.1`. |

## Cuenta para la revisión

Los revisores de Apple no reciben nuestros correos, así que un correo elegido entra con un código fijo y no se le manda nada.
Los límites siguen igual: un código por minuto, 5 por hora y 5 intentos por código.

1. Elige un correo (p. ej. `revision@cristopherpineda.com`, no necesita existir) y un código de 6 dígitos que no sea obvio.
2. En GitHub: **Settings → Secrets and variables → Actions** → crea `REVIEW_EMAIL` y `REVIEW_CODE`. Luego vuelve a publicar la
   API (**Actions → Deploy API → Run workflow**).
3. Entra a la app con ese correo y el código y prepara datos de ejemplo:
   - En **Mi negocio**: registra «Café de prueba» (Cafetería), sube un logo, crea un programa de **sellos** (8 sellos = Café
     gratis) y una **promoción** («2×1 en lattes»).
   - Da de alta un cliente y súmale 7 sellos. Anota el código de su tarjeta (en la tarjeta, sección Cliente: «Código K7M2-…»).
   - En **Perfil**, pon nombre y celular. En **Explorar**, entra a «Café de prueba» y **Únete** (así la cuenta tiene una
     tarjeta propia en **Tarjetas**).
4. En App Store Connect → tu app → **App Review Information**: marca *Sign-in required*, pon el correo como *User name*, el código
   como *Password* y estas notas (en inglés), cambiando `XXXX-XXXX-XXXX` por el código del paso 3:

> Sula Rewards has two sides. Customers keep their loyalty cards from local businesses in "Tarjetas" (with a QR code to show at
> checkout and the "Add to Apple Wallet" button) and discover promotions in "Explorar". Business owners use "Mi negocio" to scan
> customers' cards and add stamps or points.
>
> Sign in with Apple works. For the demo account, tap "Entrar con mi correo", type the email above, tap "Enviarme un código" and
> enter the code above as the 6-digit code; no email is sent to this address. The account already has a business ("Café de
> prueba") with a program, a promotion and a customer, and a card of its own in "Tarjetas".
>
> To try the cashier flow without a second phone: in "Mi negocio" type this card code and tap "Abrir": XXXX-XXXX-XXXX, then tap
> "+1 sello". To try the camera, open https://crisio.github.io/sula-rewards/tarjeta/XXXXXXXXXXXX on another device and scan the
> QR with "Escanear tarjeta".
>
> Promotions are posted by businesses. Any user can report a promotion or hide a business from the "⋯" menu on each promotion;
> after 3 reports a promotion is paused automatically and we review it.
>
> No payments are made in the app: gift cards are paid in person at the business and the app only records the balance. The
> camera is only used to read QR codes. The account can be deleted in Perfil → Borrar mi cuenta.

Si el revisor prueba **Borrar mi cuenta**, la cuenta y sus datos se borran de verdad: vuelve a hacer el paso 3 (y actualiza el
código de tarjeta en las notas) antes de mandar otra versión.

## Etiquetas de privacidad (App Privacy)

En App Store Connect → **App Privacy**. Sula Rewards no hace *tracking*, no tiene publicidad, analítica ni SDKs de terceros. Todo lo
de abajo es **App Functionality** y está **vinculado a la identidad** (*Linked to the user*). Coincide con
`PrivacyInfo.xcprivacy`.

| Tipo de dato (Apple) | Qué es en Sula Rewards |
|---|---|
| Contact Info → Email Address | el correo con el que entra (o el que da Apple o Google) |
| Contact Info → Name | su nombre de perfil, y los nombres de clientes que da de alta un negocio |
| Contact Info → Phone Number | su celular (+504) de perfil, y los celulares de clientes que da de alta un negocio |
| Purchases → Purchase History | los montos de compra que registra el cajero (para puntos o cashback), cobros y recargas de gift cards |
| User Content → Photos or Videos | el logo que sube un negocio |
| User Content → Other User Content | las promociones que publica un negocio y los reportes de promociones |
| Identifiers → User ID | el id de la cuenta y el código de cada tarjeta |

*Data Used to Track You:* ninguno. Si algún día agregas analítica, reportes de fallos o notificaciones con otro servicio,
actualiza esta tabla, el manifiesto y la política.

## Capturas de pantalla

App Store Connect pide capturas de **iPhone de 6.9"** (1320 × 2868, p. ej. iPhone 17 Pro Max en el simulador); con esas sirven
para los demás tamaños. De 3 a 10 capturas, en modo claro y con los datos de ejemplo de la cuenta de revisión:

1. **Tarjetas**: varias tarjetas de negocios distintos, con sus logos.
2. **Una tarjeta**: el QR para caja, cuántos sellos lleva y el botón «Agregar a Apple Wallet».
3. **Explorar**: las promociones y los negocios.
4. **Un negocio**: su logo, su promoción y «Unirme».
5. **Caja**: «Escanear tarjeta» y los programas.
6. **Tarjeta en caja**: «+1 sello» y el aviso de premio desbloqueado.
7. **Nuevo programa**: los cuatro tipos y la vista previa con el color de la marca.

En el simulador: `xcrun simctl io booted screenshot captura.png`. Para que la barra de estado se vea limpia:
`xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4`.

## Subir la app (en tu Mac)

1. Abre `ios/SulaRewards.xcodeproj` en Xcode (26 o más nuevo).
2. **Signing & Capabilities**: equipo `3BZ685RYJ3` y *Automatically manage signing*. Debe aparecer **Sign in with Apple**;
   Xcode registra el Bundle ID y la capacidad solo.
3. En **App Store Connect → Apps → + → New App**: iOS, nombre «Sula Rewards», idioma Español (México),
   Bundle ID `com.cristopherpineda.sularewards`, SKU `sularewards`.
4. En Xcode elige el destino **Any iOS Device (arm64)** y luego **Product → Archive**.
5. En el Organizer: **Distribute App → App Store Connect → Upload**.
6. Cuando el build aparezca en App Store Connect (10–30 min), pruébalo en **TestFlight** en tu iPhone: entrar con Apple,
   unirte a un negocio, agregar la tarjeta a Wallet, escanear una tarjeta en caja y borrar una cuenta de prueba.
7. Llena la ficha, las etiquetas de privacidad y la información para la revisión, elige el build y **Add for Review**.

Para cada versión nueva sube `CURRENT_PROJECT_VERSION` (Build) en el target, y `MARKETING_VERSION` si cambia la versión visible.

Desde la terminal también se puede (usa `ios/ExportOptions.plist`):

```bash
cd ios && xcodebuild -project SulaRewards.xcodeproj -scheme SulaRewards -configuration Release -destination 'generic/platform=iOS' -archivePath build/SulaRewards.xcarchive -allowProvisioningUpdates archive
```

```bash
cd ios && xcodebuild -exportArchive -archivePath build/SulaRewards.xcarchive -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates
```
