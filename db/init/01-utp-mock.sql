SET NAMES utf8mb4;
-- Perfiles estudiantiles SIMULADOS del sistema académico de la UTP.
-- Los lee el mock de la API UTP (mock-utp/servidor.py) en cada consulta:
-- agregar o cambiar una fila se refleja de inmediato, sin reiniciar nada.
USE utp_mock;

CREATE TABLE IF NOT EXISTS estudiantes (
  cedula          VARCHAR(20)  NOT NULL PRIMARY KEY COMMENT 'normalizada, sin ceros a la izquierda: 8-123-456',
  nombre          VARCHAR(120) NOT NULL,
  activo          BOOLEAN      NOT NULL COMMENT 'matriculado en el periodo vigente',
  sede            VARCHAR(120) NULL,
  facultad        VARCHAR(120) NULL,
  carrera         VARCHAR(150) NULL,
  periodo_anio    SMALLINT     NOT NULL DEFAULT 2026,
  periodo_semestre TINYINT     NOT NULL DEFAULT 2 COMMENT '1, 2 o 3 (verano)',
  actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_semestre CHECK (periodo_semestre BETWEEN 1 AND 3)
);

-- Los mismos 3 estudiantes del contrato (api-estudiante-mock/README.md).
INSERT INTO estudiantes (cedula, nombre, activo, sede, facultad, carrera) VALUES
  ('8-123-456', 'ANA MARÍA PÉREZ GÓMEZ', TRUE,  'Campus Víctor Levi Sasso',   'Facultad de Ingeniería de Sistemas Computacionales', 'Licenciatura en Ingeniería de Software'),
  ('8-234-567', 'CARLOS ALBERTO RÍOS DE LEÓN', FALSE, 'Centro Regional de Chiriquí', 'Facultad de Ingeniería Civil', 'Licenciatura en Ingeniería Civil'),
  ('E-8-12345', 'LUCÍA FERNANDA TORRES', TRUE,  'Campus Víctor Levi Sasso',   'Facultad de Ingeniería Industrial', 'Licenciatura en Ingeniería Industrial');
