# Entrar con Apple, con Google o con correo

La app de iOS ofrece las tres. La API (`api/src/oauth.ts`) verifica el token que firma Apple o Google con sus llaves
públicas, y crea la cuenta la primera vez (o entra a la que ya tiene ese correo). El código por correo funciona igual que
siempre.

## Apple (ya funciona)

`APPLE_SIGNIN_AUDIENCES` en `api/wrangler.jsonc` ya trae el Bundle ID de la app (`com.cristopherpineda.sularewards`), y
la app trae la capacidad **Sign in with Apple** (`ios/SulaRewards.entitlements`). Con la firma automática, Xcode la activa
en el App ID la primera vez que compilas para un iPhone o archivas.

### Revocar el acceso al borrar la cuenta (lo pide la App Store)

Cuando alguien que entró con Apple borra su cuenta, Apple pide revocar el acceso de la app. Para eso la API necesita una
llave de Sign in with Apple:

1. En https://developer.apple.com/account/resources/authkeys/list toca **+**, ponle nombre «Sula Rewards Sign in»,
   marca **Sign in with Apple**, toca **Configure** y elige el App ID `com.cristopherpineda.sularewards`.
   **Continue → Register → Download**. Baja un archivo `AuthKey_XXXXXXXXXX.p8` (solo se puede bajar una vez).
2. El **Key ID** son los 10 caracteres del nombre del archivo (`XXXXXXXXXX`). Ponlo en `api/wrangler.jsonc` como
   `APPLE_SIGNIN_KEY_ID`.
3. En GitHub, **Settings → Secrets and variables → Actions → New repository secret**: `APPLE_SIGNIN_KEY` con el
   contenido del `.p8` (en la Mac: `pbcopy < ~/Downloads/AuthKey_XXXXXXXXXX.p8` y pegar).
4. Vuelve a publicar la API.

Sin la llave todo funciona: solo no se revoca el acceso en Apple al borrar la cuenta (la cuenta sí se borra).

## Google

1. En https://console.cloud.google.com crea un proyecto (o usa uno tuyo) y ve a **APIs y servicios → Pantalla de
   consentimiento de OAuth**: tipo **Externo**, nombre «Sula Rewards», tu correo de soporte, y en **Dominios
   autorizados** `crisio.github.io` y `cristopherpineda.com`. Pon la política de privacidad
   (https://crisio.github.io/sula-rewards/privacidad.html). Los permisos que pide son solo `openid`, `email` y
   `profile`, así que no hace falta verificación. Publícala (**Publicar app**) para que pueda entrar cualquiera.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → iOS**: Bundle ID `com.cristopherpineda.sularewards`.
   Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
3. Ponlo en `api/wrangler.jsonc` como `GOOGLE_IOS_CLIENT_ID` y publica la API.

La app lo lee de la API (`GET /auth/config`), así que el botón **Continuar con Google** aparece solo, sin volver a
compilar la app. No usa el SDK de Google: hace el inicio de sesión con PKCE en la hoja del sistema
(`ios/SulaRewards/Core/Auth.swift`).

Si algún día el panel web también tiene «Entrar con Google», crea otro ID de cliente de tipo **Aplicación web** (con
`https://crisio.github.io` como origen) y ponlo en `GOOGLE_WEB_CLIENT_ID`.

## Correo

Igual que siempre: un código de 6 dígitos que manda Resend desde `EMAIL_FROM`. Para la revisión de Apple hay una cuenta
con código fijo (`REVIEW_EMAIL` y `REVIEW_CODE`, ver [app-store.md](app-store.md)).
