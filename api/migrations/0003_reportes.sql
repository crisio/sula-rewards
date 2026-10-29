-- Reportes de promociones (la App Store pide poder reportar lo que publican otros, regla 1.2). Con 3 reportes de
-- personas distintas la promoción se pausa sola hasta que alguien la revise.
CREATE TABLE promotion_reports (
  promotion_id TEXT NOT NULL REFERENCES promotions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (promotion_id, user_id)
);
