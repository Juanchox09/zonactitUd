import { aplicarVigencia } from './estado.ts';
import { cedulaDeTokenQr } from './identificadores.ts';
import type { RepositorioTitulares } from './repositorio.ts';
import type { Criterio, Fuente, Titular } from './tipos.ts';

export interface ResultadoConsulta {
  fuente: Fuente;
  /** null cuando no existe un carnet asociado. */
  titular: Titular | null;
  /** id en la base local, para la bitácora. */
  titularId: number | null;
}

/** De dónde sale el estado del titular: la base local o la API de la UTP. */
export interface OrigenDatos {
  readonly nombre: Fuente;
  consultar(criterio: Criterio): Promise<ResultadoConsulta>;
}

/** La consulta está mal formada (p. ej. QR que no se puede decodificar) → 400. */
export class ErrorSolicitud extends Error {}

/**
 * No se pudo determinar el estado (servicio caído, timeout, límite excedido…) → 503.
 * Nunca debe interpretarse como "inactivo".
 */
export class ErrorNoVerificado extends Error {
  readonly reintentarEnSegundos: number | undefined;
  constructor(mensaje: string, reintentarEnSegundos?: number) {
    super(mensaje);
    this.reintentarEnSegundos = reintentarEnSegundos;
  }
}

export const MENSAJE_QR_INVALIDO = 'El código QR del carné no es válido.';

/** Consulta solo la base SQLite local. */
export class OrigenLocal implements OrigenDatos {
  readonly nombre = 'local' as const;
  private readonly repositorio: RepositorioTitulares;
  private readonly hoy: () => string;

  constructor(repositorio: RepositorioTitulares, hoy: () => string) {
    this.repositorio = repositorio;
    this.hoy = hoy;
  }

  async consultar(criterio: Criterio): Promise<ResultadoConsulta> {
    let busqueda: { tipo: 'cedula' | 'carnet'; valor: string };
    if (criterio.tipo === 'qr') {
      const cedula = cedulaDeTokenQr(criterio.valor);
      if (!cedula) throw new ErrorSolicitud(MENSAJE_QR_INVALIDO);
      busqueda = { tipo: 'cedula', valor: cedula };
    } else {
      busqueda = { tipo: criterio.tipo, valor: criterio.valor };
    }
    const encontrado = this.repositorio.buscar(busqueda);
    return encontrado
      ? { fuente: 'local', titular: aplicarVigencia(encontrado.titular, this.hoy()), titularId: encontrado.id }
      : { fuente: 'local', titular: null, titularId: null };
  }
}
