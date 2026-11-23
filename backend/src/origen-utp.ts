/**
 * Integración con la API de Estado de Estudiante de la UTP
 * (contrato provisional en ../api-estudiante-mock/openapi.yaml).
 *
 *   POST {base}/auth/token                  OAuth2 client_credentials
 *   GET  {base}/estudiantes/{cedula}/estado
 *   POST {base}/estudiantes/validar-carne   { token_qr }
 *
 * Reglas del contrato que se respetan aquí:
 *   - 200 con activo=false es "inactivo", no un error.
 *   - 500, 503, 429 y timeout (5 s) son "no se pudo verificar", nunca "inactivo".
 *   - Límite de 60 solicitudes por minuto por cliente: se aplica un límite propio por debajo
 *     y una caché corta para no repetir la misma consulta (p. ej. el mismo QR escaneado dos veces).
 */
import { aplicarVigencia } from './estado.ts';
import { ErrorNoVerificado, ErrorSolicitud, MENSAJE_QR_INVALIDO, type OrigenDatos, type ResultadoConsulta } from './origen.ts';
import type { RepositorioTitulares } from './repositorio.ts';
import type { Criterio, Periodo, Titular } from './tipos.ts';

export interface EstudianteUtp {
  cedula: string;
  nombre: string;
  activo: boolean;
  matriculado: boolean;
  sede?: string;
  facultad?: string;
  carrera?: string;
  periodo: Periodo;
  consultado_en: string;
}

export interface OpcionesClienteUtp {
  /** p. ej. http://localhost:8090/api/v1 */
  urlBase: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  limitePorMinuto: number;
  cacheSegundos: number;
  log?: Pick<Console, 'warn' | 'error'>;
  /** Inyectables para pruebas. */
  fetch?: typeof fetch;
  ahora?: () => number;
}

type Registro = { expira: number; valor: EstudianteUtp | null };

export class ClienteUtp {
  private readonly o: OpcionesClienteUtp;
  private readonly fetch: typeof fetch;
  private readonly ahora: () => number;
  private readonly log: Pick<Console, 'warn' | 'error'>;
  private token: { valor: string; expira: number } | null = null;
  private tokenEnCurso: Promise<string> | null = null;
  private solicitudesRecientes: number[] = [];
  private readonly cache = new Map<string, Registro>();

  constructor(opciones: OpcionesClienteUtp) {
    this.o = { ...opciones, urlBase: opciones.urlBase.replace(/\/+$/, '') };
    this.fetch = opciones.fetch ?? globalThis.fetch;
    this.ahora = opciones.ahora ?? Date.now;
    this.log = opciones.log ?? console;
  }

  consultarPorCedula(cedula: string): Promise<EstudianteUtp | null> {
    return this.conCache(`c:${cedula}`, () =>
      this.solicitar(`/estudiantes/${encodeURIComponent(cedula)}/estado`, { method: 'GET' }),
    );
  }

  validarCarne(tokenQr: string): Promise<EstudianteUtp | null> {
    return this.conCache(`q:${tokenQr}`, () =>
      this.solicitar('/estudiantes/validar-carne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_qr: tokenQr }),
      }),
    );
  }

  private async conCache(clave: string, consultar: () => Promise<EstudianteUtp | null>) {
    const ahora = this.ahora();
    const registro = this.cache.get(clave);
    if (registro && registro.expira > ahora) return registro.valor;

    const valor = await consultar();
    if (this.o.cacheSegundos > 0) {
      if (this.cache.size >= 1000) {
        for (const [k, r] of this.cache) if (r.expira <= ahora) this.cache.delete(k);
        if (this.cache.size >= 1000) this.cache.clear();
      }
      this.cache.set(clave, { expira: ahora + this.o.cacheSegundos * 1000, valor });
    }
    return valor;
  }

  /** Ventana deslizante de 60 s, por debajo del límite de la API. */
  private reservarCupo(): void {
    const ahora = this.ahora();
    this.solicitudesRecientes = this.solicitudesRecientes.filter((t) => t > ahora - 60_000);
    if (this.solicitudesRecientes.length >= this.o.limitePorMinuto) {
      const espera = Math.ceil((this.solicitudesRecientes[0]! + 60_000 - ahora) / 1000);
      throw new ErrorNoVerificado(
        `Hay demasiadas consultas al servicio de la UTP en este momento. Intenta de nuevo en ${espera} s.`,
        espera,
      );
    }
    this.solicitudesRecientes.push(ahora);
  }

  private async solicitar(ruta: string, init: RequestInit, reintento = false): Promise<EstudianteUtp | null> {
    if (!reintento) this.reservarCupo();
    const token = await this.obtenerToken();
    const respuesta = await this.llamar(ruta, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (respuesta.status === 200) return this.leerEstudiante(respuesta);
    if (respuesta.status === 404) return null;

    const error = await leerError(respuesta);
    if (respuesta.status === 401 && !reintento) {
      // Token expirado o revocado: se pide uno nuevo una sola vez.
      this.token = null;
      return this.solicitar(ruta, init, true);
    }
    if (respuesta.status === 400) {
      throw new ErrorSolicitud(
        error?.codigo === 'QR_INVALIDO' ? MENSAJE_QR_INVALIDO : (error?.mensaje ?? 'Solicitud no válida.'),
      );
    }

    const reintentarEn = Number(respuesta.headers.get('retry-after')) || undefined;
    if (respuesta.status === 401 || respuesta.status === 403) {
      this.log.error(`API UTP rechazó las credenciales del sistema (${respuesta.status} ${error?.codigo ?? ''})`);
      throw new ErrorNoVerificado('El sistema no tiene acceso al servicio de la UTP. Avisa al administrador.');
    }
    if (respuesta.status === 429) {
      throw new ErrorNoVerificado('El servicio de la UTP está saturado. Intenta de nuevo en unos segundos.', reintentarEn);
    }
    if (respuesta.status === 503) {
      throw new ErrorNoVerificado('El sistema de matrícula de la UTP no está disponible en este momento.', reintentarEn);
    }
    this.log.warn(`API UTP respondió ${respuesta.status} ${error?.codigo ?? ''} (trace_id ${error?.trace_id ?? '-'})`);
    throw new ErrorNoVerificado('El servicio de la UTP respondió con un error. No se pudo verificar el estado.');
  }

  private obtenerToken(): Promise<string> {
    if (this.token && this.token.expira > this.ahora()) return Promise.resolve(this.token.valor);
    // Varias consultas simultáneas comparten la misma solicitud de token.
    this.tokenEnCurso ??= this.pedirToken().finally(() => (this.tokenEnCurso = null));
    return this.tokenEnCurso;
  }

  private async pedirToken(): Promise<string> {
    const respuesta = await this.llamar('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.o.clientId,
        client_secret: this.o.clientSecret,
      }).toString(),
    });
    const datos = (await respuesta.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (respuesta.status !== 200 || typeof datos?.access_token !== 'string') {
      this.log.error(`API UTP no emitió token (${respuesta.status}). Revisa UTP_CLIENT_ID y UTP_CLIENT_SECRET.`);
      throw new ErrorNoVerificado('El sistema no pudo autenticarse con el servicio de la UTP. Avisa al administrador.');
    }
    const segundos = typeof datos.expires_in === 'number' ? datos.expires_in : 300;
    // Se renueva 60 s antes de que venza.
    this.token = { valor: datos.access_token, expira: this.ahora() + Math.max(segundos - 60, 10) * 1000 };
    return this.token.valor;
  }

  private async llamar(ruta: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(`${this.o.urlBase}${ruta}`, { ...init, signal: AbortSignal.timeout(this.o.timeoutMs) });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new ErrorNoVerificado('El servicio de la UTP no respondió a tiempo. No se pudo verificar el estado.');
      }
      this.log.warn(`No se pudo conectar con la API UTP: ${error instanceof Error ? error.message : String(error)}`);
      throw new ErrorNoVerificado('No se pudo conectar con el servicio de la UTP. No se pudo verificar el estado.');
    }
  }

  private async leerEstudiante(respuesta: Response): Promise<EstudianteUtp> {
    const d = (await respuesta.json().catch(() => null)) as Partial<EstudianteUtp> | null;
    if (
      !d ||
      typeof d.cedula !== 'string' ||
      typeof d.nombre !== 'string' ||
      typeof d.activo !== 'boolean' ||
      typeof d.periodo?.anio !== 'number' ||
      typeof d.periodo?.semestre !== 'number'
    ) {
      this.log.error('API UTP devolvió un cuerpo que no cumple el contrato EstadoEstudiante.');
      throw new ErrorNoVerificado('El servicio de la UTP devolvió una respuesta inesperada. No se pudo verificar el estado.');
    }
    return d as EstudianteUtp;
  }
}

async function leerError(respuesta: Response): Promise<{ codigo?: string; mensaje?: string; trace_id?: string } | null> {
  try {
    return (await respuesta.json()) as { codigo?: string; mensaje?: string; trace_id?: string };
  } catch {
    return null;
  }
}

export function estudianteATitular(e: EstudianteUtp): Titular {
  return {
    nombre: e.nombre,
    cedula: e.cedula,
    tipo: 'Estudiante',
    unidad: e.facultad ?? e.sede ?? 'Universidad Tecnológica de Panamá',
    ...(e.carrera ? { programa: e.carrera } : {}),
    ...(e.sede ? { sede: e.sede } : {}),
    // El contrato define activo = matriculado en el periodo vigente.
    estado: e.activo ? 'ACTIVO' : 'INACTIVO',
    periodo: { anio: e.periodo.anio, semestre: e.periodo.semestre },
    ...(e.activo ? {} : { motivo: 'No matriculado en el periodo vigente' }),
    fuente: 'utp',
  };
}

/**
 * Estudiantes → API UTP. Colaboradores y egresados → base local (la API UTP solo cubre estudiantes).
 * La búsqueda por código de carnet solo existe en la base local; si el código es de un estudiante,
 * su estado se confirma en la API UTP con su cédula.
 */
export class OrigenUtp implements OrigenDatos {
  readonly nombre = 'utp' as const;
  private readonly cliente: ClienteUtp;
  private readonly repositorio: RepositorioTitulares;
  private readonly hoy: () => string;

  constructor(cliente: ClienteUtp, repositorio: RepositorioTitulares, hoy: () => string) {
    this.cliente = cliente;
    this.repositorio = repositorio;
    this.hoy = hoy;
  }

  async consultar(criterio: Criterio): Promise<ResultadoConsulta> {
    if (criterio.tipo === 'qr') return this.desdeUtp(await this.cliente.validarCarne(criterio.valor));

    const local = this.repositorio.buscar({ tipo: criterio.tipo, valor: criterio.valor });
    if (local && local.titular.tipo !== 'Estudiante') {
      return { fuente: 'local', titular: aplicarVigencia(local.titular, this.hoy()), titularId: local.id };
    }

    if (criterio.tipo === 'carnet') {
      if (!local) return { fuente: 'local', titular: null, titularId: null };
      const estudiante = await this.cliente.consultarPorCedula(local.titular.cedula);
      return estudiante
        ? { fuente: 'utp', titular: { ...estudianteATitular(estudiante), carnet: local.titular.carnet }, titularId: local.id }
        : { fuente: 'utp', titular: null, titularId: null };
    }

    return this.desdeUtp(await this.cliente.consultarPorCedula(criterio.valor));
  }

  private desdeUtp(estudiante: EstudianteUtp | null): ResultadoConsulta {
    return { fuente: 'utp', titular: estudiante ? estudianteATitular(estudiante) : null, titularId: null };
  }
}
