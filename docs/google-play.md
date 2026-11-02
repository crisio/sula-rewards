# Google Play: la app de Sula Rewards para Android

La app de Android (`android/`, Kotlin y Jetpack Compose) es la misma que la de iPhone: **Tarjetas**, **Explorar**, **Mi
negocio** (la caja) y **Perfil**, con la misma API. Se entra con Google o con código por correo. GitHub Actions la compila
en cada cambio y deja el `.aab` listo para subir (**Actions → Android → la última corrida → Artifacts**).

- Paquete: `com.cristopherpineda.sularewards` · Android 8 o más nuevo (minSdk 26) · targetSdk 36 (lo que pide Play)
- Nombre en Google Play: **Sula Rewards**
- Íconos de la ficha: `android/store/icon-512.png` y `android/store/feature-graphic.png`

## Lo que tienes que hacer tú (en orden)

### 1. Cuenta de Google Play Console

1. Entra a https://play.google.com/console/signup con tu cuenta de Google y paga los **$25** (una sola vez).
2. Elige el tipo de cuenta:
   - **Personal**: la más rápida. Google pide verificar tu identidad (DNI o pasaporte) y, antes de publicar para todos, una
     **prueba cerrada con al menos 12 personas durante 14 días seguidos** (paso 6).
   - **Organización**: necesita un número **D-U-N-S** de la empresa (gratis en dnb.com, tarda unos días). No pide la prueba
     de 12 personas.
3. Verifica tu identidad y tu teléfono cuando te lo pida. Puede tardar unos días.

### 2. Llave de subida (una sola vez)

Google Play firma la app con su propia llave (**Play App Signing**); nosotros firmamos cada `.aab` con una **llave de
subida**. En tu Mac, en la Terminal:

```bash
keytool -genkeypair -v -keystore sula-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Te pide una contraseña (anótala) y tu nombre; lo demás puede ir vacío. Si dice que no encuentra Java, instala Android Studio
y usa su `keytool`:

```bash
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" -genkeypair -v -keystore sula-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Guarda `sula-upload.jks` y la contraseña en un lugar seguro (por ejemplo, tu gestor de contraseñas). **No lo subas al
repositorio.** Si se pierde, Google te deja cambiar la llave de subida desde Play Console.

Copia el archivo en base64:

```bash
base64 -i sula-upload.jks | pbcopy
```

Y en GitHub, **Settings → Secrets and variables → Actions → New repository secret**, crea estos cuatro:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | lo que copiaste (Cmd+V) |
| `ANDROID_KEYSTORE_PASSWORD` | la contraseña |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | la misma contraseña |

Luego **Actions → Android → Run workflow**. Al terminar, el artefacto `sula-rewards-android-N` trae
`app-release.aab` firmado. El paso «Huella SHA-1 de la llave» muestra el SHA-1 de tu llave de subida (lo usas en el paso 5).

### 3. Crear la app en Play Console

**Crear app**: nombre «Sula Rewards», idioma predeterminado **Español (Latinoamérica) – es-419**, **App**, **Gratis**.
Acepta las declaraciones.

### 4. Contenido de la app (Política → Contenido de la app)

| Sección | Qué poner |
|---|---|
| Política de privacidad | `https://crisio.github.io/sula-rewards/privacidad.html` |
| Acceso a la app | «Todas o algunas funciones están restringidas» → agrega la cuenta de revisión (ver abajo) |
| Anuncios | No contiene anuncios |
| Clasificación del contenido | Cuestionario IARC, categoría «Todos los demás tipos de apps». Sin violencia, sexo, drogas ni apuestas. «¿Los usuarios pueden interactuar o compartir contenido?» → **Sí** (los negocios publican promociones que ve todo el mundo; se pueden reportar y ocultar). No comparte la ubicación. No vende nada digital. |
| Público objetivo | **18 años o más** (la app no es para niños) |
| Apps de noticias, de gobierno, de salud | No |
| Funciones financieras | «Mi app no ofrece funciones financieras» (las gift cards se pagan en el negocio; la app solo anota el saldo) |
| ID de publicidad | No usa el ID de publicidad |
| Eliminación de la cuenta | Se puede crear cuenta en la app → URL `https://crisio.github.io/sula-rewards/borrar-cuenta.html`. Dentro de la app: Perfil → Borrar mi cuenta |
| Seguridad de los datos | Ver la tabla de abajo |

#### Cuenta de revisión

La misma de la App Store ([app-store.md](app-store.md#cuenta-para-la-revisión)): el correo `REVIEW_EMAIL` entra con el código
fijo `REVIEW_CODE` y no se le manda nada. En **Acceso a la app** pon:

- Nombre: «Cuenta de prueba (correo con código fijo)»
- Usuario: el correo de `REVIEW_EMAIL` · Contraseña: el código de `REVIEW_CODE`
- Instrucciones (en inglés):

> Tap "Entrar con mi correo", type the email above, tap "Enviarme un código" and enter the password above as the 6-digit
> code (no email is sent to this address). The account has a business ("Café de prueba") in "Mi negocio" with a program, a
> promotion and a customer, and a card of its own in "Tarjetas". To try the cashier without a second phone, type the card
> code in "Mi negocio" and tap "Abrir", then "+1 sello". The QR scanner is Google's code scanner (no camera permission).
> The account can be deleted in Perfil → Borrar mi cuenta.

#### Seguridad de los datos

¿Recopila o comparte datos? **Sí**. ¿Cifrados en tránsito? **Sí** (HTTPS). ¿Se pueden borrar? **Sí** (en la app y con la URL
de arriba). No se comparte nada con terceros (Cloudflare, Resend y Google solo prestan el servicio, no cuentan como
«compartir»).

| Tipo de dato | Recopilado | Obligatorio | Para qué |
|---|---|---|---|
| Información personal → Nombre | Sí | Opcional | Funcionalidad de la app (el negocio te reconoce en caja) |
| Información personal → Dirección de correo | Sí | Obligatorio | Funcionalidad, administración de la cuenta |
| Información personal → Número de teléfono | Sí | Opcional | Funcionalidad de la app (tarjetas de fidelidad) |
| Información personal → ID de usuario | Sí | Obligatorio | Administración de la cuenta |
| Información financiera → Historial de compras | Sí | Opcional | Funcionalidad (los montos que registra el negocio para puntos y cashback) |
| Fotos y videos → Fotos | Sí | Opcional | Funcionalidad (el logo que sube el negocio) |
| Actividad en la app → Otro contenido generado por el usuario | Sí | Opcional | Funcionalidad (promociones y reportes) |

No recopila ubicación, contactos, ID del dispositivo ni datos de uso. La cámara la usa el lector de QR de Google Play
services en el teléfono; la app solo recibe el texto del QR.

### 5. Entrar con Google en Android (opcional, pero recomendado)

Sin esto la app funciona con el código por correo y el botón de Google no aparece. Se hace en el mismo proyecto de Google
Cloud de la app de iPhone ([login.md](login.md#google)):

1. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**, nombre «Sula Rewards API». Copia su ID
   de cliente y ponlo en `api/wrangler.jsonc` como `GOOGLE_WEB_CLIENT_ID`; publica la API. (Es el que firma el token que la
   API acepta; el botón aparece solo en la app con `GET /auth/config`.)
2. **Crear credenciales → ID de cliente de OAuth → Android**: paquete `com.cristopherpineda.sularewards` y el **SHA-1 de la
   llave con la que Google firma la app**: en Play Console, **Prueba y lanzamiento → Configuración → Firma de apps**,
   «Certificado de la clave de firma de apps». Crea otro igual con el SHA-1 de tu llave de subida (sale en el paso del CI)
   para probar el `.apk` de prueba o el `.aab` antes de Play.

Si al tocar «Continuar con Google» sale «No se pudo entrar con Google», casi siempre es un SHA-1 que falta en el paso 2.

### 6. Prueba interna y prueba cerrada

1. **Prueba y lanzamiento → Pruebas → Prueba interna → Crear versión**: sube `app-release.aab` (la primera vez acepta
   **Play App Signing**). En **Verificadores** agrega tu correo y abre el enlace de inscripción en tu Android para instalarla
   desde Play.
2. Si tu cuenta es **personal**: **Prueba cerrada → Crear pista**, agrega al menos **12 correos** de personas con Android
   (empleados, clientes de confianza, amigos) y sube la misma versión. Cada uno abre el enlace, acepta y la instala.
   Tienen que seguir inscritos **14 días seguidos**. Luego, en **Panel → Solicitar acceso a producción**, contestas unas
   preguntas sobre la prueba.
3. Con acceso a producción (o directo, si la cuenta es de organización): **Producción → Crear versión**, sube el `.aab`,
   países: **Honduras** (o todos) y **Enviar a revisión**. La revisión suele tardar de 1 a 7 días.

Cada `.aab` de GitHub Actions trae un número de versión nuevo (el número de la corrida), así que siempre se puede subir.

## Ficha de Play Store (Presencia en la tienda → Ficha principal)

- **Nombre:** Sula Rewards
- **Descripción breve** (80 caracteres): Tus tarjetas de lealtad de San Pedro Sula. Y la caja de tu negocio.
- **Descripción completa:**

> Sula Rewards junta en un solo lugar las tarjetas de lealtad de los negocios de San Pedro Sula: sellos, puntos, cashback y
> gift cards. Muestra el QR en caja, mira cuántos sellos te faltan y descubre las promociones de los negocios cerca de ti.
>
> PARA CLIENTES
> • Todas tus tarjetas en la app: agrega la que te dieron en caja con su QR o su código.
> • Únete a un negocio desde Explorar con tu nombre y tu celular.
> • Mira tu saldo, tus premios y tu historial de cada visita.
> • Promociones de los negocios de la ciudad. Puedes reportarlas u ocultar un negocio.
>
> PARA NEGOCIOS
> • Crea tu programa en minutos: «8 cafés = 1 gratis», puntos por cada L 100, cashback en lempiras o gift cards.
> • Escanea la tarjeta del cliente y suma, canjea, cobra o recarga en un toque.
> • Comparte el cartel con el QR del mostrador: tus clientes se unen sin descargar nada y guardan su tarjeta en el Wallet.
> • Manda la tarjeta por WhatsApp, sube tu logo y publica tus promociones.
>
> Sin anuncios. Hecho en San Pedro Sula.

- **Ícono:** `android/store/icon-512.png` · **Gráfico de funciones:** `android/store/feature-graphic.png`
- **Capturas de teléfono:** al menos 2 (mejor 4), tomadas en un Android con la cuenta de revisión: Tarjetas, una tarjeta con
  su QR, Explorar y la caja en Mi negocio (botón de encendido + bajar volumen).
- **Categoría:** Compras · **Correo de contacto:** hola@cristopherpineda.com · **Sitio web:**
  https://crisio.github.io/sula-rewards/

## Cada versión nueva

1. Cambia el código en `android/` y empuja a `main`: el CI compila y deja el `.aab` firmado.
2. En `android/app/build.gradle.kts` sube `versionName` si quieres que la gente vea otro número («1.1»).
3. Play Console → la pista que quieras → **Crear versión** → sube el `.aab` → **Enviar a revisión**.
