-- Sula Rewards: la app también es para los clientes (sus tarjetas de varios negocios), con entrada por Apple o Google,
-- el logo de cada negocio y promociones que se ven en «Explorar». Todo es aditivo: la API anterior sigue funcionando.

-- Entrar con Apple o Google: el «sub» de cada proveedor apunta a un usuario (el mismo si el correo coincide).
CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT,
  -- Apple: el refresh token, para revocar el acceso cuando la persona borra su cuenta (lo pide la App Store).
  refresh_token TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user_idx ON identities (user_id);

-- El celular del usuario como cliente (+504XXXXXXXX): con él se une a los programas desde la app.
ALTER TABLE users ADD COLUMN phone TEXT;

-- La tarjeta guardada en la cuenta de un cliente. Si el cliente borra su cuenta, la tarjeta sigue en el negocio.
ALTER TABLE cards ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX cards_user_idx ON cards (user_id);
CREATE INDEX cards_email_idx ON cards (email);

-- El logo del negocio: el que subió (360×360, sobre blanco) y las versiones para el pase de Apple Wallet (30, 60 y
-- 90 pixeles, con esquinas redondeadas). logo_version cambia en cada subida para que las URL no queden en caché.
CREATE TABLE business_logos (
  business_id TEXT PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
  original BLOB NOT NULL,
  pass_1x BLOB NOT NULL,
  pass_2x BLOB NOT NULL,
  pass_3x BLOB NOT NULL
);
ALTER TABLE businesses ADD COLUMN logo_version INTEGER;

-- Promociones de los negocios: se ven en «Explorar» de la app mientras estén activas y no hayan vencido.
CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  ends_on TEXT,                     -- AAAA-MM-DD, hora de Honduras, incluido; NULL = sin fecha
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX promotions_business_idx ON promotions (business_id);
CREATE INDEX promotions_feed_idx ON promotions (active, created_at);
