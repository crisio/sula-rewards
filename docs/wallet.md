# Apple Wallet y Google Wallet

Las dos son opcionales e independientes: la API muestra el botón de cada una solo cuando tiene su configuración.

## Apple Wallet

Se necesita una cuenta del **Apple Developer Program** (US$99 al año).

1. **Pass Type ID:** en https://developer.apple.com/account/resources/identifiers/list/passTypeId crea
   `pass.com.cristopherpineda.sularewards` (el que está en `api/wrangler.jsonc`).
2. **Llave y solicitud de certificado** (en tu computadora):

   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass-key.pem -out pass.csr -subj "/CN=Sula Rewards"
   ```

3. En el Pass Type ID, **Create Certificate**, sube `pass.csr` y baja `pass.cer`. Conviértelo a PEM:

   ```bash
   openssl x509 -inform DER -in pass.cer -out pass-cert.pem
   ```

4. **Certificado intermedio de Apple (WWDR G4):**

   ```bash
   curl -sO https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   ```

   ```bash
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
   ```

5. En `api/wrangler.jsonc`, pon `APPLE_PASS_TYPE_ID` (el del paso 1) y `APPLE_TEAM_ID` (arriba a la derecha en tu
   cuenta de Apple Developer). No son secretos.
6. En GitHub (**Settings → Secrets and variables → Actions → Secrets**), pega el contenido completo de cada archivo:
   - `APPLE_PASS_CERT` ← `pass-cert.pem`
   - `APPLE_PASS_KEY` ← `pass-key.pem` (sin contraseña; si la exportaste de un .p12 usa `-nodes`)
   - `APPLE_WWDR_CERT` ← `wwdr.pem`
7. Vuelve a publicar la API.

**Cómo se actualiza:** el pase trae `webServiceURL` (la API) y un token propio. Al guardarlo, el iPhone se registra
(`/apple/v1/devices/…`) y, al actualizar el pase, pregunta qué cambió y baja la versión nueva. Para que se actualice
solo al momento falta mandar el aviso por APNs (ver «Pendiente» en el README).

## Google Wallet

1. En la **Google Pay & Wallet Console** (https://pay.google.com/business/console) crea la cuenta de emisor de la
   **Google Wallet API** y copia el **Issuer ID**.
2. En **Google Cloud**: crea un proyecto, activa la **Google Wallet API**, crea una **cuenta de servicio** y bájale
   una llave JSON.
3. En la consola de Google Wallet, **Users → Invite a user**: agrega el correo de la cuenta de servicio con acceso de
   desarrollador.
4. En `api/wrangler.jsonc`, pon `GOOGLE_WALLET_ISSUER_ID`.
5. En GitHub, agrega los secretos (del JSON de la cuenta de servicio):
   - `GOOGLE_SA_EMAIL` ← `client_email`
   - `GOOGLE_SA_KEY` ← `private_key` (tal cual, con los `\n`; la API los entiende)
6. Vuelve a publicar la API.

**Modo demo:** las cuentas nuevas empiezan en modo demo y solo los usuarios de prueba que agregues en la consola pueden
guardar pases. Para abrirlo a todos, pide el acceso de publicación en la consola.

**Cómo se actualiza:** al pedir el enlace de guardado la tarjeta queda marcada, y después de cada movimiento la API
manda el pase completo a `walletobjects.googleapis.com`; el teléfono lo actualiza solo.
