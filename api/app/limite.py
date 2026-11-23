"""Límite de consultas por IP (anti-enumeración de cédulas)."""
from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque


class LimitePorIp:
    def __init__(self, maximo_por_minuto: int):
        self._maximo = maximo_por_minuto
        self._marcas: dict[str, deque[float]] = defaultdict(deque)
        self._candado = threading.Lock()

    def segundos_de_espera(self, ip: str) -> int:
        """0 si la consulta se permite (y queda registrada); si no, segundos hasta el próximo cupo."""
        ahora = time.monotonic()
        with self._candado:
            if len(self._marcas) > 10_000:  # no crecer sin límite con muchas IP distintas
                self._marcas = defaultdict(deque, {k: v for k, v in self._marcas.items() if v and v[-1] > ahora - 60})
            marcas = self._marcas[ip]
            while marcas and marcas[0] <= ahora - 60:
                marcas.popleft()
            if len(marcas) >= self._maximo:
                return max(1, math.ceil(marcas[0] + 60 - ahora))
            marcas.append(ahora)
            return 0
