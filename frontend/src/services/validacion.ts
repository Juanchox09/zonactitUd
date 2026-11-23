import type { Criterio, ResultadoValidacion, Titular } from '../types';
import { normalizarCedula } from '../utils/cedula';
import { cedulaDeTokenQr } from '../utils/qr';
import datosDemo from './datos-demo.json';

export interface ServicioValidacion {
  readonly modo: 'demo' | 'api';
  validar(criterio: Criterio): Promise<ResultadoValidacion>;
  /** true si el servidor responde. Se usa en la pantalla de bienvenida. */
  comprobarConexion(): Promise<boolean>;
}

/**
 * Por qué falló una consulta. La interfaz los muestra distinto:
 *  - no-verificado: el sistema de la UTP no respondió (503, timeout, sin conexión). NO significa inactivo.
 *  - limite: demasiadas consultas seguidas (429).
 *  - solicitud: el dato enviado no es válido (400), p. ej. un QR que no es de un carné UTP.
 */
export type TipoError = 'no-verificado' | 'limite' | 'solicitud';

export class ErrorValidacion extends Error {
  readonly tipo: TipoError;
  constructor(mensaje: string, tipo: TipoError) {
    super(mensaje);
    this.tipo = tipo;
  }
}

/** El backend espera hasta 5 s a la API de la UTP; este margen cubre esa espera. */
const TIMEOUT_MS = 12_000;

/**
 * Contrato de la API (ver README de la raíz):
 *   GET {VITE_API_URL}/carnets/validar?cedula=8-123-456
 *   GET {VITE_API_URL}/carnets/validar?qr=<contenido del QR del carné UTP>
 *   200 → Titular   404 → no existe   400/429/503 → { error }
 */
function crearServicioApi(baseUrl: string): ServicioValidacion {
  return {
    modo: 'api',
    async comprobarConexion() {
      try {
        const respuesta = await fetch(`${baseUrl}/salud`, { signal: AbortSignal.timeout(4000) });
        return respuesta.ok;
      } catch {
        return false;
      }
    },
    async validar(criterio) {
      const url = `${baseUrl}/carnets/validar?${new URLSearchParams({ [criterio.tipo]: criterio.valor })}`;
      let respuesta: Response;
      try {
        respuesta = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new ErrorValidacion('El servidor de validación no respondió a tiempo.', 'no-verificado');
        }
        throw new ErrorValidacion('No hay conexión con el servidor de validación. Revisa el internet del equipo.', 'no-verificado');
      }
      if (respuesta.status === 404) return { criterio, titular: null, consultadoEn: new Date() };
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as { error?: unknown } | null;
        const mensaje = typeof cuerpo?.error === 'string' ? cuerpo.error : `El servidor respondió con un error (${respuesta.status}).`;
        const tipo: TipoError = respuesta.status === 429 ? 'limite' : respuesta.status < 500 ? 'solicitud' : 'no-verificado';
        throw new ErrorValidacion(mensaje, tipo);
      }
      const titular = (await respuesta.json()) as Titular;
      return { criterio, titular, consultadoEn: new Date() };
    },
  };
}

export const TITULARES_DEMO = datosDemo as Titular[];

/** En modo demostración, esta cédula simula que el sistema de matrícula está caído. */
export const CEDULA_DEMO_SIN_SERVICIO = '8-500-500';

const servicioDemo: ServicioValidacion = {
  modo: 'demo',
  async comprobarConexion() {
    return true;
  },
  async validar(criterio) {
    await new Promise((resolver) => setTimeout(resolver, 700));
    if (criterio.tipo === 'carnet') {
      throw new ErrorValidacion('La UTP no permite consultar por código de carnet. Usa la cédula o el QR del carné.', 'solicitud');
    }
    const cedula = criterio.tipo === 'qr' ? cedulaDeTokenQr(criterio.valor) : criterio.valor;
    if (!cedula) throw new ErrorValidacion('El código QR del carné no es válido.', 'solicitud');
    if (cedula === CEDULA_DEMO_SIN_SERVICIO) {
      throw new ErrorValidacion('El sistema de matrícula de la UTP no está disponible en este momento.', 'no-verificado');
    }
    const titular = TITULARES_DEMO.find((t) => normalizarCedula(t.cedula) === cedula) ?? null;
    return { criterio, titular, consultadoEn: new Date() };
  },
};

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

export const servicioValidacion: ServicioValidacion = apiUrl ? crearServicioApi(apiUrl) : servicioDemo;
