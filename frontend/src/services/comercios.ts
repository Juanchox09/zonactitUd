/**
 * Tiendas afiliadas.
 *   GET {VITE_API_URL}/comercios                       lista para el admin (elige en qué tienda valida)
 *   GET {VITE_API_URL}/validacion/tienda[?comercio_id] tienda de la sesión, ofertas de hoy y la que se aplicará
 */
import type { OfertaPanel } from './panel';
import { ErrorSesion } from './sesion';

export interface Oferta {
  id: number;
  tipo: 'porcentaje' | '2x1' | 'otro';
  porcentaje: number;
  descripcion: string;
}

export interface Comercio {
  id: number;
  nombre: string;
  categoria: string;
  /** La primera es la principal: la que se aplica al validar. */
  descuentos: Oferta[];
}

const apiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');

export const tiendasDisponibles = Boolean(apiUrl);

export async function listarComercios(senal?: AbortSignal): Promise<Comercio[]> {
  const respuesta = await fetch(`${apiUrl}/comercios`, { headers: { Accept: 'application/json' }, signal: senal });
  if (!respuesta.ok) throw new Error(`El servidor respondió con un error (${respuesta.status}).`);
  const comercios = (await respuesta.json()) as Comercio[];
  return comercios.filter((c) => c.descuentos.length > 0);
}

export interface TiendaValidacion {
  id: number;
  nombre: string;
  categoria: string;
  activo: boolean;
  /** Ofertas vigentes hoy; la principal va primero. */
  ofertas: OfertaPanel[];
  /** La oferta que el servidor aplicará automáticamente al validar a un estudiante activo. */
  aplicada: number | null;
}

export async function tiendaDeValidacion(token: string, comercioId?: number, senal?: AbortSignal): Promise<TiendaValidacion> {
  const consulta = comercioId ? `?comercio_id=${comercioId}` : '';
  const respuesta = await fetch(`${apiUrl}/validacion/tienda${consulta}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: senal,
  });
  if (respuesta.status === 401) throw new ErrorSesion('Tu sesión venció. Vuelve a iniciar sesión.');
  const cuerpo = (await respuesta.json().catch(() => null)) as unknown;
  if (!respuesta.ok) {
    const mensaje = (cuerpo as { error?: unknown } | null)?.error;
    throw new Error(typeof mensaje === 'string' ? mensaje : `El servidor respondió con un error (${respuesta.status}).`);
  }
  return cuerpo as TiendaValidacion;
}

export const textoOferta = (o: Oferta) => (o.tipo === '2x1' ? '2x1' : `${o.porcentaje} %`);

/* Solo para el admin, que no tiene tienda propia: la tienda elegida se recuerda en este equipo. */
const CLAVE_TIENDA = 'actitud.tienda';

export function tiendaGuardada(): number | null {
  try {
    const valor = Number(localStorage.getItem(CLAVE_TIENDA));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

export function guardarTienda(id: number | null) {
  try {
    if (id) localStorage.setItem(CLAVE_TIENDA, String(id));
    else localStorage.removeItem(CLAVE_TIENDA);
  } catch {
    /* sin almacenamiento: se pedirá la tienda de nuevo al recargar */
  }
}
