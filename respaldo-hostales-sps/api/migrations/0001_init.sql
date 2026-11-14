-- Hostales SPS: esquema inicial.
-- El dinero se guarda en centavos de lempira (L 1,400.00 = 140000).
-- Las fechas de trabajo son 'AAAA-MM-DD' en hora de Honduras; los instantes, milisegundos desde 1970 (UTC).

CREATE TABLE hostales (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  precio_sencilla INTEGER NOT NULL,
  precio_doble INTEGER NOT NULL,
  precio_triple INTEGER NOT NULL,
  precio_hora INTEGER,                         -- sugerido para el alquiler por hora (NULL: lo escribe recepción)
  descuento_larga INTEGER NOT NULL DEFAULT 15000, -- descuento por noche en estadías de más de un mes
  hora_dia TEXT NOT NULL DEFAULT '07:00',      -- empieza el turno de día (y cambia el día de trabajo)
  hora_noche TEXT NOT NULL DEFAULT '19:00',    -- empieza el turno de noche
  hora_salida TEXT NOT NULL DEFAULT '11:30',   -- salida automática de las estadías por noche
  version INTEGER NOT NULL DEFAULT 0           -- sube con cada cambio: los teléfonos se actualizan solos
);

CREATE TABLE habitaciones (
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  numero TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'Sencilla' CHECK (tipo IN ('Sencilla', 'Doble', 'Triple')),
  orden INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  limpia_en INTEGER,                           -- última vez que se marcó lista después de una salida
  PRIMARY KEY (hostal_id, numero)
);

CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('dueno', 'recepcion')),
  hostal_id TEXT REFERENCES hostales(id),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER,
  creado_en INTEGER NOT NULL
);

CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  creada_en INTEGER NOT NULL,
  expira_en INTEGER NOT NULL
);
CREATE INDEX sesiones_usuario ON sesiones(usuario_id);

CREATE TABLE ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL -- JSON
);

CREATE TABLE empresas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  alias TEXT NOT NULL DEFAULT '[]', -- JSON: otros nombres con que aparece (ej. Pepsi = Emsula)
  activa INTEGER NOT NULL DEFAULT 1,
  creada_en INTEGER NOT NULL
);

CREATE TABLE turnos (
  id TEXT PRIMARY KEY,
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('dia', 'noche')),
  usuario_id TEXT REFERENCES usuarios(id),
  abierto_en INTEGER NOT NULL,
  cerrado_en INTEGER,
  cerrado_por TEXT REFERENCES usuarios(id),
  notas TEXT NOT NULL DEFAULT '',
  UNIQUE (hostal_id, fecha, tipo)
);
CREATE INDEX turnos_abiertos ON turnos(hostal_id) WHERE cerrado_en IS NULL;

CREATE TABLE caja_movimientos (
  id TEXT PRIMARY KEY,
  turno_id TEXT NOT NULL REFERENCES turnos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entregado', 'depositado')),
  monto INTEGER NOT NULL,
  cuenta TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  entregado_por TEXT NOT NULL DEFAULT '',
  recibido_por TEXT NOT NULL DEFAULT '',
  foto_id TEXT,
  creado_en INTEGER NOT NULL
);
CREATE INDEX caja_turno ON caja_movimientos(turno_id);

CREATE TABLE dias (
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  fecha TEXT NOT NULL,
  cerrado_en INTEGER,
  cerrado_por TEXT REFERENCES usuarios(id),
  revisado_en INTEGER,      -- el dueño revisó el cuadre de caja
  revisado_por TEXT REFERENCES usuarios(id),
  nota TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (hostal_id, fecha)
);

CREATE TABLE facturas (
  id TEXT PRIMARY KEY,
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  empresa_id TEXT NOT NULL REFERENCES empresas(id),
  numero TEXT NOT NULL DEFAULT '',
  desde TEXT NOT NULL,
  hasta TEXT NOT NULL,
  noches INTEGER NOT NULL,
  monto INTEGER NOT NULL,
  creada_en INTEGER NOT NULL,
  creada_por TEXT REFERENCES usuarios(id),
  pagada_en INTEGER,
  pagada_por TEXT REFERENCES usuarios(id)
);

-- Cada noche vendida (o alquiler por hora) es un registro: la misma línea del «Reporte de ventas diarias».
CREATE TABLE registros (
  id TEXT PRIMARY KEY,
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  fecha TEXT NOT NULL,                         -- noche (o día de trabajo del alquiler por hora)
  habitacion TEXT NOT NULL,
  modo TEXT NOT NULL DEFAULT 'noche' CHECK (modo IN ('noche', 'hora')),
  huesped TEXT NOT NULL,
  empresa_id TEXT REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('Sencilla', 'Doble', 'Triple')),
  precio INTEGER,                              -- centavos; en crédito, el precio de lista
  pago TEXT CHECK (pago IN ('efectivo', 'tarjeta', 'transferencia', 'credito', 'otros')),
  larga INTEGER NOT NULL DEFAULT 0,            -- estadía de más de un mes (descuento por noche)
  estadia_id TEXT NOT NULL,                    -- une las noches seguidas de la misma estadía
  nota TEXT NOT NULL DEFAULT '',
  foto_id TEXT,                                -- voucher de tarjeta o comprobante
  entrada_en INTEGER NOT NULL,
  salida_en INTEGER,                           -- salida anticipada o cierre del alquiler por hora
  cobro_turno_id TEXT REFERENCES turnos(id),   -- turno en que se registró el pago
  factura_id TEXT REFERENCES facturas(id),
  origen TEXT NOT NULL DEFAULT 'recepcion' CHECK (origen IN ('recepcion', 'copiado', 'importado', 'dueno')),
  creado_por TEXT REFERENCES usuarios(id),
  creado_en INTEGER NOT NULL,
  editado_por TEXT REFERENCES usuarios(id),
  editado_en INTEGER,
  anulado_en INTEGER,
  anulado_por TEXT REFERENCES usuarios(id),
  motivo_anulacion TEXT NOT NULL DEFAULT ''
);
-- Una habitación no puede tener dos huéspedes la misma noche.
CREATE UNIQUE INDEX registros_una_noche ON registros(hostal_id, fecha, habitacion) WHERE modo = 'noche' AND anulado_en IS NULL;
CREATE INDEX registros_fecha ON registros(hostal_id, fecha);
CREATE INDEX registros_estadia ON registros(estadia_id);
CREATE INDEX registros_horas_abiertas ON registros(hostal_id) WHERE modo = 'hora' AND salida_en IS NULL AND anulado_en IS NULL;
CREATE INDEX registros_credito ON registros(empresa_id) WHERE pago = 'credito' AND anulado_en IS NULL;
CREATE INDEX registros_factura ON registros(factura_id);

CREATE TABLE tareas (
  id TEXT PRIMARY KEY,
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  texto TEXT NOT NULL,
  usuario_id TEXT REFERENCES usuarios(id),     -- NULL: cualquier recepcionista
  turno TEXT CHECK (turno IN ('dia', 'noche')), -- NULL: cualquier turno
  fecha TEXT,                                  -- desde qué día aparece (NULL: desde ya)
  creada_por TEXT REFERENCES usuarios(id),
  creada_en INTEGER NOT NULL,
  hecha_en INTEGER,
  hecha_por TEXT REFERENCES usuarios(id),
  nota TEXT NOT NULL DEFAULT ''
);
CREATE INDEX tareas_hostal ON tareas(hostal_id, hecha_en);

CREATE TABLE fotos (
  id TEXT PRIMARY KEY,
  hostal_id TEXT NOT NULL REFERENCES hostales(id),
  tipo TEXT NOT NULL,
  mime TEXT NOT NULL,
  datos BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  creada_por TEXT REFERENCES usuarios(id),
  creada_en INTEGER NOT NULL
);

CREATE TABLE historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostal_id TEXT,
  usuario_id TEXT,
  usuario_nombre TEXT NOT NULL DEFAULT '',
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  detalle TEXT NOT NULL DEFAULT '{}', -- JSON: antes / después
  creado_en INTEGER NOT NULL
);
CREATE INDEX historial_fecha ON historial(creado_en);
CREATE INDEX historial_hostal ON historial(hostal_id, creado_en);

-- Datos iniciales ---------------------------------------------------------------------------------

INSERT INTO hostales (id, nombre, orden, precio_sencilla, precio_doble, precio_triple) VALUES
  ('prado-alto', 'Hostal Prado Alto', 1, 140000, 170000, 200000),
  ('prokinto', 'ProKinto', 2, 140000, 170000, 200000);

INSERT INTO habitaciones (hostal_id, numero, orden) VALUES
  ('prado-alto', '1', 1), ('prado-alto', '2', 2), ('prado-alto', '3', 3), ('prado-alto', '4', 4),
  ('prado-alto', '5', 5), ('prado-alto', '6', 6), ('prado-alto', '7', 7), ('prado-alto', '8', 8),
  ('prado-alto', '9', 9), ('prado-alto', '10', 10), ('prado-alto', '11', 11), ('prado-alto', '12', 12),
  ('prado-alto', '13', 13), ('prado-alto', '14', 14),
  ('prokinto', '501', 1), ('prokinto', '502', 2), ('prokinto', '503', 3), ('prokinto', '504', 4),
  ('prokinto', '505', 5), ('prokinto', '506', 6), ('prokinto', '507', 7), ('prokinto', '508', 8),
  ('prokinto', '509', 9), ('prokinto', '510', 10), ('prokinto', '511', 11), ('prokinto', '2C', 12);

INSERT INTO empresas (id, nombre, alias, creada_en) VALUES
  ('emsula', 'Emsula', '["Pepsi"]', 0),
  ('grupo-comidas', 'Grupo Comidas', '[]', 0);

INSERT INTO ajustes (clave, valor) VALUES
  ('recepcion_ve_totales', 'true'),
  ('recepcion_ve_mes', 'false'),
  ('bloqueo_minutos', '10'),
  ('cuentas_banco', '[]');
