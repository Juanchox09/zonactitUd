"""Lectura del QR del carné desde una foto (OpenCV), para cuando el comercio sube una imagen
en lugar de usar la cámara del navegador."""
from __future__ import annotations

import cv2
import numpy as np

TAMANO_MAXIMO = 5 * 1024 * 1024  # 5 MB
_LADO_MAXIMO = 1600  # se reduce antes de buscar el QR: más rápido y no pierde lectura


def leer_qr(contenido: bytes) -> str | None:
    """Texto del primer QR encontrado en la imagen, o None si no se pudo leer ninguno.

    Lanza ValueError si los bytes no son una imagen válida.
    """
    imagen = cv2.imdecode(np.frombuffer(contenido, dtype=np.uint8), cv2.IMREAD_COLOR)
    if imagen is None:
        raise ValueError("El archivo no es una imagen válida.")

    alto, ancho = imagen.shape[:2]
    escala = _LADO_MAXIMO / max(alto, ancho)
    if escala < 1:
        imagen = cv2.resize(imagen, (int(ancho * escala), int(alto * escala)), interpolation=cv2.INTER_AREA)

    detector = cv2.QRCodeDetector()
    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    # Fotos con poca luz o reflejos: se reintenta en escala de grises y binarizada.
    _, binaria = cv2.threshold(gris, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for variante in (imagen, gris, binaria):
        texto, puntos, _ = detector.detectAndDecode(variante)
        if puntos is not None and texto:
            return texto.strip()
    return None
