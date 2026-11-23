"""Mock local del API de Estado de Estudiante UTP (solo librería estándar).

Uso:  python3 mock_server.py [puerto]     (por defecto 8090)
Contrato: openapi.yaml en esta misma carpeta.
"""
import base64
import binascii
import json
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

BASE = "/api/v1"
CLIENT_ID, CLIENT_SECRET = "carnet-qr-tesis", "mock-secret"
TOKEN = "mock-token-123"
TOKEN_SIN_SCOPE = "mock-token-sin-permiso"  # usar para probar 403
PANAMA = timezone(timedelta(hours=-5))
CEDULA_RE = re.compile(r"^[A-Za-z0-9]{1,4}-\d{1,5}-\d{1,6}$")
PERIODO = {"anio": 2026, "semestre": 2}

ESTUDIANTES = {
    "8-123-456": dict(nombre="ANA MARÍA PÉREZ GÓMEZ", activo=True,
                      sede="Campus Víctor Levi Sasso",
                      facultad="Facultad de Ingeniería de Sistemas Computacionales",
                      carrera="Licenciatura en Ingeniería de Software"),
    "8-234-567": dict(nombre="CARLOS ALBERTO RÍOS DE LEÓN", activo=False,
                      sede="Centro Regional de Chiriquí",
                      facultad="Facultad de Ingeniería Civil",
                      carrera="Licenciatura en Ingeniería Civil"),
    "E-8-12345": dict(nombre="LUCÍA FERNANDA TORRES", activo=True,
                      sede="Campus Víctor Levi Sasso",
                      facultad="Facultad de Ingeniería Industrial",
                      carrera="Licenciatura en Ingeniería Industrial"),
}
CEDULA_503 = "8-500-500"


def normalizar(cedula):
    partes = []
    for p in cedula.strip().split("-"):
        partes.append(str(int(p)) if p.isdigit() else p.upper())
    return "-".join(partes)


def decodificar_qr(token):
    try:
        txt = base64.b64decode(token, validate=True).decode("utf8").strip()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    return txt.split("@")[0] if "@" in txt else None


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, headers=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _error(self, status, codigo, mensaje, detalle=None, headers=None):
        body = {"codigo": codigo, "mensaje": mensaje, "trace_id": uuid.uuid4().hex[:12]}
        if detalle:
            body["detalle"] = detalle
        self._send(status, body, headers)

    def _auth_ok(self):
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {TOKEN}":
            return True
        if auth == f"Bearer {TOKEN_SIN_SCOPE}":
            self._error(403, "SIN_PERMISO", "El cliente no tiene permiso para esta consulta.")
        else:
            self._error(401, "NO_AUTENTICADO", "Token ausente o inválido.",
                        headers={"WWW-Authenticate": 'Bearer error="invalid_token"'})
        return False

    def _estado(self, cedula):
        if not CEDULA_RE.match(cedula):
            return self._error(400, "CEDULA_INVALIDA", "Formato de cédula inválido.",
                               "Formato esperado: 8-123-456")
        cedula = normalizar(cedula)
        if cedula == CEDULA_503:
            return self._error(503, "ORIGEN_NO_DISPONIBLE",
                               "El sistema de matrícula no está disponible.",
                               headers={"Retry-After": "30"})
        est = ESTUDIANTES.get(cedula)
        if not est:
            return self._error(404, "ESTUDIANTE_NO_ENCONTRADO", "No se encontró al estudiante.")
        self._send(200, {
            "cedula": cedula,
            "nombre": est["nombre"],
            "activo": est["activo"],
            "matriculado": est["activo"],
            "sede": est["sede"],
            "facultad": est["facultad"],
            "carrera": est["carrera"],
            "periodo": PERIODO,
            "consultado_en": datetime.now(PANAMA).isoformat(timespec="seconds"),
        })

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n).decode("utf8") if n else ""

    def do_GET(self):
        m = re.fullmatch(BASE + r"/estudiantes/([^/]+)/estado", self.path.split("?")[0])
        if not m:
            return self._error(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada.")
        if self._auth_ok():
            self._estado(m.group(1))

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == BASE + "/auth/token":
            form = {k: v[0] for k, v in parse_qs(self._body()).items()}
            if form.get("grant_type") != "client_credentials":
                return self._error(400, "SOLICITUD_INVALIDA",
                                   "grant_type debe ser client_credentials")
            if (form.get("client_id"), form.get("client_secret")) != (CLIENT_ID, CLIENT_SECRET):
                return self._error(401, "NO_AUTENTICADO", "Credenciales de cliente inválidas.")
            return self._send(200, {"access_token": TOKEN, "token_type": "Bearer",
                                    "expires_in": 3600, "scope": "estudiantes.estado:read"})
        if path == BASE + "/estudiantes/validar-carne":
            if not self._auth_ok():
                return
            try:
                token_qr = json.loads(self._body() or "{}").get("token_qr")
            except (json.JSONDecodeError, AttributeError):
                token_qr = None
            cedula = decodificar_qr(token_qr) if isinstance(token_qr, str) else None
            if not cedula:
                return self._error(400, "QR_INVALIDO", "El token QR no se pudo decodificar.")
            return self._estado(cedula)
        self._error(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada.")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    print(f"Mock escuchando en http://localhost:{port}{BASE}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
