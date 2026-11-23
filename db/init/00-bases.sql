SET NAMES utf8mb4;
-- Se ejecuta solo la primera vez que arranca el contenedor de MySQL (volumen vacío).
-- Dos bases separadas, como estarán en la realidad:
--   utp_mock  → datos del sistema académico de la UTP (solo los lee el mock de la API UTP)
--   actitud   → datos del sistema ActitUd (comercios, descuentos, validaciones)
-- El backend ActitUd NO tiene permisos sobre utp_mock: los estudiantes solo se consultan por la API.

CREATE DATABASE IF NOT EXISTS utp_mock CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS actitud  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'utp_mock'@'%' IDENTIFIED BY 'utp_mock_local';
GRANT SELECT, INSERT, UPDATE, DELETE ON utp_mock.* TO 'utp_mock'@'%';

CREATE USER IF NOT EXISTS 'actitud'@'%' IDENTIFIED BY 'actitud_local';
GRANT ALL PRIVILEGES ON actitud.* TO 'actitud'@'%';

FLUSH PRIVILEGES;
