import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TITULARES = `
  CREATE TABLE IF NOT EXISTS titulares (
    id             INTEGER PRIMARY KEY,
    cedula         TEXT NOT NULL UNIQUE,   -- normalizada (8-123-456)
    carnet         TEXT NOT NULL UNIQUE,   -- en mayúsculas (2023-00451)
    nombre         TEXT NOT NULL,
    tipo           TEXT NOT NULL CHECK (tipo IN ('Estudiante', 'Colaborador', 'Egresado')),
    unidad         TEXT NOT NULL,
    programa       TEXT,
    estado         TEXT NOT NULL CHECK (estado IN ('ACTIVO', 'INACTIVO')),
    vigente_hasta  TEXT NOT NULL CHECK (vigente_hasta GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    motivo         TEXT,
    actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`;

// Bitácora de consultas. No guarda la cédula, el código ni el token consultado.
const VALIDACIONES = `
  CREATE TABLE validaciones (
    id            INTEGER PRIMARY KEY,
    criterio      TEXT NOT NULL CHECK (criterio IN ('cedula', 'carnet', 'qr')),
    fuente        TEXT NOT NULL CHECK (fuente IN ('local', 'utp')),
    resultado     TEXT NOT NULL CHECK (resultado IN ('ACTIVO', 'INACTIVO', 'NO_ENCONTRADO', 'NO_VERIFICADO')),
    titular_id    INTEGER REFERENCES titulares (id) ON DELETE SET NULL,
    consultado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX idx_validaciones_fecha ON validaciones (consultado_en);
`;

const VERSION_ESQUEMA = 1;

/** Abre (o crea) la base de datos y aplica el esquema y sus migraciones. Usa ':memory:' para pruebas. */
export function abrirBaseDatos(ruta: string): DatabaseSync {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(TITULARES);
  migrar(db);
  return db;
}

function migrar(db: DatabaseSync): void {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version >= VERSION_ESQUEMA) return;

  const existeV0 = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'validaciones'").get();
  db.exec('BEGIN');
  try {
    if (existeV0) {
      // v0 → v1: se agregan el criterio "qr", la fuente y el resultado NO_ENCONTRADO / NO_VERIFICADO.
      db.exec('ALTER TABLE validaciones RENAME TO validaciones_v0; DROP INDEX IF EXISTS idx_validaciones_fecha;');
      db.exec(VALIDACIONES);
      db.exec(`
        INSERT INTO validaciones (id, criterio, fuente, resultado, titular_id, consultado_en)
        SELECT id, criterio, 'local', COALESCE(estado, 'NO_ENCONTRADO'), titular_id, consultado_en FROM validaciones_v0;
        DROP TABLE validaciones_v0;
      `);
    } else {
      db.exec(VALIDACIONES);
    }
    db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
