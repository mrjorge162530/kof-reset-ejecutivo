-- Clientes del Reset Ejecutivo: una fila por cuaderno (dispositivo)
CREATE TABLE clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  email TEXT,
  whatsapp TEXT,
  dias_completados INTEGER NOT NULL DEFAULT 0,
  respuestas TEXT,               -- JSON con todas las respuestas actuales
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historial: una fila por cada día que el cliente marca como completado
CREATE TABLE envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  dia INTEGER NOT NULL,
  respuestas_dia TEXT,           -- JSON con las respuestas de ese día
  correo_enviado INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_envios_cliente ON envios(cliente_id, dia);
CREATE INDEX idx_clientes_email ON clientes(email);
