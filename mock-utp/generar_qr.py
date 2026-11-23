"""Genera la imagen del QR del carné UTP de cada estudiante de utp_mock.estudiantes.

Formato del QR (documento de la API, sección 6): Base64 de "<cedula>@utp.ac.pa".
Sirven para probar el escáner: "Subir imagen" en la app, o mostrarlas en otra pantalla frente a la cámara.

Uso:  docker compose run --rm -v ./frontend/demo-qr:/salida mock-utp python generar_qr.py
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

import pymysql
import qrcode

SALIDA = Path(os.environ.get("QR_SALIDA", "/salida"))


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    with pymysql.connect(host=os.environ.get("MYSQL_HOST", "localhost"), port=int(os.environ.get("MYSQL_PORT", 3306)),
                         user=os.environ.get("MYSQL_USER", "utp_mock"),
                         password=os.environ.get("MYSQL_PASSWORD", "utp_mock_local"),
                         database=os.environ.get("MYSQL_DATABASE", "utp_mock"), charset="utf8mb4") as conexion:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT cedula, nombre, activo FROM estudiantes ORDER BY cedula")
            estudiantes = cursor.fetchall()

    for cedula, nombre, activo in estudiantes:
        token = base64.b64encode(f"{cedula}@utp.ac.pa".encode()).decode()
        archivo = SALIDA / f"utp-{'activo' if activo else 'inactivo'}-{cedula}.png"
        qrcode.make(token, box_size=10, border=2).save(archivo)
        print(f"✔ {archivo.name}  ({nombre})")
    print(f"{len(estudiantes)} QR generados.")


if __name__ == "__main__":
    main()
