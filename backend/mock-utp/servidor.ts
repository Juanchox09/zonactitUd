/**
 * Mock de la API de Estado de Estudiante UTP en Node (sin dependencias).
 * Equivale a ../../api-estudiante-mock/mock_server.py y sigue el mismo contrato (openapi.yaml),
 * con dos agregados sugeridos en la sección 7 del documento:
 *   - 8-600-600 tarda 6 s en responder (escenario para probar el timeout de 5 s).
 *   - Latencia simulada opcional (MOCK_LATENCIA_MS, p. ej. "150-400").
 *
 * Los estudiantes se leen de mock-utp/estudiantes.json en cada consulta:
 * se pueden agregar, quitar o cambiar sin reiniciar el mock.
 *
 * Uso:  npm run mock:utp            → http://localhost:8090/api/v1
 *       node mock-utp/servidor.ts 9000
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = '/api/v1';
export const CREDENCIALES_MOCK = { clientId: 'carnet-qr-tesis', clientSecret: 'mock-secret' };
const TOKEN = 'mock-token-123';
const TOKEN_SIN_SCOPE = 'mock-token-sin-permiso';
const CEDULA_RE = /^[A-Za-z0-9]{1,4}-\d{1,5}-\d{1,6}$/;
const PERIODO = { anio: 2026, semestre: 2 };
const CEDULA_503 = '8-500-500';
const CEDULA_LENTA = '8-600-600';
const LIMITE_POR_MINUTO = 60;

export const ARCHIVO_ESTUDIANTES = fileURLToPath(new URL('./estudiantes.json', import.meta.url));

interface EstudianteMock {
  cedula: string;
  nombre: string;
  activo: boolean;
  sede?: string;
  facultad?: string;
  carrera?: string;
  periodo?: { anio: number; semestre: number };
}

/**
 * Lee y valida el archivo de estudiantes. Si tiene errores, se informan en consola
 * y se siguen usando los últimos datos válidos.
 */
function crearLectorEstudiantes(ruta: string) {
  let ultimos = new Map<string, EstudianteMock>();
  let ultimoError = '';
  return (): Map<string, EstudianteMock> => {
    try {
      const datos: unknown = JSON.parse(readFileSync(ruta, 'utf8'));
      if (!Array.isArray(datos)) throw new Error('el archivo debe contener una lista [ ... ]');
      const mapa = new Map<string, EstudianteMock>();
      datos.forEach((d: Partial<EstudianteMock>, i) => {
        const donde = `estudiante ${i + 1}`;
        if (typeof d?.cedula !== 'string' || !CEDULA_RE.test(d.cedula.trim())) throw new Error(`${donde}: "cedula" no válida (ej. 8-123-456)`);
        if (typeof d.nombre !== 'string' || !d.nombre.trim()) throw new Error(`${donde}: falta "nombre"`);
        if (typeof d.activo !== 'boolean') throw new Error(`${donde}: "activo" debe ser true o false`);
        const cedula = normalizar(d.cedula);
        if (mapa.has(cedula)) throw new Error(`${donde}: la cédula ${cedula} está repetida`);
        mapa.set(cedula, { ...d, cedula, nombre: d.nombre.trim().toUpperCase() } as EstudianteMock);
      });
      if (ultimoError) console.log(`✔ ${ruta} corregido: ${mapa.size} estudiantes.`);
      ultimoError = '';
      ultimos = mapa;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (mensaje !== ultimoError) console.error(`✘ Error en ${ruta}: ${mensaje}. Se usan los datos anteriores.`);
      ultimoError = mensaje;
    }
    return ultimos;
  };
}

export interface OpcionesMock {
  /** Demora del escenario lento (8-600-600). Por defecto 6000 ms. */
  retardoLentoMs?: number;
  /** Latencia [mín, máx] en ms agregada a cada respuesta. */
  latenciaMs?: [number, number];
  /** Archivo JSON con los estudiantes. Por defecto mock-utp/estudiantes.json. */
  archivoEstudiantes?: string;
}

function normalizar(cedula: string): string {
  return cedula
    .trim()
    .split('-')
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p.toUpperCase()))
    .join('-');
}

function decodificarQr(token: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token) || token.length % 4 !== 0) return null;
  const texto = Buffer.from(token, 'base64').toString('utf8').trim();
  return texto.includes('@') ? texto.split('@')[0]! : null;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function crearMockUtp(opciones: OpcionesMock = {}): Server {
  const retardoLento = opciones.retardoLentoMs ?? 6000;
  const leerEstudiantes = crearLectorEstudiantes(opciones.archivoEstudiantes ?? ARCHIVO_ESTUDIANTES);
  let solicitudes: number[] = [];

  function enviar(res: ServerResponse, status: number, cuerpo: unknown, headers: Record<string, string> = {}) {
    const datos = Buffer.from(JSON.stringify(cuerpo), 'utf8');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': datos.length, ...headers });
    res.end(datos);
  }

  function error(res: ServerResponse, status: number, codigo: string, mensaje: string, extra: { detalle?: string; headers?: Record<string, string> } = {}) {
    enviar(
      res,
      status,
      { codigo, mensaje, ...(extra.detalle ? { detalle: extra.detalle } : {}), trace_id: randomBytes(6).toString('hex') },
      extra.headers,
    );
  }

  function autorizado(req: IncomingMessage, res: ServerResponse): boolean {
    const auth = req.headers.authorization ?? '';
    if (auth === `Bearer ${TOKEN}`) return true;
    if (auth === `Bearer ${TOKEN_SIN_SCOPE}`) {
      error(res, 403, 'SIN_PERMISO', 'El cliente no tiene permiso para esta consulta.');
    } else {
      error(res, 401, 'NO_AUTENTICADO', 'Token ausente o inválido.', {
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      });
    }
    return false;
  }

  function dentroDelLimite(res: ServerResponse): boolean {
    const ahora = Date.now();
    solicitudes = solicitudes.filter((t) => t > ahora - 60_000);
    if (solicitudes.length >= LIMITE_POR_MINUTO) {
      error(res, 429, 'LIMITE_EXCEDIDO', `Límite de ${LIMITE_POR_MINUTO} solicitudes por minuto excedido.`, {
        headers: { 'Retry-After': '60' },
      });
      return false;
    }
    solicitudes.push(ahora);
    return true;
  }

  async function estado(res: ServerResponse, cedulaCruda: string) {
    if (!CEDULA_RE.test(cedulaCruda)) {
      return error(res, 400, 'CEDULA_INVALIDA', 'Formato de cédula inválido.', { detalle: 'Formato esperado: 8-123-456' });
    }
    const cedula = normalizar(cedulaCruda);
    if (cedula === CEDULA_503) {
      return error(res, 503, 'ORIGEN_NO_DISPONIBLE', 'El sistema de matrícula no está disponible.', {
        headers: { 'Retry-After': '30' },
      });
    }
    if (cedula === CEDULA_LENTA) await esperar(retardoLento);
    const estudiantes = leerEstudiantes();
    const est = estudiantes.get(cedula) ?? (cedula === CEDULA_LENTA ? estudiantes.values().next().value : undefined);
    if (!est) return error(res, 404, 'ESTUDIANTE_NO_ENCONTRADO', 'No se encontró al estudiante.');
    const consultadoEn = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 19) + '-05:00';
    enviar(res, 200, {
      cedula,
      nombre: est.nombre,
      activo: est.activo,
      matriculado: est.activo,
      ...(est.sede ? { sede: est.sede } : {}),
      ...(est.facultad ? { facultad: est.facultad } : {}),
      ...(est.carrera ? { carrera: est.carrera } : {}),
      periodo: est.periodo ?? PERIODO,
      consultado_en: consultadoEn,
    });
  }

  async function leerCuerpo(req: IncomingMessage): Promise<string> {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    return Buffer.concat(partes).toString('utf8');
  }

  return createServer(async (req, res) => {
    try {
      if (opciones.latenciaMs) {
        const [min, max] = opciones.latenciaMs;
        await esperar(min + Math.random() * (max - min));
      }
      const ruta = (req.url ?? '').split('?')[0]!;

      if (req.method === 'POST' && ruta === `${BASE}/auth/token`) {
        const form = new URLSearchParams(await leerCuerpo(req));
        if (form.get('grant_type') !== 'client_credentials') {
          return error(res, 400, 'SOLICITUD_INVALIDA', 'grant_type debe ser client_credentials');
        }
        if (form.get('client_id') !== CREDENCIALES_MOCK.clientId || form.get('client_secret') !== CREDENCIALES_MOCK.clientSecret) {
          return error(res, 401, 'NO_AUTENTICADO', 'Credenciales de cliente inválidas.');
        }
        return enviar(res, 200, { access_token: TOKEN, token_type: 'Bearer', expires_in: 3600, scope: 'estudiantes.estado:read' });
      }

      const porCedula = new RegExp(`^${BASE}/estudiantes/([^/]+)/estado$`).exec(ruta);
      if (req.method === 'GET' && porCedula) {
        if (autorizado(req, res) && dentroDelLimite(res)) await estado(res, decodeURIComponent(porCedula[1]!));
        return;
      }

      if (req.method === 'POST' && ruta === `${BASE}/estudiantes/validar-carne`) {
        if (!autorizado(req, res) || !dentroDelLimite(res)) return;
        let tokenQr: unknown;
        try {
          tokenQr = (JSON.parse((await leerCuerpo(req)) || '{}') as { token_qr?: unknown }).token_qr;
        } catch {
          tokenQr = undefined;
        }
        const cedula = typeof tokenQr === 'string' ? decodificarQr(tokenQr) : null;
        if (!cedula) return error(res, 400, 'QR_INVALIDO', 'El token QR no se pudo decodificar.');
        return estado(res, cedula);
      }

      error(res, 404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada.');
    } catch {
      if (!res.headersSent) error(res, 500, 'ERROR_INTERNO', 'Error interno del servidor.');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const puerto = Number(process.argv[2] ?? process.env.MOCK_PUERTO ?? 8090);
  const rango = process.env.MOCK_LATENCIA_MS?.split('-').map(Number);
  const latenciaMs = rango && rango.length === 2 && rango.every(Number.isFinite) ? (rango as [number, number]) : undefined;
  crearMockUtp({ latenciaMs }).listen(puerto, () => {
    console.log(`Mock API UTP escuchando en http://localhost:${puerto}${BASE}`);
    console.log(`Estudiantes: ${ARCHIVO_ESTUDIANTES} (los cambios se aplican sin reiniciar)`);
    console.log(`Credenciales: client_id=${CREDENCIALES_MOCK.clientId} client_secret=${CREDENCIALES_MOCK.clientSecret}`);
  });
}
