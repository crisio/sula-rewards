-- Lo que Apple Wallet reporta en /apple/v1/log (errores al registrarse o al bajar el pase), para poder revisarlo sin
-- abrir los logs de Cloudflare. Se guardan los últimos 200.
CREATE TABLE apple_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
