-- Sula Rewards: esquema inicial (Cloudflare D1 / SQLite)
-- El control de acceso vive en la API (src/access.ts): cada negocio solo ve sus programas y sus clientes.
-- El dinero se guarda en centavos de lempira (enteros) para no perder ni un centavo al redondear.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Código de 6 dígitos para entrar (uno activo por correo). Se guarda el HMAC, nunca el código.
CREATE TABLE auth_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,      -- epoch ms
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,         -- epoch ms del último envío
  window_start INTEGER NOT NULL,    -- inicio de la ventana de 1 h para limitar envíos
  sends_in_window INTEGER NOT NULL DEFAULT 1
);

-- Sesiones: se guarda el SHA-256 del token, nunca el token.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,      -- epoch ms
  refreshed_at INTEGER NOT NULL     -- epoch ms
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- El comercio. El slug es su página pública para que los clientes se unan: /unete/<slug>
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT,
  city TEXT NOT NULL DEFAULT 'San Pedro Sula',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX businesses_owner_idx ON businesses (owner_id);

-- Un programa de fidelidad: sellos, puntos, cashback o gift card. Cada tipo usa sus columnas (ver src/rules.ts).
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sellos', 'puntos', 'cashback', 'giftcard')),
  name TEXT NOT NULL,
  color TEXT NOT NULL,              -- #rrggbb, el fondo de la tarjeta
  reward TEXT,                      -- sellos y puntos: el premio («Café gratis»)
  stamps_goal INTEGER,              -- sellos: cuántos para el premio
  points_per_100 INTEGER,           -- puntos: cuántos por cada L 100 de compra
  reward_points INTEGER,            -- puntos: cuántos cuesta el premio
  cashback_bp INTEGER,              -- cashback: porcentaje en puntos básicos (500 = 5 %)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX programs_business_idx ON programs (business_id);

-- La tarjeta de un cliente en un programa. El id es el código del QR y de la página pública /tarjeta/<id>.
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,              -- +504XXXXXXXX
  email TEXT,
  stamps INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,       -- premios ganados y aún no canjeados (sellos)
  points INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0, -- saldo de cashback o de la gift card
  apple_token TEXT NOT NULL,        -- authenticationToken del pase de Apple Wallet
  google_saved INTEGER NOT NULL DEFAULT 0,  -- pidió guardarla en Google Wallet: se actualiza allá en cada cambio
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at INTEGER NOT NULL,      -- epoch ms del último cambio (Apple pregunta «¿qué cambió desde…?»)
  UNIQUE (program_id, phone)
);

-- Cada sello, compra, canje o recarga. Los deltas son lo que sumó o restó en la tarjeta.
CREATE TABLE movements (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('alta', 'sello', 'compra', 'canje', 'uso', 'recarga')),
  stamps INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  cents INTEGER NOT NULL DEFAULT 0,
  purchase_cents INTEGER,           -- monto de la compra que generó puntos o cashback
  by_user TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX movements_card_idx ON movements (card_id, created_at);

-- Teléfonos con el pase de Apple Wallet: Apple los registra para preguntar por cambios (ver src/apple.ts).
CREATE TABLE apple_registrations (
  device_id TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (device_id, card_id)
);
CREATE INDEX apple_registrations_card_idx ON apple_registrations (card_id);
