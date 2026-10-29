# Sula Rewards

Tarjetas de fidelidad en **Apple Wallet** y **Google Wallet** para los comercios de **San Pedro Sula, Honduras**:
sellos, puntos, cashback y gift cards. El cliente se une escaneando un QR en el mostrador, guarda su tarjeta en el
Wallet sin descargar ninguna app, y en caja le suman con el teléfono.

**App:** https://crisio.github.io/sula-rewards/

## Qué hace hoy (v0.1)

Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md).

- **Cuatro tipos de programa:**
  - **Sellos:** «8 cafés = 1 gratis». Al completar la meta se suma un premio y los sellos vuelven a empezar.
  - **Puntos:** N puntos por cada L 100 de compra; el premio cuesta X puntos.
  - **Cashback:** un % de cada compra regresa como saldo en lempiras para la próxima visita.
  - **Gift cards:** se venden en caja con saldo, se cobran con el QR y se pueden recargar.
- **Panel del comercio** (entra con un código por correo, sin contraseña): crea el negocio y sus programas con el color
  de su marca, da de alta clientes, escanea su tarjeta con la cámara (o escribe el código), suma sellos, puntos o
  cashback, canjea premios, cobra y recarga, y ve el historial de cada tarjeta.
- **Cartel para el mostrador:** un QR que lleva a `/unete/<negocio>`, listo para imprimir.
- **Página para unirse:** el cliente pone su nombre y celular (+504) y sale su tarjeta. Un número = una tarjeta por
  programa (si ya tiene, la recupera en caja).
- **Tarjeta del cliente** (`/tarjeta/<código>`): su estado, el QR para caja y los botones **Agregar a Apple Wallet** y
  **Guardar en Google Wallet**. El teléfono recuerda las tarjetas que ha abierto.
- **Apple Wallet:** el `.pkpass` lo arma y lo firma la API (PKCS#7 con WebCrypto, sin librerías), con la tira de
  sellos dibujada como en la tarjeta. El iPhone se registra con el servicio web y baja la versión nueva al actualizar.
- **Google Wallet:** enlace «Guardar en Google Wallet» con el pase firmado; después, cada sello o compra se manda a
  Google y la tarjeta se actualiza sola en el teléfono.
- **Mandar la tarjeta por WhatsApp** desde caja, con el mensaje ya escrito.
- **Hecho para Honduras:** lempiras (el dinero se guarda en centavos), celulares de 8 dígitos y hora de Honduras.

## Arquitectura (todo en planes gratis)

```
Teléfono (React + Vite) ──► GitHub Pages (crisio.github.io/sula-rewards)
        │  token de sesión (Bearer)
        ▼
Cloudflare Worker  sula-rewards-api (Hono)     ← api/
   ├─ D1 (SQLite)   usuarios, negocios, programas, tarjetas, movimientos
   ├─ Resend        códigos de acceso por correo
   ├─ Apple Wallet  .pkpass firmado + servicio web de actualizaciones (/apple/v1/…)
   └─ Google Wallet pases genéricos (JWT) y actualizaciones por su API
```

```
src/                 la web: página de inicio, panel del comercio, /unete y /tarjeta
api/src/             la API
  rules.ts           las reglas de cada tipo de programa (qué se gana y cómo se ve)
  cards.ts           alta de tarjetas y movimientos (sello, compra, canje, uso, recarga)
  apple.ts, der.ts   el .pkpass y su firma
  google.ts          Google Wallet
  images.ts          el ícono y la tira de sellos (PNG)
api/migrations/      el esquema de la base
docs/wallet.md       cómo conseguir los certificados de Apple y la cuenta de Google
```

## Correr en local

```bash
npm install
npm --prefix api install
cp .env.example .env.local
cp api/.dev.vars.example api/.dev.vars
npm --prefix api run db:migrate:local
```

Luego, en dos terminales:

```bash
npm --prefix api run dev
```

```bash
npm run dev
```

La app abre en http://localhost:5173 y los códigos de acceso se imprimen en la terminal de la API (`EMAIL_MODE=log`).

Pruebas de la API:

```bash
npm test
```

## Publicar

### 1. La web en GitHub Pages

1. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Cada push a `main` publica la web (workflow `Deploy a GitHub Pages`). La primera vez, si corrió antes de activar
   Pages, vuelve a correrlo desde **Actions → Deploy a GitHub Pages → Run workflow**.

Sin la API conectada se ve la página de inicio, y el panel avisa que falta conectarla.

### 2. La API en Cloudflare

1. En Cloudflare, crea un token de API con la plantilla **Edit Cloudflare Workers** y permiso de **D1: Edit**.
2. En GitHub, **Settings → Secrets and variables → Actions → Secrets**, agrega:
   - `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`
   - `AUTH_SECRET`: 32 caracteres o más al azar (`openssl rand -base64 48`)
   - `RESEND_API_KEY` para mandar los códigos (o `GMAIL_USER` y `GMAIL_APP_PASSWORD` con `EMAIL_MODE: "smtp"`).
     El remitente está en `api/wrangler.jsonc` (`EMAIL_FROM`) y su dominio debe estar verificado en Resend.
3. Corre **Actions → Deploy API (Cloudflare) → Run workflow**. La primera vez crea la base de datos y la migra.

### 3. Conectar la web con la API

En **Settings → Secrets and variables → Actions → Variables**, crea `VITE_API_URL` con la URL del Worker
(p. ej. `https://sula-rewards-api.<tu-cuenta>.workers.dev`) y vuelve a correr el deploy de la web.

### 4. Apple Wallet y Google Wallet

Ver [docs/wallet.md](docs/wallet.md). Sin esa configuración todo funciona igual: la tarjeta vive en la web con su QR y
los botones de Wallet no aparecen.

## Pendiente

- **Avisos push de Apple Wallet (APNs):** hoy el iPhone baja la versión nueva al actualizar el pase; con APNs se
  actualizaría solo al momento, como Google.
- **Cajeros con su propia cuenta** (hoy entra solo el dueño del negocio).
- Anular un movimiento hecho por error, y reportes por día y por cajero.
- Los botones oficiales «Add to Apple Wallet» y «Add to Google Wallet» (Apple y Google piden usar sus insignias).
- Límite de altas por hora en `/unete`, términos de uso y aviso de privacidad.
- Dominio propio (con él, `VITE_BASE=/` y actualizar `APP_URL` y `ALLOWED_ORIGINS` en `api/wrangler.jsonc`).
